import { describe, expect, it } from 'vitest'
import {
  computeMoldeProgress,
  groupByProducer,
  reviewBucket,
  toMatrixEntries,
} from '@/lib/legal/variable-matrix-model'
import type {
  LegalVariableGroup,
  LegalVariableProducer,
  LegalVariableState,
  VariableInventoryItem,
} from '@/lib/legal/variable-resolution-types'

let seq = 0

function mk(
  overrides: Partial<VariableInventoryItem> & {
    variable_key: string
    producer: LegalVariableProducer
    state: LegalVariableState
  }
): VariableInventoryItem {
  seq += 1
  return {
    id: `v${seq}`,
    lot_id: null,
    escritura_case_id: null,
    variable_group: 'matriz' as LegalVariableGroup,
    value_text: null,
    value_json: null,
    source_type: 'document',
    confidence: null,
    approval_required: false,
    correction_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    evidence: [],
    ...overrides,
  }
}

/** Inventario que reproduce el proyecto real Teno: 21 listas + 13 por revisar. */
function tenoInventory(): VariableInventoryItem[] {
  const items: VariableInventoryItem[] = []

  // 21 listas (extraidas y aprobadas): predio matriz, SAG, titulo.
  for (let i = 0; i < 21; i += 1) {
    items.push(mk({ variable_key: `extracted.aprobada.${i}`, producer: 'extracted', state: 'approved' }))
  }

  // Vendedor: 4 extraidas por revisar (del dominio vigente).
  for (const key of ['nombre', 'rut', 'profesion_giro', 'domicilio']) {
    items.push(
      mk({ variable_key: `vendedor.${key}`, variable_group: 'vendedor', producer: 'extracted', state: 'proposed' })
    )
  }

  // Roles SII por lote: 53 lotes x 2 campos = 106 filas que colapsan a 2 entradas.
  for (let lot = 1; lot <= 53; lot += 1) {
    items.push(
      mk({ variable_key: 'sii.unidad_nombre', variable_group: 'sii', producer: 'extracted', state: 'proposed', lot_id: `lot${lot}` })
    )
    items.push(
      mk({ variable_key: 'sii.pre_rol_lote', variable_group: 'sii', producer: 'extracted', state: 'proposed', lot_id: `lot${lot}` })
    )
  }

  // Cabecera SII: 5 extraidas por revisar.
  for (const key of [
    'rol_matriz',
    'rol_avaluo_en_tramite_texto',
    'certificado_asignacion_roles_numero',
    'certificado_fecha_emision',
    'solicitud_numero',
  ]) {
    items.push(mk({ variable_key: `sii.${key}`, variable_group: 'sii', producer: 'extracted', state: 'proposed' }))
  }

  // SAG: 2 manuales por revisar (del plano / Conservador).
  for (const key of ['oficina_sectorial', 'plano_cbr_numero']) {
    items.push(mk({ variable_key: `sag.${key}`, variable_group: 'sag', producer: 'manual', state: 'proposed' }))
  }

  // No accionables (no cuentan en el molde).
  items.push(mk({ variable_key: 'clausulas.quinto', variable_group: 'clausulas', producer: 'authored', state: 'missing' }))
  items.push(mk({ variable_key: 'comprador.nombre', variable_group: 'comprador', producer: 'sale_gap', state: 'missing' }))
  items.push(mk({ variable_key: 'documento.notaria', variable_group: 'documento', producer: 'signing', state: 'missing' }))

  return items
}

describe('reviewBucket', () => {
  it('aprobada/derivada/no-aplica son "listo"', () => {
    expect(reviewBucket(mk({ variable_key: 'x.a', producer: 'extracted', state: 'approved' }))).toBe('listo')
    expect(reviewBucket(mk({ variable_key: 'x.b', producer: 'extracted', state: 'derived' }))).toBe('listo')
    expect(reviewBucket(mk({ variable_key: 'x.c', producer: 'manual', state: 'not_applicable' }))).toBe('listo')
  })

  it('extraida/manual sin resolver son "por_revisar"', () => {
    expect(reviewBucket(mk({ variable_key: 'x.d', producer: 'extracted', state: 'proposed' }))).toBe('por_revisar')
    expect(reviewBucket(mk({ variable_key: 'x.e', producer: 'manual', state: 'missing' }))).toBe('por_revisar')
  })

  it('hueco de venta y firma son "no_editable"', () => {
    expect(reviewBucket(mk({ variable_key: 'comprador.rut', producer: 'sale_gap', state: 'missing' }))).toBe('no_editable')
    expect(reviewBucket(mk({ variable_key: 'documento.fecha', producer: 'signing', state: 'missing' }))).toBe('no_editable')
  })
})

describe('toMatrixEntries — colapso SII por lote', () => {
  it('colapsa cada clave SII repetida en una entrada con el conteo de lotes', () => {
    const entries = toMatrixEntries(tenoInventory())
    const collapsed = entries.filter((entry) => entry.kind === 'collapsed')
    expect(collapsed).toHaveLength(2)
    for (const entry of collapsed) {
      expect(entry.kind).toBe('collapsed')
      if (entry.kind === 'collapsed') {
        expect(entry.lotCount).toBe(53)
        expect(entry.items).toHaveLength(53)
        expect(['sii.unidad_nombre', 'sii.pre_rol_lote']).toContain(entry.variableKey)
      }
    }
  })

  it('una sola fila de una clave por-lote NO colapsa', () => {
    const entries = toMatrixEntries([
      mk({ variable_key: 'sii.pre_rol_lote', variable_group: 'sii', producer: 'extracted', state: 'proposed', lot_id: 'lot1' }),
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('single')
  })
})

describe('groupByProducer', () => {
  it('agrupa en el orden extracted → manual → authored → sale_gap → signing', () => {
    const sections = groupByProducer(tenoInventory())
    expect(sections.map((section) => section.producer)).toEqual([
      'extracted',
      'manual',
      'authored',
      'sale_gap',
      'signing',
    ])
  })

  it('cuenta "por revisar" por seccion con SII colapsado', () => {
    const sections = groupByProducer(tenoInventory())
    const byProducer = Object.fromEntries(sections.map((section) => [section.producer, section]))
    expect(byProducer.extracted.porRevisar).toBe(11) // 4 vendedor + 7 SII (2 colapsadas + 5)
    expect(byProducer.manual.porRevisar).toBe(2)
    expect(byProducer.authored.porRevisar).toBe(0)
    expect(byProducer.sale_gap.porRevisar).toBe(0)
  })
})

describe('computeMoldeProgress', () => {
  it('reproduce los numeros de Teno: 13 por revisar, 21 listas, 34 totales', () => {
    const progress = computeMoldeProgress(tenoInventory())
    expect(progress).toEqual({
      porRevisar: 13,
      listas: 21,
      total: 34,
      moldeAprobable: false,
    })
  })

  it('excluye huecos de venta y firma del conteo', () => {
    const progress = computeMoldeProgress([
      mk({ variable_key: 'comprador.nombre', producer: 'sale_gap', state: 'missing' }),
      mk({ variable_key: 'documento.notaria', producer: 'signing', state: 'missing' }),
      mk({ variable_key: 'vendedor.nombre', producer: 'extracted', state: 'approved' }),
    ])
    expect(progress).toEqual({ porRevisar: 0, listas: 1, total: 1, moldeAprobable: true })
  })
})
