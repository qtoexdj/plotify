import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import type {
  ProjectTitleCase,
  TitleNarrative,
  TitleNarrativeEditPayload,
} from '@/lib/legal/title-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string; analysisId: string }> }

async function resolveProjectScope(request: NextRequest, projectId: string) {
  const supabase = createRouteHandlerClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const project = await getProjectById(projectId, user.id, supabase)
  if (!project) {
    return { error: Response.json({ error: 'Proyecto no encontrado' }, { status: 404 }) }
  }
  if (!project.organization_id) {
    return {
      error: Response.json({ error: 'Proyecto sin organización asociada' }, { status: 422 }),
    }
  }
  if (
    !isLegalDocumentsFeatureEnabled({
      organizationId: project.organization_id,
      projectId,
    })
  ) {
    return {
      error: Response.json(
        { error: 'El análisis de títulos no está habilitado para este proyecto' },
        { status: 403 }
      ),
    }
  }
  return { user, organizationId: project.organization_id }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, analysisId } = await params
    const scope = await resolveProjectScope(request, id)
    if ('error' in scope) return scope.error

    const body = (await request.json()) as TitleNarrativeEditPayload
    const upstreamParams = new URLSearchParams({
      organization_id: scope.organizationId,
      project_id: id,
    })
    const { data, error, status } = await microserviceFetch<TitleNarrative>(
      `/api/v1/legal-titles/${encodeURIComponent(analysisId)}/narrative?${upstreamParams.toString()}`,
      {
        method: 'PATCH',
        body: { ...body, edited_by: scope.user.id },
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al editar el bloque narrativo' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in PATCH /api/projects/[id]/legal-title/[analysisId]:', error)
    return Response.json({ error: 'Error al editar el bloque narrativo' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, analysisId } = await params
    const scope = await resolveProjectScope(request, id)
    if ('error' in scope) return scope.error

    const upstreamParams = new URLSearchParams({
      organization_id: scope.organizationId,
      project_id: id,
    })
    const { data, error, status } = await microserviceFetch<ProjectTitleCase>(
      `/api/v1/legal-titles/${encodeURIComponent(analysisId)}/approve?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body: { approved_by: scope.user.id },
      }
    )

    if (error || !data) {
      // On 409 the upstream `detail` is the machine-readable blocking
      // checklist and microserviceFetch surfaces it as the error value.
      const blockingDetail = typeof error === 'object' && error !== null ? error : null
      return Response.json(
        {
          error: blockingDetail
            ? 'Aprobación bloqueada'
            : error || 'Error al aprobar el caso de título',
          detail: blockingDetail,
        },
        { status }
      )
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in POST /api/projects/[id]/legal-title/[analysisId]:', error)
    return Response.json({ error: 'Error al aprobar el caso de título' }, { status: 500 })
  }
}
