import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import type {
  LegalVariableEditPayload,
  LegalVariableEditResponse,
} from '@/lib/legal/variable-resolution-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variableId: string }> }
) {
  try {
    const { id, variableId } = await params
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

    const body = (await request.json()) as LegalVariableEditPayload
    const upstreamParams = new URLSearchParams({
      organization_id: project.organization_id,
      project_id: id,
    })
    const upstreamBody = {
      ...body,
      reviewed_by: user.id,
    }

    const { data, error, status } = await microserviceFetch<LegalVariableEditResponse>(
      `/api/v1/legal-variables/${encodeURIComponent(variableId)}?${upstreamParams.toString()}`,
      {
        method: 'PATCH',
        body: upstreamBody,
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al actualizar variable legal' }, { status })
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error in PATCH /api/projects/[id]/legal-variables/[variableId]:', error)
    return Response.json({ error: 'Error al actualizar variable legal' }, { status: 500 })
  }
}
