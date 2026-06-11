import { microserviceFetch } from '@/lib/services/microservice.client'
import type { GenerateMinutaRequest, MinutaGeneration } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveMatrizScope } from '../../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ matrizId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { matrizId } = await params
    const scope = await resolveMatrizScope(request, matrizId)
    if ('error' in scope) return scope.error

    const body = (await request.json().catch(() => null)) as GenerateMinutaRequest | null
    if (!body) {
      return Response.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<MinutaGeneration>(
      `/api/v1/escritura-matrices/${encodeURIComponent(matrizId)}/generate?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body: {
          warning_acknowledged: body.warning_acknowledged,
          generated_by: scope.userId,
        },
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al generar la minuta' }, { status })
    }
    return Response.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/escritura-matrices/[matrizId]/generate:', error)
    return Response.json({ error: 'Error al generar la minuta' }, { status: 500 })
  }
}
