import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import type { LegalRoleMatchesResponse } from '@/lib/legal/variable-resolution-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

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

    const upstreamParams = new URLSearchParams({
      organization_id: project.organization_id,
    })

    const { data, error, status } = await microserviceFetch<LegalRoleMatchesResponse>(
      `/api/v1/legal-roles/project/${encodeURIComponent(id)}/matches?${upstreamParams.toString()}`
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al obtener roles SII' }, { status })
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/projects/[id]/legal-roles:', error)
    return Response.json({ error: 'Error al obtener roles SII' }, { status: 500 })
  }
}
