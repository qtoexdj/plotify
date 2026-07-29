import { getLotsByProject } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'
import { authorizeGeometryOperation } from '@/lib/services/geometry-operation.service'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const context = await authorizeGeometryOperation(request, projectId)
    if (!context) return Response.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 404 })
    const lots = await getLotsByProject(projectId, context.service)

    return Response.json({
      lots,
      count: lots.length,
    })
  } catch (error) {
    console.error('Error in GET /api/onboarding/[projectId]/lots:', error)
    return Response.json({ error: 'Error al obtener lotes' }, { status: 500 })
  }
}
