import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getFeatureCollection } from '@/lib/services/viewer.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    if (!projectId) {
      return Response.json({ error: 'projectId es requerido' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient(request)
    const featureCollection = await getFeatureCollection(projectId, supabase)
    return Response.json(featureCollection)
  } catch (error) {
    console.error('Error in GET /api/viewer/[projectId]/feature-collection:', error)
    return Response.json({ error: 'Error al obtener geometrías del visor' }, { status: 500 })
  }
}
