import { microserviceFetch } from '@/lib/services/microservice.client'
import type { MatrizCaseResponse } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'
import { resolveCaseScope } from '../../../_scope'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ caseId: string }> }
type LegalReviewBody = { decision?: 'aprobada' | 'rechazada'; comentario?: string }

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { caseId } = await params
    const scope = await resolveCaseScope(request, caseId)
    if ('error' in scope) return scope.error
    if (scope.role !== 'admin') {
      return Response.json(
        { error: 'Solo un revisor legal autorizado puede decidir la revisión jurídica' },
        { status: 403 }
      )
    }

    const body = (await request.json().catch(() => null)) as LegalReviewBody | null
    if (!body?.decision) {
      return Response.json({ error: 'Debes indicar una decisión' }, { status: 400 })
    }

    const upstreamParams = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<MatrizCaseResponse>(
      `/api/v1/escritura-matrices/case/${encodeURIComponent(caseId)}/legal-review?${upstreamParams.toString()}`,
      {
        method: 'POST',
        body: {
          decision: body.decision,
          comentario: body.comentario,
          decided_by: scope.userId,
        },
      }
    )

    if (error || !data) {
      return Response.json(
        { error: error || 'Error al registrar la revisión jurídica' },
        { status }
      )
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in POST /api/escritura-matrices/case/[caseId]/legal-review:', error)
    return Response.json({ error: 'Error al registrar la revisión jurídica' }, { status: 500 })
  }
}
