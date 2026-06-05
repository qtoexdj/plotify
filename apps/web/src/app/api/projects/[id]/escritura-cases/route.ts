import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import type {
  CreateEscrituraCaseResponse,
  CreateEscrituraCasePayload,
} from '@/lib/legal/variable-resolution-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as {
      lot_id?: string
      warning_acknowledged?: boolean
    }
    if (!body.lot_id) {
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
        { error: 'Los casos de escritura no están habilitados para este proyecto' },
        { status: 403 }
      )
    }

    const payload: CreateEscrituraCasePayload = {
      organization_id: project.organization_id,
      project_id: id,
      created_by: user.id,
      warning_acknowledged: Boolean(body.warning_acknowledged),
    }

    const { data, error, status } = await microserviceFetch<CreateEscrituraCaseResponse>(
      `/api/v1/escritura-cases/lots/${encodeURIComponent(body.lot_id)}`,
      {
        method: 'POST',
        body: payload,
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al crear caso de escritura' }, { status })
    }

    return Response.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/projects/[id]/escritura-cases:', error)
    return Response.json({ error: 'Error al crear caso de escritura' }, { status: 500 })
  }
}
