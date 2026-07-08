import { microserviceFetch } from '@/lib/services/microservice.client'
import type { CascadeRunResult } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveCaseScope } from '../../../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ caseId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { caseId } = await params
    const scope = await resolveCaseScope(request, caseId)
    if ('error' in scope) return scope.error
    if (scope.role !== 'admin') {
      return Response.json({ error: 'Solo un admin puede reintentar la cascada' }, { status: 403 })
    }

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<CascadeRunResult>(
      `/api/v1/escritura-cases/${encodeURIComponent(caseId)}/retry-cascade?${upstreamParams.toString()}`,
      { method: 'POST' }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al reintentar la cascada' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in POST /api/escritura-matrices/case/[caseId]/retry-cascade:', error)
    return Response.json({ error: 'Error al reintentar la cascada' }, { status: 500 })
  }
}
