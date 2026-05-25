import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getLotsWithRecords } from '@/lib/services/lots.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Obtener el proyecto para saber su organización
    const { data: project } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', id)
      .single()

    let filterVendorId: string | undefined

    if (project?.organization_id) {
      // 2. Verificar rol del usuario en la organización
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', project.organization_id)
        .eq('user_id', user.id)
        .maybeSingle()

      // 3. Si no es admin, filtrar por su ID
      if (membership?.role !== 'admin') {
        filterVendorId = user.id
      }
    }

    const lots = await getLotsWithRecords(id, filterVendorId, supabase)
    return Response.json({ lots })
  } catch (error) {
    console.error('Error in GET /api/projects/[id]/lots:', error)
    return Response.json({ error: 'Error al obtener lotes' }, { status: 500 })
  }
}
