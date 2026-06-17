import { microserviceFetch } from '@/lib/services/microservice.client'
import type { EscrituraTemplateDetail } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveOrganizationScope } from '../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ templateId: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { templateId } = await params
    const scope = await resolveOrganizationScope(request)
    if ('error' in scope) return scope.error

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<EscrituraTemplateDetail>(
      `/api/v1/escritura-templates/${encodeURIComponent(templateId)}?${upstreamParams.toString()}`
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al obtener plantilla' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/escritura-templates/[templateId]:', error)
    return Response.json({ error: 'Error al obtener plantilla' }, { status: 500 })
  }
}
