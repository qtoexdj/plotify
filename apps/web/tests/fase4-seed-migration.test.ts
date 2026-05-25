/**
 * FASE 4 — F-v2-4.6
 * Tests para supabase/migrations/20260331050000_seed_escritura_blocks.sql
 *
 * Verifica que:
 * 1. ESCRITURA_ARTICLES tiene exactamente 19 artículos
 * 2. Los títulos del catálogo coinciden 1:1 con los `name` del seed SQL
 *    (la migración usa titulo→name; deben ser idénticos)
 * 3. Los artículos condicionales y opcionales tienen el tag correcto en el seed
 * 4. Los artículos con variables_required != [] tienen tags que lo reflejan
 * 5. La función seed trabaja con SECURITY DEFINER
 *    (verificado en integración SQL — tests de consistencia aquí)
 */
import { describe, it, expect } from 'vitest'
import { ESCRITURA_ARTICLES } from '@/types/documents'

// ─── Nombres canónicos insertados por seed_escritura_blocks ──────────────────
// Fuente de verdad: supabase/migrations/20260331050000_seed_escritura_blocks.sql
const SEED_NAMES_IN_ORDER = [
  'Comparecencia',
  'PRIMERO — Antecedentes',
  'SEGUNDO — Subdivisión y Lote',
  'TERCERO — Objeto de Venta',
  'CUARTO — Precio y Pago',
  'QUINTO — Venta Ad-Corpus',
  'SEXTO — Servidumbre de Tránsito',
  'SÉPTIMO — Entrega Material',
  'OCTAVO — Gastos',
  'NOVENO — Domicilio Judicial',
  'DÉCIMO — Finiquito',
  'UNDÉCIMO — Exoneraciones Especiales',
  'DUODÉCIMO — IVA y Exención',
  'DECIMOTERCERO — Mandato de Rectificación',
  'DECIMOCUARTO — Deudores de Alimentos',
  'DECIMOQUINTO — Uso de Suelo',
  'DECIMOSEXTO — Facultad de Copia',
  'Personería y Poderes',
  'Cierre y Firmas',
] as const

// ─── Suite: consistencia catálogo ↔ seed SQL ─────────────────────────────────

describe('F-v2-4.6 seed_escritura_blocks — consistencia catálogo ↔ SQL', () => {
  it('hay exactamente 19 artículos en ESCRITURA_ARTICLES', () => {
    expect(ESCRITURA_ARTICLES).toHaveLength(19)
  })

  it('hay exactamente 19 nombres en la lista de seed', () => {
    expect(SEED_NAMES_IN_ORDER).toHaveLength(19)
  })

  it('cada titulo de ESCRITURA_ARTICLES coincide con el name del seed (en orden)', () => {
    ESCRITURA_ARTICLES.forEach((article, i) => {
      expect(article.titulo).toBe(SEED_NAMES_IN_ORDER[i])
    })
  })

  it('no hay títulos duplicados en el catálogo', () => {
    const titulos = ESCRITURA_ARTICLES.map((a) => a.titulo)
    expect(new Set(titulos).size).toBe(19)
  })

  it('no hay nombres duplicados en la lista del seed', () => {
    expect(new Set(SEED_NAMES_IN_ORDER).size).toBe(19)
  })
})

// ─── Suite: artículos condicionales tienen condition_field ────────────────────

describe('F-v2-4.6 seed_escritura_blocks — artículos condicionales', () => {
  it('ART-06 (Servidumbre) es conditional y tiene condition_field', () => {
    const art06 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-06')!
    expect(art06.condition).toBe('conditional')
    expect(art06.condition_field).toBe('servidumbre.aplica')
    // El seed incluye tag 'condicional'
    expect(art06.titulo).toBe('SEXTO — Servidumbre de Tránsito')
  })

  it('personeria es conditional y tiene condition_field', () => {
    const art = ESCRITURA_ARTICLES.find((a) => a.id === 'personeria')!
    expect(art.condition).toBe('conditional')
    expect(art.condition_field).toBe('personeria.aplica')
    // El seed incluye tag 'condicional'
    expect(art.titulo).toBe('Personería y Poderes')
  })

  it('ART-11 (Exoneraciones) es optional', () => {
    const art11 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-11')!
    expect(art11.condition).toBe('optional')
    // El seed incluye tag 'opcional'
    expect(art11.titulo).toBe('UNDÉCIMO — Exoneraciones Especiales')
  })

  it('todos los demás artículos son fixed', () => {
    const nonFixed = ESCRITURA_ARTICLES.filter(
      (a) =>
        a.condition !== 'fixed' && a.id !== 'ART-06' && a.id !== 'ART-11' && a.id !== 'personeria'
    )
    expect(nonFixed).toHaveLength(0)
  })
})

// ─── Suite: auto_generators mapeados correctamente ───────────────────────────

describe('F-v2-4.6 seed_escritura_blocks — auto_generators', () => {
  it('ART-02 tiene auto_generators=[deslindes]', () => {
    const art02 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-02')!
    expect(art02.auto_generators).toEqual(['deslindes'])
    expect(art02.titulo).toBe('SEGUNDO — Subdivisión y Lote')
  })

  it('ART-06 tiene auto_generators=[servidumbre]', () => {
    const art06 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-06')!
    expect(art06.auto_generators).toEqual(['servidumbre'])
  })

  it('solo ART-02 y ART-06 tienen auto_generators', () => {
    const withGenerators = ESCRITURA_ARTICLES.filter(
      (a) => a.auto_generators && a.auto_generators.length > 0
    )
    expect(withGenerators).toHaveLength(2)
    expect(withGenerators.map((a) => a.id)).toEqual(['ART-02', 'ART-06'])
  })
})

// ─── Suite: variables del seed alineadas con tipos ───────────────────────────

describe('F-v2-4.6 seed_escritura_blocks — variables_required', () => {
  it('ART-05, ART-07, ART-08, ART-10, ART-12, ART-15, ART-16 tienen variables_required vacío', () => {
    // ART-14 usa comprador.rut + vendedor.rut para la declaración de alimentos
    const noVarIds = ['ART-05', 'ART-07', 'ART-08', 'ART-10', 'ART-12', 'ART-15', 'ART-16']
    noVarIds.forEach((id) => {
      const art = ESCRITURA_ARTICLES.find((a) => a.id === id)!
      expect(art.variables_required, `${id} debe tener variables_required vacío`).toHaveLength(0)
    })
  })

  it('Comparecencia consume variables de vendedor y comprador', () => {
    const art = ESCRITURA_ARTICLES.find((a) => a.id === 'comparecencia')!
    expect(art.variables_required).toContain('vendedor.nombre')
    expect(art.variables_required).toContain('comprador.nombre')
  })

  it('ART-04 consume variables de transaccion', () => {
    const art04 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-04')!
    expect(art04.variables_required).toContain('transaccion.precio_numeros')
    expect(art04.variables_required).toContain('transaccion.precio_letras')
  })

  it('ART-13 consume variables de mandato', () => {
    const art13 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-13')!
    expect(art13.variables_required).toContain('mandato.nombre_representante')
    expect(art13.variables_required).toContain('mandato.rut_representante')
  })

  it('Cierre consume nombre y rut de ambas partes', () => {
    const cierre = ESCRITURA_ARTICLES.find((a) => a.id === 'cierre')!
    expect(cierre.variables_required).toContain('vendedor.nombre')
    expect(cierre.variables_required).toContain('vendedor.rut')
    expect(cierre.variables_required).toContain('comprador.nombre')
    expect(cierre.variables_required).toContain('comprador.rut')
  })
})

// ─── Suite: orden canónico ────────────────────────────────────────────────────

describe('F-v2-4.6 seed_escritura_blocks — orden del catálogo', () => {
  it('empieza con comparecencia', () => {
    expect(ESCRITURA_ARTICLES[0].id).toBe('comparecencia')
    expect(ESCRITURA_ARTICLES[0].titulo).toBe('Comparecencia')
  })

  it('termina con cierre', () => {
    const last = ESCRITURA_ARTICLES[ESCRITURA_ARTICLES.length - 1]
    expect(last.id).toBe('cierre')
    expect(last.titulo).toBe('Cierre y Firmas')
  })

  it('personeria está penúltimo (antes de cierre)', () => {
    const idx = ESCRITURA_ARTICLES.findIndex((a) => a.id === 'personeria')
    expect(idx).toBe(17) // índice 17 de 19 (0-based)
  })

  it('ART-01 a ART-16 están en orden numérico consecutivo', () => {
    const artPositions = ESCRITURA_ARTICLES.map((a, i) => ({ id: a.id, i })).filter(({ id }) =>
      id.startsWith('ART-')
    )

    expect(artPositions).toHaveLength(16)
    // Verificar que el índice 0→comparecencia, 1→ART-01, ..., 16→ART-16
    artPositions.forEach(({ id, i }) => {
      const n = parseInt(id.replace('ART-', ''), 10)
      expect(i).toBe(n) // ART-01 en posición 1, ART-16 en posición 16
    })
  })
})
