import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * US5: Proxy web que valida la autorización del administrador del proyecto
 * y reenvía la petición de verificación masiva al microservicio de Python.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const project = await getProjectById(id, user.id, supabase)
    if (!project) {
      return Response.json({ error: 'Proyecto no encontrado' }, { status: 404 })
    }
    if (!project.organization_id) {
      return Response.json({ error: 'Proyecto sin organización asociada' }, { status: 422 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const upstreamParams = new URLSearchParams({
      organization_id: project.organization_id,
    })

    const { data, error, status } = await microserviceFetch(
      `/api/v1/projects/${id}/lots/bulk-verify?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body: {
          tolerance_pct: body.tolerance_pct ?? 0.5,
          admin_id: user.id,
        },
      }
    )

    if (error || !data) {
      return Response.json(
        { error: error || 'Error en la verificación masiva' },
        { status: status || 500 }
      )
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error in POST /api/projects/[id]/lots/bulk-verify:', error)
    return Response.json({ error: 'Error interno en la verificación masiva' }, { status: 500 })
  }
}
