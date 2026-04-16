import { createClient } from '@/lib/supabase/server'
import { getProjectsWithMetrics, createProject } from '@/lib/services/projects.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projects = await getProjectsWithMetrics(user.id)
    
    // Obtener el rol del usuario en su organización activa para el frontend
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    return Response.json({ 
      projects,
      role: membership?.role || 'user'
    })
  } catch (error) {
    console.error('Error in GET /api/projects:', error)
    return Response.json(
      { error: 'Error al obtener proyectos' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      name, region, comuna, descripcion, total_lotes, 
      lotPrefix, precio, valor_reserva,
      images, doc_dominio_vigente, doc_hipoteca_gravamen,
      doc_roles, doc_subdivision, doc_plano_oficial, doc_otros
    } = body

    if (!name || !region || !comuna || !total_lotes) {
      return Response.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      )
    }

    if (total_lotes < 1) {
      return Response.json(
        { error: 'total_lotes debe ser mayor a 0' },
        { status: 400 }
      )
    }

    const result = await createProject(
      {
        name,
        region,
        comuna,
        descripcion,
        total_lotes: Number(total_lotes),
        lotPrefix,
        precio,
        valor_reserva,
        images,
        doc_dominio_vigente,
        doc_hipoteca_gravamen,
        doc_roles,
        doc_subdivision,
        doc_plano_oficial,
        doc_otros,
      },
      user.id
    )

    return Response.json({
      project: result.project,
      lots: result.lots,
      message: `Proyecto creado con ${result.lots.length} lotes`,
    })
  } catch (error) {
    console.error('Error in POST /api/projects:', error)
    return Response.json(
      { error: 'Error al crear proyecto' },
      { status: 500 }
    )
  }
}
