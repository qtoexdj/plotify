import { microserviceFetch } from '@/lib/services/microservice.client'
import type { ClauseUpsertRequest, EscrituraTemplateDetail } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveOrganizationScope } from '../../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ templateId: string }> }

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { templateId } = await params
    const scope = await resolveOrganizationScope(request)
    if ('error' in scope) return scope.error

    const body = (await request.json().catch(() => null)) as ClauseUpsertRequest | null
    if (!body) {
      return Response.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<EscrituraTemplateDetail>(
      `/api/v1/escritura-templates/${encodeURIComponent(templateId)}/clauses?${upstreamParams.toString()}`,
      {
        method: 'PUT',
        body,
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al guardar cláusula' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in PUT /api/escritura-templates/[templateId]/clauses:', error)
    return Response.json({ error: 'Error al guardar cláusula' }, { status: 500 })
  }
}
