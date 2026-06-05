import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import type { EscrituraReadinessResponse } from '@/lib/legal/variable-resolution-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const lotId = new URL(request.url).searchParams.get('lot_id')
    if (!lotId) {
      return Response.json({ error: 'lot_id es requerido' }, { status: 400 })
    }

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
        { error: 'El readiness de escritura no está habilitado para este proyecto' },
        { status: 403 }
      )
    }

    const upstreamParams = new URLSearchParams({
      organization_id: project.organization_id,
      project_id: id,
    })

    const { data, error, status } = await microserviceFetch<EscrituraReadinessResponse>(
      `/api/v1/escritura-cases/lots/${encodeURIComponent(
        lotId
      )}/readiness?${upstreamParams.toString()}`
    )

    if (error || !data) {
      return Response.json(
        { error: error || 'Error al obtener readiness de escritura' },
        { status }
      )
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/projects/[id]/escritura-readiness:', error)
    return Response.json({ error: 'Error al obtener readiness de escritura' }, { status: 500 })
  }
}
