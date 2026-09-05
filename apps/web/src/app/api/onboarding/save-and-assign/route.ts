import { saveAndAssignGeometry } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'
import { assignGeometrySchema } from '@/lib/validations/geometry-operation.schema'
import {
  authorizeGeometryOperation,
  claimGeometryOperation,
  completeGeometryOperation,
} from '@/lib/services/geometry-operation.service'

export const dynamic = 'force-dynamic'

/** Los errores del RPC son precondiciones de negocio, no fallas del servidor. */
function assignmentErrorStatus(message: string): number {
  if (/CONFLICT/.test(message)) return 409
  if (/RESOURCE_NOT_FOUND/.test(message)) return 404
  if (/GEOMETRY_NOT_ASSIGNABLE/.test(message)) return 422
  return 500
}

export async function POST(request: NextRequest) {
  try {
    const parsed = assignGeometrySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success)
      return Response.json({ error: 'INVALID_GEOMETRY_OPERATION' }, { status: 400 })
    const context = await authorizeGeometryOperation(request, parsed.data.projectId)
    if (!context) return Response.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 404 })
    const { operation, requestHash } = await claimGeometryOperation(
      context,
      'geometry.assign',
      parsed.data.idempotencyKey,
      parsed.data
    )
    if (operation.status === 'succeeded') return Response.json(operation.response_summary)
    const geometry = await saveAndAssignGeometry(parsed.data, context.service, {
      organizationId: context.project.organization_id,
      actorUserId: context.user.id,
      operationId: operation.id,
    })

    const response = {
      message: 'Geometría asignada correctamente',
      geometry,
    }
    await completeGeometryOperation(
      context,
      operation.id,
      requestHash,
      'geometries',
      parsed.data.geometryId,
      response
    )
    return Response.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al asignar geometría'
    const status = assignmentErrorStatus(message)
    // Un 500 solo cuando la culpa es nuestra: lo demás es una precondición
    // que la persona puede corregir, y merece decirlo en vez de "falló el servidor".
    if (status === 500) console.error('Error in POST /api/onboarding/save-and-assign:', error)
    return Response.json({ error: message, code: message }, { status })
  }
}
