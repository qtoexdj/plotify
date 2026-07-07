import { createRouteHandlerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * US6: Endpoint proxy seguro que recibe la ruta de un archivo,
 * valida que el usuario pertenezca a la organización del proyecto
 * y redirige a una URL firmada y segura de Supabase Storage.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    if (!path || path.length < 2) {
      return new Response('Ruta no válida', { status: 400 })
    }

    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('No autorizado', { status: 401 })
    }

    const bucket = path[0]
    const filePath = path.slice(1).join('/')

    if (bucket !== 'project-files' && bucket !== 'documents') {
      return new Response('Bucket no permitido', { status: 400 })
    }

    // Validar acceso del usuario a la organización dueña del archivo.
    // project-files: {projectId}/... → resolver organization_id vía projects.
    // documents (minutas): {organizationId}/escritura-minutas/... → ya viene el org id.
    let organizationId: string | null = null
    if (bucket === 'project-files') {
      const projectId = path[1]
      if (!projectId) {
        return new Response('Ruta no válida', { status: 400 })
      }
      const { data: project } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', projectId)
        .maybeSingle()

      if (!project) {
        return new Response('Proyecto no encontrado o sin acceso', { status: 404 })
      }
      organizationId = project.organization_id
    } else {
      organizationId = path[1] ?? null
      if (!organizationId) {
        return new Response('Ruta no válida', { status: 400 })
      }
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) {
      return new Response('No tienes permisos para acceder a este archivo', { status: 403 })
    }

    // Generar URL firmada de corta duración (60 segundos)
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60)

    if (error || !data?.signedUrl) {
      return new Response('Error al obtener el archivo', { status: 404 })
    }

    return NextResponse.redirect(data.signedUrl)
  } catch (error) {
    console.error('Error in GET /api/files:', error)
    return new Response('Error interno del servidor', { status: 500 })
  }
}
