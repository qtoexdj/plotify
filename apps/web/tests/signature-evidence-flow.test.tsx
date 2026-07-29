import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const { resolveCaseScopeMock, microserviceFetchMock } = vi.hoisted(() => ({
  resolveCaseScopeMock: vi.fn(),
  microserviceFetchMock: vi.fn(),
}))

vi.mock('@/app/api/escritura-matrices/_scope', () => ({
  resolveCaseScope: resolveCaseScopeMock,
}))
vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: microserviceFetchMock,
}))

import {
  POST,
  SIGNATURE_ROUTE_NOT_IMPLEMENTED,
} from '@/app/api/escritura-cases/[caseId]/signature-events/route'

const CASE_ID = '00000000-0000-4000-8000-000000000001'
const GENERATION_ID = '00000000-0000-4000-8000-000000000002'
const EVIDENCE_FILE_ID = '00000000-0000-4000-8000-000000000003'
const OPERATION_KEY = ['signature', 'operation', '1'].join('-')

function routeSource(): string {
  return readFileSync(
    resolve(process.cwd(), 'src/app/api/escritura-cases/[caseId]/signature-events/route.ts'),
    'utf8'
  )
}

function request(overrides: Record<string, unknown> = {}): Request {
  return new Request(`http://localhost/api/escritura-cases/${CASE_ID}/signature-events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': OPERATION_KEY,
    },
    body: JSON.stringify({
      generationId: GENERATION_ID,
      evidenceFileId: EVIDENCE_FILE_ID,
      signedAt: '2026-07-24T14:59:00.000Z',
      reason: 'Constancia de escritura firmada',
      ...overrides,
    }),
  })
}

describe('external signature evidence flow (RED)', () => {
  resolveCaseScopeMock.mockResolvedValue({
    organizationId: '00000000-0000-4000-8000-000000000010',
    projectId: '00000000-0000-4000-8000-000000000011',
    userId: '00000000-0000-4000-8000-000000000012',
    role: 'admin',
  })
  microserviceFetchMock.mockResolvedValue({
    data: {
      eventId: '00000000-0000-4000-8000-000000000004',
      caseId: CASE_ID,
      generationId: GENERATION_ID,
      evidenceFileId: EVIDENCE_FILE_ID,
      signatureStatus: 'recorded',
      signedAt: '2026-07-24T14:59:00.000Z',
    },
    error: null,
    status: 201,
  })

  it('uses same-origin case scope, opaque fileId and an operation key', () => {
    const source = routeSource()

    expect(source, SIGNATURE_ROUTE_NOT_IMPLEMENTED).toMatch(/caseId/)
    expect(source, SIGNATURE_ROUTE_NOT_IMPLEMENTED).toMatch(/evidenceFileId|evidence_file_id/)
    expect(source, SIGNATURE_ROUTE_NOT_IMPLEMENTED).toMatch(/generationId|generation_id/)
    expect(source, SIGNATURE_ROUTE_NOT_IMPLEMENTED).toMatch(/idempotency-key|operationKey/)
    expect(source, SIGNATURE_ROUTE_NOT_IMPLEMENTED).not.toMatch(
      /storagePath|storage_path|signedURL|signedUrl|download_url/
    )
  })

  it('forwards only after authenticated project/case authorization', () => {
    const source = routeSource()

    expect(source, SIGNATURE_ROUTE_NOT_IMPLEMENTED).toMatch(
      /resolveCaseScope|activeWorkspace|createRouteHandlerClient/
    )
    expect(source, SIGNATURE_ROUTE_NOT_IMPLEMENTED).toMatch(/role|authorized|admin/)
    expect(source, SIGNATURE_ROUTE_NOT_IMPLEMENTED).toMatch(/microserviceFetch/)
  })

  it('returns recorded only after the guarded API accepts exact evidence', async () => {
    const response = await POST(request() as never, {
      params: Promise.resolve({ caseId: CASE_ID }),
    })
    const body = await response.json()

    expect(response.status, SIGNATURE_ROUTE_NOT_IMPLEMENTED).toBe(201)
    expect(body).toMatchObject({
      caseId: CASE_ID,
      generationId: GENERATION_ID,
      evidenceFileId: EVIDENCE_FILE_ID,
      signatureStatus: 'recorded',
    })
    expect(body).not.toHaveProperty('storagePath')
    expect(body).not.toHaveProperty('url')
  })

  it.each([
    ['same project but wrong generation', { generationId: 'wrong-generation' }],
    ['missing evidence', { evidenceFileId: null }],
    ['future timestamp', { signedAt: '2999-01-01T00:00:00.000Z' }],
  ])('keeps signatureStatus awaiting for %s', async (_name, override) => {
    const response = await POST(request(override) as never, {
      params: Promise.resolve({ caseId: CASE_ID }),
    })
    const body = await response.json()

    expect(response.status, 'signatureStatus').toBeGreaterThanOrEqual(400)
    expect(body.signatureStatus, 'signatureStatus').toBe('awaiting')
  })
})
