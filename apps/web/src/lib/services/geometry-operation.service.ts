import type { NextRequest } from 'next/server'
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase/server'
import { canonicalRequestHash } from '@/lib/idempotency/operations'

export async function authorizeGeometryOperation(request: NextRequest, projectId: string) {
  const session = createRouteHandlerClient(request)
  const {
    data: { user },
  } = await session.auth.getUser()
  if (!user) return null
  const { data: project } = await session
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return null
  const { data: membership } = await session
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'admin') return null
  return { user, project, session, service: createServiceClient() }
}

export async function claimGeometryOperation(
  context: NonNullable<Awaited<ReturnType<typeof authorizeGeometryOperation>>>,
  operationType:
    'geometry.assign' | 'geometry.unassign' | 'geometry.derive' | 'geometry.recalculate',
  idempotencyKey: string,
  payload: unknown
) {
  const requestHash = (await canonicalRequestHash(payload)).replace('sha256:', '')
  const { data, error } = await context.service.rpc('claim_idempotency_operation', {
    p_organization_id: context.project.organization_id,
    p_principal_type: 'user',
    p_principal_subject: context.user.id,
    p_operation_type: operationType,
    p_resource_scope: `project:${context.project.id}`,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_source_kind: 'web',
    p_provider_event_key: null,
  })
  if (error || !data) {
    // Un conflicto real de idempotencia es 23505 (misma clave, payload distinto).
    // Cualquier otro fallo del claim —FK, timeout, permisos— se reportaba también
    // como conflicto, devolvía un 409 engañoso y borraba la causa real.
    console.error('[Geometría] claim_idempotency_operation falló:', error ?? 'sin datos')
    const isConflict = error?.code === '23505' || /IDEMPOTENCY_CONFLICT/.test(error?.message ?? '')
    throw new Error(
      isConflict
        ? 'IDEMPOTENCY_CONFLICT'
        : `OPERATION_CLAIM_FAILED: ${error?.message ?? 'sin datos'}`
    )
  }
  return { operation: data, requestHash }
}

export async function completeGeometryOperation(
  context: NonNullable<Awaited<ReturnType<typeof authorizeGeometryOperation>>>,
  operationId: string,
  requestHash: string,
  resourceType: string,
  resourceId: string | null,
  response: Record<string, unknown>
) {
  const { error } = await context.service.rpc('complete_idempotency_operation', {
    p_operation_id: operationId,
    p_request_hash: requestHash,
    p_status: 'succeeded',
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_response_summary: response,
    p_error_code: null,
  })
  if (error) throw new Error('OPERATION_COMPLETION_FAILED')
}
