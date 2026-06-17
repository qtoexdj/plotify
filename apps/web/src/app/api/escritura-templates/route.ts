import { microserviceFetch } from '@/lib/services/microservice.client'
import type {
  EscrituraTemplateDetail,
  TemplateCreateRequest,
  TemplateListResponse,
} from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveOrganizationScope } from './_scope'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const scope = await resolveOrganizationScope(request)
    if ('error' in scope) return scope.error

    const sourceParams = new URL(request.url).searchParams
    const upstreamParams = new URLSearchParams({
      organization_id: scope.organizationId,
      document_type: sourceParams.get('document_type') || 'compraventa',
    })
    const { data, error, status } = await microserviceFetch<TemplateListResponse>(
      `/api/v1/escritura-templates?${upstreamParams.toString()}`
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al obtener plantillas' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/escritura-templates:', error)
    return Response.json({ error: 'Error al obtener plantillas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const scope = await resolveOrganizationScope(request)
    if ('error' in scope) return scope.error

    const body = (await request.json().catch(() => null)) as TemplateCreateRequest | null
    if (!body) {
      return Response.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<EscrituraTemplateDetail>(
      `/api/v1/escritura-templates?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body,
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al crear plantilla' }, { status })
    }
    return Response.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/escritura-templates:', error)
    return Response.json({ error: 'Error al crear plantilla' }, { status: 500 })
  }
}
