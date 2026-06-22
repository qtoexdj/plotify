import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * SDD 011 (A5): aprueba en bloque las variables revisables del proyecto
 * (proposed/manual_review con valor), opcionalmente por grupo o claves.
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
      `/api/v1/legal-variables/bulk-approve?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body: { ...body, reviewed_by: user.id },
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al aprobar las variables' }, { status })
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error in POST /api/projects/[id]/legal-variables/bulk-approve:', error)
    return Response.json({ error: 'Error al aprobar las variables' }, { status: 500 })
  }
}
