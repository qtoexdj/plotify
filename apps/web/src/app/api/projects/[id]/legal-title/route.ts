import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import type { ProjectTitleCaseResponse, TitleReanalyzeResponse } from '@/lib/legal/title-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

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

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const scope = await resolveProjectScope(request, id)
    if ('error' in scope) return scope.error

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<ProjectTitleCaseResponse>(
      `/api/v1/legal-titles/project/${encodeURIComponent(id)}?${upstreamParams.toString()}`
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al obtener el caso de título' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/projects/[id]/legal-title:', error)
    return Response.json({ error: 'Error al obtener el caso de título' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const scope = await resolveProjectScope(request, id)
    if ('error' in scope) return scope.error

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<TitleReanalyzeResponse>(
      `/api/v1/legal-titles/project/${encodeURIComponent(id)}/reanalyze?${upstreamParams.toString()}`,
      { method: 'POST' }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al reanalizar el título' }, { status })
    }
    return Response.json(data, { status: 202 })
  } catch (error) {
    console.error('Error in POST /api/projects/[id]/legal-title:', error)
    return Response.json({ error: 'Error al reanalizar el título' }, { status: 500 })
  }
}
