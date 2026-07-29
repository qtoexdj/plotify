import { NextRequest } from 'next/server'
import {
  authorizeGeometryOperation,
  claimGeometryOperation,
  completeGeometryOperation,
} from '@/lib/services/geometry-operation.service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null)
    const projectId = typeof payload?.projectId === 'string' ? payload.projectId : null
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
    if (!projectId || !idempotencyKey)
      return Response.json({ error: 'INVALID_GEOMETRY_OPERATION' }, { status: 400 })
    const context = await authorizeGeometryOperation(request, projectId)
    if (!context) return Response.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 404 })
    const { operation, requestHash } = await claimGeometryOperation(
      context,
      'geometry.recalculate',
      idempotencyKey,
      { projectId }
    )
    if (operation.status === 'succeeded') return Response.json(operation.response_summary)
    const { data, error } = await context.service
      .from('geometry_enrichment_jobs')
      .update({
        status: 'pending',
        available_at: new Date().toISOString(),
        lease_owner: null,
        lease_expires_at: null,
        last_error_code: null,
      })
      .eq('project_id', projectId)
      .in('status', ['retry_scheduled', 'dead_letter'])
      .select('id')
    if (error) throw new Error('ENRICHMENT_RETRY_FAILED')
    const response = {
      message: 'Reintento de enriquecimiento programado',
      projectId,
      jobsScheduled: data?.length ?? 0,
      enrichmentStatus: 'pending',
    }
    await completeGeometryOperation(
      context,
      operation.id,
      requestHash,
      'projects',
      projectId,
      response
    )
    return Response.json(response, { status: 202 })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'ENRICHMENT_RETRY_FAILED' },
      { status: 500 }
    )
  }
}
