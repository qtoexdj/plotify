import { microserviceFetch } from '@/lib/services/microservice.client'
import type { MinutaGenerationListResponse } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveCaseScope } from '../../../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ caseId: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { caseId } = await params
    const scope = await resolveCaseScope(request, caseId)
    if ('error' in scope) return scope.error

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<MinutaGenerationListResponse>(
      `/api/v1/escritura-matrices/case/${encodeURIComponent(caseId)}/generations?${upstreamParams.toString()}`
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al listar generaciones' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/escritura-matrices/case/[caseId]/generations:', error)
    return Response.json({ error: 'Error al listar generaciones' }, { status: 500 })
  }
}
