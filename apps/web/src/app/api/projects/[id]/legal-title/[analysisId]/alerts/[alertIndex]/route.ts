import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import type { TitleAlert, TitleAlertResolvePayload } from '@/lib/legal/title-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteParams = {
  params: Promise<{ id: string; analysisId: string; alertIndex: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, analysisId, alertIndex } = await params
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
        { error: 'El análisis de títulos no está habilitado para este proyecto' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as TitleAlertResolvePayload
    const upstreamParams = new URLSearchParams({
      organization_id: project.organization_id,
      project_id: id,
    })
    const { data, error, status } = await microserviceFetch<TitleAlert>(
      `/api/v1/legal-titles/${encodeURIComponent(analysisId)}/alerts/${encodeURIComponent(alertIndex)}/resolve?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body: { ...body, resolved_by: user.id },
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al resolver la alerta' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error(
      'Error in POST /api/projects/[id]/legal-title/[analysisId]/alerts/[alertIndex]:',
      error
    )
    return Response.json({ error: 'Error al resolver la alerta' }, { status: 500 })
  }
}
