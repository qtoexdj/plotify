import { microserviceFetch } from '@/lib/services/microservice.client'
import type { MatrizCaseResponse } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveMatrizScope } from '../../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ matrizId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { matrizId } = await params
    const scope = await resolveMatrizScope(request, matrizId)
    if ('error' in scope) return scope.error

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<MatrizCaseResponse>(
      `/api/v1/escritura-matrices/${encodeURIComponent(matrizId)}/submit?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body: { submitted_by: scope.userId },
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al enviar la matriz a revisión' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in POST /api/escritura-matrices/[matrizId]/submit:', error)
    return Response.json({ error: 'Error al enviar la matriz a revisión' }, { status: 500 })
  }
}
