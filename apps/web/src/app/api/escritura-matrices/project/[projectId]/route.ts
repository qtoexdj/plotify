import { microserviceFetch } from '@/lib/services/microservice.client'
import type { MatrizCaseResponse } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveProjectScope } from '../../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ projectId: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params
    const scope = await resolveProjectScope(request, projectId)
    if ('error' in scope) return scope.error

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<MatrizCaseResponse>(
      `/api/v1/escritura-matrices/project/${encodeURIComponent(projectId)}?${upstreamParams.toString()}`
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al obtener la matriz' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/escritura-matrices/project/[projectId]:', error)
    return Response.json({ error: 'Error al obtener la matriz' }, { status: 500 })
  }
}
