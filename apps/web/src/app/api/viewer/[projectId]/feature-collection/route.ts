import { getFeatureCollection } from '@/lib/services/viewer.service'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    if (!projectId) {
      return Response.json({ error: 'projectId es requerido' }, { status: 400 })
    }

    const featureCollection = await getFeatureCollection(projectId)
    return Response.json(featureCollection)
  } catch (error) {
    console.error('Error in GET /api/viewer/[projectId]/feature-collection:', error)
    return Response.json(
      { error: 'Error al obtener geometrías del visor' },
      { status: 500 }
    )
  }
}
