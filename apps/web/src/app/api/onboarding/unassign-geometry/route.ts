import { deleteGeometryByLotId } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'
import {
  authorizeGeometryOperation,
  claimGeometryOperation,
  completeGeometryOperation,
} from '@/lib/services/geometry-operation.service'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const lotId = searchParams.get('lotId')
    const expectedGeometryId = searchParams.get('expectedGeometryId')
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
    if (!projectId || !lotId || !expectedGeometryId || !idempotencyKey)
      return Response.json({ error: 'INVALID_GEOMETRY_OPERATION' }, { status: 400 })
    const context = await authorizeGeometryOperation(request, projectId)
    if (!context) return Response.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 404 })
    const payload = { projectId, lotId, expectedGeometryId }
    const { operation, requestHash } = await claimGeometryOperation(
      context,
      'geometry.unassign',
      idempotencyKey,
      payload
    )
    if (operation.status === 'succeeded') return Response.json(operation.response_summary)
    await deleteGeometryByLotId(lotId, context.service, {
      projectId,
      organizationId: context.project.organization_id,
      actorUserId: context.user.id,
      operationId: operation.id,
      expectedGeometryId,
    })
    const response = { message: 'Geometría desasignada', lotId }
    await completeGeometryOperation(context, operation.id, requestHash, 'lots', lotId, response)
    return Response.json(response)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'LOT_GEOMETRY_CONFLICT' },
      { status: 409 }
    )
  }
}
