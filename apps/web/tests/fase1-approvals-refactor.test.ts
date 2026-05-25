/**
 * FASE 1 — F-v2-1.2 (refactorización)
 * Tests para src/lib/services/approvals.service.ts
 *
 * Verifica que createApprovalRequest delega a microserviceFetch
 * y que el mapeo de códigos de error (PENDING_EXISTS, LOT_NOT_FOUND,
 * INSERT_FAILED) sigue siendo correcto tras la refactorización.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { microserviceFetch } from '@/lib/services/microservice.client'
import { createClient } from '@/lib/supabase/server'
import {
  createApprovalRequest,
  resolveVendorFromUser,
  type CreateApprovalRequestParams,
} from '@/lib/services/approvals.service'

const baseParams: CreateApprovalRequestParams = {
  lotId: 'lot-uuid-1',
  organizationId: 'org-uuid-1',
  vendorId: 'vendor-uuid-1',
  vendorName: 'Juan Pérez',
  vendorPhone: '+56912345678',
  vendorPlatform: 'telegram',
  payload: {
    cliente_nombre: 'Pedro Soto',
    cliente_run: '12.345.678-9',
    valor_reserva: 5000000,
    notaria: 'Notaría Central',
  },
}

describe('createApprovalRequest — usa microserviceFetch (no fetch directo)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('llama a microserviceFetch con el endpoint y método correctos', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { approval_id: 'approval-abc-123' },
      error: null,
      status: 201,
    })

    await createApprovalRequest(baseParams)

    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith(
      '/api/v1/approvals/request-reservation',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('retorna success=true con approval_id y status pending cuando el microservicio responde OK', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { approval_id: 'approval-abc-123' },
      error: null,
      status: 201,
    })

    const result = await createApprovalRequest(baseParams)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.approval_id).toBe('approval-abc-123')
      expect(result.status).toBe('pending')
    }
  })

  it('envía los campos del payload correctamente al microservicio', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { approval_id: 'x' },
      error: null,
      status: 201,
    })

    await createApprovalRequest(baseParams)

    const callBody = vi.mocked(microserviceFetch).mock.calls[0][1]?.body as Record<string, unknown>
    expect(callBody).toMatchObject({
      lot_id: 'lot-uuid-1',
      organization_id: 'org-uuid-1',
      vendor_id: 'vendor-uuid-1',
      vendor_name: 'Juan Pérez',
      vendor_phone: '+56912345678',
      vendor_platform: 'telegram',
    })
  })

  it('retorna code PENDING_EXISTS cuando el microservicio responde 409', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'Ya existe una solicitud pendiente para este lote',
      status: 409,
    })

    const result = await createApprovalRequest(baseParams)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('PENDING_EXISTS')
    }
  })

  it('retorna code LOT_NOT_FOUND cuando el microservicio responde 404', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'Lote no encontrado',
      status: 404,
    })

    const result = await createApprovalRequest(baseParams)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('LOT_NOT_FOUND')
    }
  })

  it('retorna code INSERT_FAILED para cualquier otro error del microservicio', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'Error interno del servidor',
      status: 500,
    })

    const result = await createApprovalRequest(baseParams)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INSERT_FAILED')
    }
  })

  it('retorna code INSERT_FAILED cuando microserviceFetch devuelve error de conexión (503)', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'No se pudo conectar con el microservicio',
      status: 503,
    })

    const result = await createApprovalRequest(baseParams)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INSERT_FAILED')
    }
  })

  it('solo llama a microserviceFetch una vez por solicitud (sin fetch directo)', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { approval_id: 'x' },
      error: null,
      status: 201,
    })

    await createApprovalRequest(baseParams)

    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledTimes(1)
  })
})

describe('resolveVendorFromUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const buildSupabaseMock = (data: unknown, error: unknown) => ({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValueOnce({ data, error }),
  })

  it('retorna vendor info normalizada cuando el userId existe', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      buildSupabaseMock(
        { id: 'v-1', nombre: 'María González', phone: '+56987654321', organization_id: 'org-99' },
        null
      ) as never
    )

    const result = await resolveVendorFromUser('user-abc')

    expect(result).toEqual({
      vendor_id: 'v-1',
      vendor_name: 'María González',
      vendor_phone: '+56987654321',
      organization_id: 'org-99',
    })
  })

  it('retorna phone vacío cuando el vendor no tiene phone', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      buildSupabaseMock(
        { id: 'v-2', nombre: 'Sin Teléfono', phone: null, organization_id: 'org-1' },
        null
      ) as never
    )

    const result = await resolveVendorFromUser('user-xyz')

    expect(result?.vendor_phone).toBe('')
  })

  it('retorna null cuando la query devuelve error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      buildSupabaseMock(null, { message: 'Row not found', code: 'PGRST116' }) as never
    )

    const result = await resolveVendorFromUser('nonexistent-user')

    expect(result).toBeNull()
  })

  it('retorna null cuando data es null sin error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(buildSupabaseMock(null, null) as never)

    const result = await resolveVendorFromUser('user-no-data')

    expect(result).toBeNull()
  })
})
