import { microserviceFetch } from '@/lib/services/microservice.client'
import type { EscrituraTemplateDetail, TemplatePublishRequest } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveOrganizationScope } from '../../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ templateId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { templateId } = await params
    const scope = await resolveOrganizationScope(request)
    if ('error' in scope) return scope.error

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const body: TemplatePublishRequest = { published_by: scope.userId }
    const { data, error, status } = await microserviceFetch<EscrituraTemplateDetail>(
      `/api/v1/escritura-templates/${encodeURIComponent(templateId)}/publish?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body,
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al publicar plantilla' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in POST /api/escritura-templates/[templateId]/publish:', error)
    return Response.json({ error: 'Error al publicar plantilla' }, { status: 500 })
  }
}
