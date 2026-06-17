import { microserviceFetch } from '@/lib/services/microservice.client'
import type { MatrizCaseResponse, MatrizRejectRequest } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveMatrizScope } from '../../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ matrizId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { matrizId } = await params
    const scope = await resolveMatrizScope(request, matrizId)
    if ('error' in scope) return scope.error
    if (scope.role !== 'admin') {
      return Response.json(
        { error: 'Solo un revisor legal autorizado puede rechazar' },
        { status: 403 }
      )
    }

    const body = (await request.json().catch(() => null)) as MatrizRejectRequest | null
    if (!body?.reason) {
      return Response.json({ error: 'Debes indicar una razón de rechazo' }, { status: 400 })
    }

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<MatrizCaseResponse>(
      `/api/v1/escritura-matrices/${encodeURIComponent(matrizId)}/reject?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body: { rejected_by: scope.userId, reason: body.reason },
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al rechazar la matriz' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in POST /api/escritura-matrices/[matrizId]/reject:', error)
    return Response.json({ error: 'Error al rechazar la matriz' }, { status: 500 })
  }
}
