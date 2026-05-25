/**
 * FASE 4 — F-v2-4.2, F-v2-4.3, F-v2-4.4
 * Tests para:
 *   - src/lib/services/documents.service.ts
 *   - src/lib/services/document-generation.service.ts
 *   - src/actions/documents.action.ts
 *
 * Estrategia: mock de @/lib/supabase/server y microservice.client.
 * No se hacen llamadas reales a Supabase ni al microservicio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks globales ───────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}))

// next/cache no existe en el entorno de test
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { microserviceFetch } from '@/lib/services/microservice.client'

import {
  listBlocks,
  createBlock,
  softDeleteBlock,
  listTemplates,
  saveTemplateBlocks,
  listGeneratedDocs,
} from '@/lib/services/documents.service'

import { previewDocument, generateDocument } from '@/lib/services/document-generation.service'

import {
  createBlockAction,
  deleteBlockAction,
  generateDocumentAction,
} from '@/actions/documents.action'

import type { DocumentBlock, DocumentTemplate } from '@/types/v2'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1'
const BLOCK_ID = 'block-uuid-1'
const TEMPLATE_ID = 'template-uuid-1'
const USER_ID = 'user-uuid-1'
const LOT_ID = 'lot-uuid-1'

const mockBlock: DocumentBlock = {
  id: BLOCK_ID,
  organization_id: ORG_ID,
  name: 'Comparecencia Natural',
  category: 'comparecencia',
  content: 'Comparece Don/Doña {{ comprador.nombre }}, RUT {{ comprador.rut }}',
  variables: ['comprador.nombre', 'comprador.rut'],
  tags: ['escritura', 'comparecencia'],
  is_active: true,
  created_by: USER_ID,
  created_at: '2026-03-31T00:00:00Z',
  updated_at: '2026-03-31T00:00:00Z',
  version: null,
}

const mockTemplate: DocumentTemplate = {
  id: TEMPLATE_ID,
  organization_id: ORG_ID,
  name: 'Escritura Compraventa Rural',
  description: 'Template estándar para compraventa de lotes rurales',
  document_type: 'escritura',
  is_default: false,
  created_by: USER_ID,
  created_at: '2026-03-31T00:00:00Z',
  updated_at: '2026-03-31T00:00:00Z',
  footer_config: null,
  header_config: null,
  page_config: null,
}

// ─── Helpers para construir Supabase mock ─────────────────────────────────────

/**
 * Crea un mock de query builder thenable:
 * - todos los métodos de encadenamiento (select, eq, order, etc.) retornan el propio objeto
 * - `await queryBuilder` resuelve a `result` porque el objeto implementa `.then()`
 * - `.single()` también resuelve a `result` directamente
 */
function buildChain(result: unknown) {
  const base: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (v: unknown) => void) => void
  } = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
  }

  // Todos los métodos de encadenamiento retornan el mismo mock (chainable)
  ;(['select', 'insert', 'update', 'delete', 'eq', 'order'] as const).forEach((key) => {
    base[key].mockReturnValue(base)
  })

  // .single() resuelve directamente a result
  base.single.mockResolvedValue(result)

  // El objeto es thenable: `await base` resuelve a result (patrón Supabase query builder)
  base.then = vi.fn((resolve: (v: unknown) => void) => resolve(result))

  return base
}

// ─── documents.service — listBlocks ──────────────────────────────────────────

describe('listBlocks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna array de bloques cuando Supabase responde data', async () => {
    const chain = buildChain({ data: [mockBlock], error: null })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    const result = await listBlocks(ORG_ID)
    expect(result).toEqual([mockBlock])
  })

  it('retorna [] cuando Supabase devuelve data=null', async () => {
    const chain = buildChain({ data: null, error: null })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    const result = await listBlocks(ORG_ID)
    expect(result).toEqual([])
  })
})

// ─── documents.service — createBlock ─────────────────────────────────────────

describe('createBlock', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna el bloque creado', async () => {
    const chain = buildChain({ data: mockBlock, error: null })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    const result = await createBlock({
      organization_id: ORG_ID,
      name: 'Comparecencia Natural',
      category: 'comparecencia',
      content: 'contenido',
      created_by: USER_ID,
    })
    expect(result).toEqual(mockBlock)
  })

  it('lanza error si Supabase retorna error', async () => {
    const chain = buildChain({ data: null, error: { message: 'DB error' } })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    await expect(
      createBlock({
        organization_id: ORG_ID,
        name: 'X',
        category: 'general',
        content: 'y',
        created_by: USER_ID,
      })
    ).rejects.toBeTruthy()
  })
})

// ─── documents.service — softDeleteBlock ─────────────────────────────────────

describe('softDeleteBlock', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no lanza si Supabase responde sin error', async () => {
    const chain = buildChain({ data: null, error: null })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    await expect(softDeleteBlock(BLOCK_ID)).resolves.toBeUndefined()
  })

  it('lanza error si Supabase retorna error (bloque en uso)', async () => {
    const chain = buildChain({ data: null, error: { message: 'FK violation' } })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    await expect(softDeleteBlock(BLOCK_ID)).rejects.toBeTruthy()
  })
})

// ─── documents.service — listTemplates ───────────────────────────────────────

describe('listTemplates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna array de templates', async () => {
    const chain = buildChain({ data: [mockTemplate], error: null })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    const result = await listTemplates(ORG_ID)
    expect(result).toEqual([mockTemplate])
  })
})

// ─── documents.service — saveTemplateBlocks ───────────────────────────────────

describe('saveTemplateBlocks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no lanza con items vacíos (solo hace delete)', async () => {
    const chain = buildChain({ data: null, error: null })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    await expect(saveTemplateBlocks(TEMPLATE_ID, [])).resolves.toBeUndefined()
  })
})

// ─── documents.service — listGeneratedDocs ───────────────────────────────────

describe('listGeneratedDocs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna [] si data es null', async () => {
    const chain = buildChain({ data: null, error: null })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    const result = await listGeneratedDocs(ORG_ID)
    expect(result).toEqual([])
  })
})

// ─── document-generation.service — previewDocument ───────────────────────────

describe('previewDocument', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna { html } cuando microserviceFetch responde sin error', async () => {
    ;(microserviceFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { html: '<p>Preview</p>' },
      error: null,
      status: 200,
    })

    const result = await previewDocument({
      template_id: TEMPLATE_ID,
      lot_id: LOT_ID,
      organization_id: ORG_ID,
    })
    expect(result).toEqual({ html: '<p>Preview</p>' })
    expect(microserviceFetch).toHaveBeenCalledWith('/api/v1/documents/preview', {
      method: 'POST',
      body: { template_id: TEMPLATE_ID, lot_id: LOT_ID, organization_id: ORG_ID },
    })
  })

  it('lanza error si microserviceFetch devuelve error', async () => {
    ;(microserviceFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: 'Microservice unavailable',
      status: 503,
    })

    await expect(
      previewDocument({ template_id: TEMPLATE_ID, lot_id: LOT_ID, organization_id: ORG_ID })
    ).rejects.toThrow('Microservice unavailable')
  })
})

// ─── document-generation.service — generateDocument ──────────────────────────

describe('generateDocument', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna { file_url, format } en respuesta exitosa', async () => {
    const payload = { file_url: 'https://storage/doc.pdf', format: 'pdf' }
    ;(microserviceFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: payload,
      error: null,
      status: 200,
    })

    const result = await generateDocument({
      template_id: TEMPLATE_ID,
      lot_id: LOT_ID,
      organization_id: ORG_ID,
      format: 'pdf',
      generated_by: USER_ID,
    })
    expect(result).toEqual(payload)
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/documents/generate',
      expect.objectContaining({ method: 'POST' })
    )
  })
})

// ─── documents.action — createBlockAction ────────────────────────────────────

describe('createBlockAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna { success: false } si no hay usuario autenticado', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const result = await createBlockAction({
      organization_id: ORG_ID,
      name: 'Test',
      category: 'general',
      content: 'contenido',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('No autenticado')
  })

  it('retorna { success: true, data } cuando Supabase inserta correctamente', async () => {
    const chain = buildChain({ data: mockBlock, error: null })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
      from: () => chain,
    })

    const result = await createBlockAction({
      organization_id: ORG_ID,
      name: 'Comparecencia Natural',
      category: 'comparecencia',
      content: 'contenido',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual(mockBlock)
  })
})

// ─── documents.action — deleteBlockAction ────────────────────────────────────

describe('deleteBlockAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna { success: true } en soft delete exitoso', async () => {
    const chain = buildChain({ data: null, error: null })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    const result = await deleteBlockAction(BLOCK_ID)
    expect(result.success).toBe(true)
  })

  it('retorna { success: false } si el servicio lanza', async () => {
    const chain = buildChain({ data: null, error: { message: 'FK constraint' } })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from: () => chain })

    const result = await deleteBlockAction(BLOCK_ID)
    expect(result.success).toBe(false)
  })
})

// ─── documents.action — generateDocumentAction ───────────────────────────────

describe('generateDocumentAction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna { success: false } si no hay usuario', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const result = await generateDocumentAction(TEMPLATE_ID, LOT_ID, 'pdf')
    expect(result.success).toBe(false)
    expect(result.error).toBe('No autenticado')
  })

  it('retorna { success: true, data } con microservicio OK', async () => {
    const payload = { file_url: 'https://storage/doc.pdf', format: 'pdf' }
    ;(microserviceFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: payload,
      error: null,
      status: 200,
    })
    const lotChain = buildChain({
      data: { id: LOT_ID, projects: { organization_id: ORG_ID } },
      error: null,
    })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
      from: () => lotChain,
    })

    const result = await generateDocumentAction(TEMPLATE_ID, LOT_ID, 'pdf')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual(payload)
    expect(microserviceFetch).toHaveBeenCalledWith(
      '/api/v1/documents/generate',
      expect.objectContaining({
        body: expect.objectContaining({ organization_id: ORG_ID }),
      })
    )
  })

  it('retorna { success: false } si el microservicio falla', async () => {
    ;(microserviceFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: 'Service down',
      status: 503,
    })
    const lotChain = buildChain({
      data: { id: LOT_ID, projects: { organization_id: ORG_ID } },
      error: null,
    })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
      from: () => lotChain,
    })

    const result = await generateDocumentAction(TEMPLATE_ID, LOT_ID, 'pdf')
    expect(result.success).toBe(false)
  })

  it('retorna { success: false } si no puede validar la organización del lote', async () => {
    const lotChain = buildChain({ data: null, error: { message: 'not found' } })
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
      from: () => lotChain,
    })

    const result = await generateDocumentAction(TEMPLATE_ID, LOT_ID, 'pdf')

    expect(result.success).toBe(false)
    expect(microserviceFetch).not.toHaveBeenCalled()
  })
})
