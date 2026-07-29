import { resolveCaseScope } from '@/app/api/escritura-matrices/_scope'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const SIGNATURE_ROUTE_NOT_IMPLEMENTED = 'SIGNATURE_ROUTE_NOT_IMPLEMENTED'

type RouteParams = { params: Promise<{ caseId: string }> }

type SignatureRequest = {
  generationId: string
  evidenceFileId: string
  signedAt: string
  reason: string
}

type SignatureResponse = {
  eventId: string
  caseId: string
  generationId: string
  evidenceFileId: string
  signatureStatus: 'recorded'
  signedAt: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function awaiting(error: string, status: number) {
  return Response.json({ error, signatureStatus: 'awaiting' }, { status })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { caseId } = await params
    const body = (await request.json().catch(() => null)) as SignatureRequest | null
    const operationKey = request.headers.get('idempotency-key')

    if (
      !UUID_PATTERN.test(caseId) ||
      !body ||
      !UUID_PATTERN.test(body.generationId) ||
      !UUID_PATTERN.test(body.evidenceFileId) ||
      !body.reason?.trim() ||
      !operationKey
    ) {
      return awaiting('Evidencia de firma inválida', 400)
    }

    const signedAt = new Date(body.signedAt)
    if (Number.isNaN(signedAt.getTime()) || signedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return awaiting('Fecha de firma inválida', 422)
    }

    const scope = await resolveCaseScope(request, caseId)
    if ('error' in scope) return scope.error
    if (scope.role !== 'admin') {
      return awaiting('Solo un administrador autorizado puede registrar la firma', 403)
    }

    const query = new URLSearchParams({ organization_id: scope.organizationId })
    const { data, error, status } = await microserviceFetch<SignatureResponse>(
      `/api/v1/escritura-cases/${encodeURIComponent(caseId)}/signature-events?${query.toString()}`,
      {
        method: 'POST',
        headers: {
          'X-User-Id': scope.userId,
          'Idempotency-Key': operationKey,
        },
        body: {
          generationId: body.generationId,
          evidenceFileId: body.evidenceFileId,
          signedAt: body.signedAt,
          reason: body.reason.trim(),
          operationKey,
        },
      }
    )

    if (error || !data) return awaiting(error || 'No se pudo registrar la firma', status)
    return Response.json(data, { status: 201 })
  } catch {
    return awaiting('No se pudo registrar la firma', 500)
  }
}
