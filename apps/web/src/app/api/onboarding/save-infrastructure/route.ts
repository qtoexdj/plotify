import { saveInfrastructure } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'
import { infrastructureGeometrySchema } from '@/lib/validations/geometry-operation.schema'
import {
  authorizeGeometryOperation,
  claimGeometryOperation,
  completeGeometryOperation,
} from '@/lib/services/geometry-operation.service'
import { canonicalRequestHash } from '@/lib/idempotency/operations'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const parsed = infrastructureGeometrySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success)
      return Response.json({ error: 'INVALID_GEOMETRY_OPERATION' }, { status: 400 })
    const context = await authorizeGeometryOperation(request, parsed.data.projectId)
    if (!context) return Response.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 404 })
    const { operation, requestHash } = await claimGeometryOperation(
      context,
      'geometry.derive',
      parsed.data.idempotencyKey,
      parsed.data
    )
    if (operation.status === 'succeeded') return Response.json(operation.response_summary)
    const sourceHash = (
      await canonicalRequestHash([...parsed.data.sourceGeometryIds].sort())
    ).replace('sha256:', '')
    const configHash = (await canonicalRequestHash(parsed.data.config)).replace('sha256:', '')
    const geometry = await saveInfrastructure(
      {
        ...parsed.data,
        name: typeof parsed.data.config.name === 'string' ? parsed.data.config.name : undefined,
        inputMode: parsed.data.config.inputMode as 'centerline' | 'footprint' | 'edge' | undefined,
        widthM:
          typeof parsed.data.config.widthM === 'number' ? parsed.data.config.widthM : undefined,
        edgeSide: parsed.data.config.edgeSide as 'left' | 'right' | 'both' | undefined,
      },
      context.service,
      {
        organizationId: context.project.organization_id,
        operationId: operation.id,
        sourceHash,
        configHash,
      }
    )
    const response = { message: 'Infraestructura guardada correctamente', geometry }
    await completeGeometryOperation(
      context,
      operation.id,
      requestHash,
      'geometry_derivations',
      null,
      response
    )
    return Response.json(response)
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'INFRASTRUCTURE_COMMIT_FAILED' },
      { status: 500 }
    )
  }
}
