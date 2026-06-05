import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import type {
  LegalRoleMatchUpdatePayload,
  LotRoleMatch,
} from '@/lib/legal/variable-resolution-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lotId: string }> }
) {
  try {
    const { id, lotId } = await params
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
        { error: 'El matching de roles SII no está habilitado para este proyecto' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as LegalRoleMatchUpdatePayload
    const upstreamParams = new URLSearchParams({
      organization_id: project.organization_id,
      project_id: id,
    })
    const upstreamBody = {
      ...body,
      reason: body.reason,
      reviewed_by: user.id,
    }

    const { data, error, status } = await microserviceFetch<LotRoleMatch>(
      `/api/v1/legal-roles/lots/${encodeURIComponent(lotId)}?${upstreamParams.toString()}`,
      {
        method: 'PATCH',
        body: upstreamBody,
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al actualizar rol SII' }, { status })
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error in PATCH /api/projects/[id]/legal-roles/[lotId]:', error)
    return Response.json({ error: 'Error al actualizar rol SII' }, { status: 500 })
  }
}
