import { getGeometriesByProject } from '@/lib/services/onboarding.service'
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
    const { searchParams } = new URL(request.url)
    const unassigned = searchParams.get('unassigned') === 'true'

    const geometries = await getGeometriesByProject(projectId, unassigned, context.service)

    return Response.json({
      geometries,
      count: geometries.length,
    })
  } catch (error) {
    console.error('Error in GET /api/onboarding/[projectId]/geometries:', error)
    return Response.json({ error: 'Error al obtener geometrías' }, { status: 500 })
  }
}
