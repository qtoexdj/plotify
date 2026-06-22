import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * SDD 011 (A4): fija el valor de una variable de proyecto por su clave,
 * creando la fila si no existe (variables de autoría/manuales: plano CBR,
 * mandatario). Reenvía al microservicio con el scope de la organización.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    if (
      !isLegalDocumentsFeatureEnabled({
        organizationId: project.organization_id,
        projectId: id,
      })
    ) {
      return Response.json(
        { error: 'La resolución de variables legales no está habilitada para este proyecto' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as Record<string, unknown>
    const upstreamParams = new URLSearchParams({
      organization_id: project.organization_id,
      project_id: id,
    })

    const { data, error, status } = await microserviceFetch(
      `/api/v1/legal-variables/by-key?${upstreamParams.toString()}`,
      {
        method: 'PUT',
        body: { ...body, reviewed_by: user.id },
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al guardar la variable' }, { status })
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error in PUT /api/projects/[id]/legal-variables/by-key:', error)
    return Response.json({ error: 'Error al guardar la variable' }, { status: 500 })
  }
}
