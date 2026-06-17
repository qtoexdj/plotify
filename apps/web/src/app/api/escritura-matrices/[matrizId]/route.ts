import { microserviceFetch } from '@/lib/services/microservice.client'
import type { MatrizCaseResponse, MatrizSaveRequest } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveMatrizScope } from '../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ matrizId: string }> }

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { matrizId } = await params
    const scope = await resolveMatrizScope(request, matrizId)
    if ('error' in scope) return scope.error

    const body = (await request.json().catch(() => null)) as MatrizSaveRequest | null
    if (!body) {
      return Response.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<MatrizCaseResponse>(
      `/api/v1/escritura-matrices/${encodeURIComponent(matrizId)}?${upstreamParams.toString()}`,
      {
        method: 'PUT',
        body,
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al guardar la matriz' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in PUT /api/escritura-matrices/[matrizId]:', error)
    return Response.json({ error: 'Error al guardar la matriz' }, { status: 500 })
  }
}
