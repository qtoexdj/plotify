import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import type { VariableInventoryResponse } from '@/lib/legal/variable-resolution-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const VARIABLE_INVENTORY_FILTERS = ['lot_id', 'state', 'group', 'include_evidence'] as const

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const sourceParams = new URL(request.url).searchParams
    const upstreamParams = new URLSearchParams({
      organization_id: project.organization_id,
    })

    VARIABLE_INVENTORY_FILTERS.forEach((filter) => {
      const value = sourceParams.get(filter)
      if (value !== null && value !== '') {
        upstreamParams.set(filter, value)
      }
    })

    const { data, error, status } = await microserviceFetch<VariableInventoryResponse>(
      `/api/v1/legal-variables/project/${encodeURIComponent(id)}?${upstreamParams.toString()}`
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al obtener variables legales' }, { status })
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/projects/[id]/legal-variables:', error)
    return Response.json({ error: 'Error al obtener variables legales' }, { status: 500 })
  }
}
