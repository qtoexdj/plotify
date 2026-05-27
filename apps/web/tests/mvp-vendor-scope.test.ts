/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

const mockSupabase = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(() => Promise.resolve(mockSupabase)),
}))

vi.mock('@/lib/services/approvals.service', () => ({
  createApprovalRequest: vi.fn(),
}))

import { requestReservationApproval } from '../src/actions/request-approval.action'
import { createApprovalRequest } from '@/lib/services/approvals.service'

describe('MVP vendor project scoping and reservation validation', () => {
  const createApprovalRequestMock = vi.mocked(createApprovalRequest)

  let mockProjectResult: any
  let mockOrgMemberResult: any
  let mockVendorResult: any
  let mockVendorProjectResult: any
  let mockLotResult: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock usuario autenticado por defecto
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    // Resultados de base de datos mockeados por defecto
    mockProjectResult = { data: { organization_id: 'org-123' }, error: null }
    mockOrgMemberResult = { data: { role: 'user' }, error: null } // No es admin
    mockVendorResult = {
      data: {
        id: 'vendor-123',
        nombre: 'Juan Perez',
        phone: '+56999999999',
        organization_id: 'org-123',
      },
      error: null,
    }
    mockVendorProjectResult = { data: { vendor_id: 'vendor-123' }, error: null }
    mockLotResult = { data: { project_id: 'project-123' }, error: null }

    // Mock de base de datos dinámico
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(() => Promise.resolve(mockProjectResult)),
            }),
          }),
        }
      }
      if (table === 'organization_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(mockOrgMemberResult)),
              }),
            }),
          }),
        }
      }
      if (table === 'vendors') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(() => Promise.resolve(mockVendorResult)),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(mockVendorResult)),
              }),
            }),
          }),
        }
      }
      if (table === 'lots') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(() => Promise.resolve(mockLotResult)),
            }),
          }),
        }
      }
      if (table === 'vendor_projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockImplementation(() => Promise.resolve(mockVendorProjectResult)),
              }),
            }),
          }),
        }
      }
      return {
        insert: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: null })),
      } as any
    })

    // Mock de creación de solicitud exitoso por defecto
    createApprovalRequestMock.mockResolvedValue({
      success: true,
      approval_id: 'approval-abc',
      message: 'Solicitud enviada',
    } as any)
  })

  const validFormData = {
    cliente_nombre: 'Maria Gomez',
    cliente_run: '12345678-5',
    valor_reserva: 500000,
    notaria: '1ra Notaria de Santiago',
    fecha: '2026-06-01',
    cliente_direccion: 'Av Vitacura 1234',
    cliente_estado_civil: 'Soltero',
    cliente_ocupacion: 'Ingeniero',
    cliente_email: 'maria@example.com',
    cliente_telefono: '+56988888888',
  }

  it('allows reservation request if vendor is assigned to the project', async () => {
    const result = await requestReservationApproval('project-123', 'lot-123', validFormData)

    expect(result.success).toBe(true)
    expect((result as any).error).toBeUndefined()
    expect(createApprovalRequestMock).toHaveBeenCalledTimes(1)
  })

  it('rejects reservation request if vendor is not assigned to the project', async () => {
    // Simular que el vendedor no tiene asignado este proyecto
    mockVendorProjectResult = { data: null, error: null }

    const result = await requestReservationApproval('project-123', 'lot-123', validFormData)

    expect(result.success).toBe(false)
    expect((result as any).error).toContain('No tienes asignado este proyecto')
    expect(createApprovalRequestMock).not.toHaveBeenCalled()
  })

  it('rejects if project is not found', async () => {
    // Simular que el proyecto no existe
    mockProjectResult = { data: null, error: { message: 'Not found' } }

    const result = await requestReservationApproval('project-123', 'lot-123', validFormData)

    expect(result.success).toBe(false)
    expect((result as any).error).toContain('Proyecto no encontrado')
    expect(createApprovalRequestMock).not.toHaveBeenCalled()
  })

  it('rejects if lot does not belong to the project', async () => {
    // Simular que el lote pertenece a un proyecto diferente (escalamiento cruzado)
    mockLotResult = { data: { project_id: 'project-other' }, error: null }

    const result = await requestReservationApproval('project-123', 'lot-123', validFormData)

    expect(result.success).toBe(false)
    expect((result as any).error).toContain('El lote no pertenece al proyecto especificado')
    expect(createApprovalRequestMock).not.toHaveBeenCalled()
  })

  it('rejects if user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth session missing' },
    })

    const result = await requestReservationApproval('project-123', 'lot-123', validFormData)

    expect(result.success).toBe(false)
    expect((result as any).error).toContain('No autenticado')
  })

  it('rejects if user is not a vendor', async () => {
    mockVendorResult = { data: null, error: null }

    const result = await requestReservationApproval('project-123', 'lot-123', validFormData)

    expect(result.success).toBe(false)
    expect((result as any).error).toContain('No se encontró registro de vendedor')
  })
})
