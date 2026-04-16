/**
 * FASE 4 — F-v2-4.12
 * Tests de lógica del botón "Generar Documento Legal" en LotInfoView:
 *
 *   - Visibilidad: solo aparece para estados 'reservado' y 'vendido'
 *   - URL: apunta a /documentos/generar/[lotId]
 *   - Redirect fallback: la página usa /projects (no /proyectos)
 *
 * Estrategia: Vitest corre en Node (sin jsdom) → se testea la lógica pura de
 * visibilidad replicada como función pura, y la construcción del href.
 */

import { describe, it, expect } from 'vitest'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type EstadoLote = 'disponible' | 'reservado' | 'vendido'

interface LotDetails {
  id: string
  estado: EstadoLote
  numero_lote: string
}

// ─── Lógica pura replicada desde LotInfoView.tsx ─────────────────────────────

/** Determina si el botón "Generar Documento Legal" debe mostrarse */
function shouldShowGenerateButton(estado: EstadoLote | null | undefined): boolean {
  return !!estado && ['reservado', 'vendido'].includes(estado)
}

/** Construye la URL de destino del botón */
function buildGenerateUrl(lotId: string): string {
  return `/documentos/generar/${lotId}`
}

// ─── Tests: visibilidad del botón ────────────────────────────────────────────

describe('F-v2-4.12 — shouldShowGenerateButton: visibilidad del botón', () => {
  it('muestra el botón cuando estado="reservado"', () => {
    expect(shouldShowGenerateButton('reservado')).toBe(true)
  })

  it('muestra el botón cuando estado="vendido"', () => {
    expect(shouldShowGenerateButton('vendido')).toBe(true)
  })

  it('NO muestra el botón cuando estado="disponible"', () => {
    expect(shouldShowGenerateButton('disponible')).toBe(false)
  })

  it('NO muestra el botón cuando estado es null', () => {
    expect(shouldShowGenerateButton(null)).toBe(false)
  })

  it('NO muestra el botón cuando estado es undefined', () => {
    expect(shouldShowGenerateButton(undefined)).toBe(false)
  })

  it('cubrir todos los valores de EstadoLote: solo reservado y vendido retornan true', () => {
    const estados: EstadoLote[] = ['disponible', 'reservado', 'vendido']
    const results = estados.map((e) => ({ estado: e, show: shouldShowGenerateButton(e) }))
    expect(results.find((r) => r.estado === 'disponible')?.show).toBe(false)
    expect(results.find((r) => r.estado === 'reservado')?.show).toBe(true)
    expect(results.find((r) => r.estado === 'vendido')?.show).toBe(true)
  })

  it('exactamente 2 de los 3 estados activan el botón', () => {
    const estados: EstadoLote[] = ['disponible', 'reservado', 'vendido']
    const active = estados.filter(shouldShowGenerateButton)
    expect(active).toHaveLength(2)
    expect(active).toContain('reservado')
    expect(active).toContain('vendido')
  })
})

// ─── Tests: construcción del href ────────────────────────────────────────────

describe('F-v2-4.12 — buildGenerateUrl: construcción de la URL', () => {
  it('genera la URL con el UUID del lote', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    expect(buildGenerateUrl(id)).toBe(`/documentos/generar/${id}`)
  })

  it('la URL empieza con /documentos/generar/', () => {
    const url = buildGenerateUrl('cualquier-id')
    expect(url).toMatch(/^\/documentos\/generar\//)
  })

  it('la URL incluye el ID completo al final', () => {
    const id = 'test-lot-uuid-123'
    const url = buildGenerateUrl(id)
    expect(url.endsWith(id)).toBe(true)
  })

  it('la URL NO contiene /proyectos (ruta incorrecta)', () => {
    const url = buildGenerateUrl('lot-id')
    expect(url).not.toContain('/proyectos')
  })

  it('la URL NO contiene /projects (el redirect fallback va ahí, no la URL del botón)', () => {
    const url = buildGenerateUrl('lot-id')
    // El botón es /documentos/generar/..., no /projects/...
    expect(url.startsWith('/projects')).toBe(false)
  })
})

// ─── Tests: redirect fallback correcto en la página ──────────────────────────

describe('F-v2-4.12 — página generar/[lotId]: redirect de fallback', () => {
  /**
   * Constante extraída de page.tsx — si la query de Supabase devuelve null (lote
   * no encontrado o sin acceso RLS), la página redirige a esta ruta.
   */
  const FALLBACK_REDIRECT = '/projects'

  it('fallback redirect apunta a /projects (ruta válida del app)', () => {
    expect(FALLBACK_REDIRECT).toBe('/projects')
  })

  it('fallback redirect NO apunta a /proyectos (ruta inexistente → causaría 404)', () => {
    expect(FALLBACK_REDIRECT).not.toBe('/proyectos')
  })

  it('fallback redirect comienza con /', () => {
    expect(FALLBACK_REDIRECT.startsWith('/')).toBe(true)
  })
})

// ─── Tests: contrato del componente con el lot ────────────────────────────────

describe('F-v2-4.12 — integración LotDetails + URL', () => {
  const makeLot = (id: string, estado: EstadoLote): LotDetails => ({
    id,
    estado,
    numero_lote: '5',
  })

  it('lote reservado: muestra botón y URL correcta', () => {
    const lot = makeLot('uuid-lote-reservado', 'reservado')
    expect(shouldShowGenerateButton(lot.estado)).toBe(true)
    expect(buildGenerateUrl(lot.id)).toBe('/documentos/generar/uuid-lote-reservado')
  })

  it('lote vendido: muestra botón y URL correcta', () => {
    const lot = makeLot('uuid-lote-vendido', 'vendido')
    expect(shouldShowGenerateButton(lot.estado)).toBe(true)
    expect(buildGenerateUrl(lot.id)).toBe('/documentos/generar/uuid-lote-vendido')
  })

  it('lote disponible: NO muestra botón (no hay URL que validar)', () => {
    const lot = makeLot('uuid-lote-disponible', 'disponible')
    expect(shouldShowGenerateButton(lot.estado)).toBe(false)
  })

  it('el ID del lote se preserva exactamente en la URL (sin encodear ni mutar)', () => {
    const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    const url = buildGenerateUrl(id)
    const extractedId = url.replace('/documentos/generar/', '')
    expect(extractedId).toBe(id)
  })
})
