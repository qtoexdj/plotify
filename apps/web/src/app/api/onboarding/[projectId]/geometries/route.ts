import { getGeometriesByProject, deleteGeometryByLotId } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const { searchParams } = new URL(request.url)
    const unassigned = searchParams.get('unassigned') === 'true'

    const geometries = await getGeometriesByProject(projectId, unassigned)

    return Response.json({
      geometries,
      count: geometries.length,
    })
  } catch (error) {
    console.error('Error in GET /api/onboarding/[projectId]/geometries:', error)
    return Response.json({ error: 'Error al obtener geometrías' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await params // projectId disponible si se necesita validar scope futuro
    const { searchParams } = new URL(request.url)
    const lotId = searchParams.get('lotId')

    if (!lotId) {
      return Response.json({ error: 'lotId es requerido' }, { status: 400 })
    }

    await deleteGeometryByLotId(lotId)

    return Response.json({ message: 'Geometría eliminada correctamente' })
  } catch (error) {
    console.error('Error in DELETE /api/onboarding/[projectId]/geometries:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar geometría' },
      { status: 500 }
    )
  }
}
