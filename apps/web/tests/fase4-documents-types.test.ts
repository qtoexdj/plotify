/**
 * FASE 4 — F-v2-4.5
 * Tests para src/types/documents.ts
 *
 * Verifica en runtime y con expectTypeOf que:
 * - ESCRITURA_ARTICLES tiene exactamente 19 artículos
 * - Todos los ArticleType están representados
 * - Los artículos fijos (fixed) no tienen condition_field
 * - Los artículos condicionales (conditional) tienen condition_field
 * - Los artículos opcionales (optional) son exactamente ART-06 y ART-11
 * - Los auto_generators están asignados a los artículos correctos (ART-02, ART-06)
 * - ComparecientePersona acepta representantes recursivos (persona jurídica)
 * - EscrituraVariables tiene todos los grupos del diccionario de variables
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  ESCRITURA_ARTICLES,
  type ArticleType,
  type ArticleCondition,
  type ArticleMetadata,
  type ComparecientePersona,
  type EscrituraVariables,
} from '@/types/documents'

// ─── Catálogo ESCRITURA_ARTICLES ──────────────────────────────────────────────

describe('ESCRITURA_ARTICLES — catálogo completo', () => {
  it('tiene 19 artículos (comparecencia + ART-01..ART-16 + personeria + cierre)', () => {
    expect(ESCRITURA_ARTICLES).toHaveLength(19)
  })

  it('el primer artículo es comparecencia y el último es cierre', () => {
    expect(ESCRITURA_ARTICLES[0].id).toBe('comparecencia')
    expect(ESCRITURA_ARTICLES[ESCRITURA_ARTICLES.length - 1].id).toBe('cierre')
  })

  it('todos los ArticleType están presentes exactamente una vez', () => {
    const expectedIds: ArticleType[] = [
      'comparecencia',
      'ART-01', 'ART-02', 'ART-03', 'ART-04', 'ART-05',
      'ART-06', 'ART-07', 'ART-08', 'ART-09', 'ART-10',
      'ART-11', 'ART-12', 'ART-13', 'ART-14', 'ART-15',
      'ART-16', 'personeria', 'cierre',
    ]
    const actualIds = ESCRITURA_ARTICLES.map((a) => a.id)
    expect(actualIds).toEqual(expectedIds)
  })

  it('no hay ids duplicados', () => {
    const ids = ESCRITURA_ARTICLES.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ─── Conditions ───────────────────────────────────────────────────────────────

describe('ESCRITURA_ARTICLES — conditions', () => {
  it('los artículos con condition=conditional son ART-06 y personeria', () => {
    const conditional = ESCRITURA_ARTICLES.filter((a) => a.condition === 'conditional').map((a) => a.id)
    expect(conditional).toEqual(['ART-06', 'personeria'])
  })

  it('ART-06 tiene condition_field="servidumbre.aplica"', () => {
    const art06 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-06')!
    expect(art06.condition_field).toBe('servidumbre.aplica')
  })

  it('personeria tiene condition_field="personeria.aplica"', () => {
    const personeria = ESCRITURA_ARTICLES.find((a) => a.id === 'personeria')!
    expect(personeria.condition_field).toBe('personeria.aplica')
  })

  it('el único artículo optional es ART-11', () => {
    const optional = ESCRITURA_ARTICLES.filter((a) => a.condition === 'optional').map((a) => a.id)
    expect(optional).toEqual(['ART-11'])
  })

  it('los artículos fixed no tienen condition_field', () => {
    const fixed = ESCRITURA_ARTICLES.filter((a) => a.condition === 'fixed')
    fixed.forEach((a) => {
      expect(a.condition_field).toBeUndefined()
    })
  })
})

// ─── Auto-generators ─────────────────────────────────────────────────────────

describe('ESCRITURA_ARTICLES — auto_generators', () => {
  it('ART-02 tiene auto_generators=["deslindes"]', () => {
    const art02 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-02')!
    expect(art02.auto_generators).toEqual(['deslindes'])
  })

  it('ART-06 tiene auto_generators=["servidumbre"]', () => {
    const art06 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-06')!
    expect(art06.auto_generators).toEqual(['servidumbre'])
  })

  it('solo ART-02 y ART-06 tienen auto_generators', () => {
    const withGenerators = ESCRITURA_ARTICLES.filter((a) => a.auto_generators).map((a) => a.id)
    expect(withGenerators).toEqual(['ART-02', 'ART-06'])
  })
})

// ─── Variables requeridas en artículos clave ──────────────────────────────────

describe('ESCRITURA_ARTICLES — variables_required', () => {
  it('ART-04 requiere precio y forma_pago', () => {
    const art04 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-04')!
    expect(art04.variables_required).toContain('transaccion.precio_numeros')
    expect(art04.variables_required).toContain('transaccion.precio_letras')
    expect(art04.variables_required).toContain('transaccion.forma_pago')
  })

  it('ART-13 requiere datos del mandato', () => {
    const art13 = ESCRITURA_ARTICLES.find((a) => a.id === 'ART-13')!
    expect(art13.variables_required).toContain('mandato.nombre_representante')
    expect(art13.variables_required).toContain('mandato.rut_representante')
  })

  it('comparecencia requiere datos de vendedor y comprador', () => {
    const comp = ESCRITURA_ARTICLES.find((a) => a.id === 'comparecencia')!
    expect(comp.variables_required).toContain('vendedor.nombre')
    expect(comp.variables_required).toContain('comprador.rut')
  })
})

// ─── Tipos TypeScript en runtime ─────────────────────────────────────────────

describe('ArticleMetadata — estructura de tipos', () => {
  it('condition es "fixed" | "optional" | "conditional"', () => {
    expectTypeOf<ArticleCondition>().toEqualTypeOf<'fixed' | 'optional' | 'conditional'>()
  })

  it('ArticleMetadata tiene las propiedades id, titulo, condition y variables_required', () => {
    expectTypeOf<ArticleMetadata>().toHaveProperty('id')
    expectTypeOf<ArticleMetadata>().toHaveProperty('titulo')
    expectTypeOf<ArticleMetadata>().toHaveProperty('condition')
    expectTypeOf<ArticleMetadata>().toHaveProperty('variables_required')
  })
})

// ─── ComparecientePersona — tipos ────────────────────────────────────────────

describe('ComparecientePersona — estructura', () => {
  it('acepta persona natural básica', () => {
    const persona: ComparecientePersona = {
      tipo: 'natural',
      nombre: 'JUAN DE DIOS GALAZ ABARCA',
      rut: '12.345.678-9',
    }
    expect(persona.tipo).toBe('natural')
    expect(persona.nombre).toBeDefined()
  })

  it('acepta persona jurídica con representantes recursivos', () => {
    const representante: ComparecientePersona = {
      tipo: 'natural',
      nombre: 'PEDRO PÉREZ SOTO',
      rut: '9.876.543-2',
    }
    const empresa: ComparecientePersona = {
      tipo: 'juridica',
      nombre: 'INMOBILIARIA BELLA VISTA SpA',
      rut: '76.543.210-1',
      profesion_giro: 'Inversiones inmobiliarias',
      representantes: [representante],
    }
    expect(empresa.tipo).toBe('juridica')
    expect(empresa.representantes).toHaveLength(1)
    expect(empresa.representantes![0].nombre).toBe('PEDRO PÉREZ SOTO')
  })
})

// ─── EscrituraVariables — grupos del diccionario ─────────────────────────────

describe('EscrituraVariables — grupos completos del diccionario', () => {
  it('tiene los 9 grupos del diccionario de variables', () => {
    expectTypeOf<EscrituraVariables>().toHaveProperty('vendedor')
    expectTypeOf<EscrituraVariables>().toHaveProperty('comprador')
    expectTypeOf<EscrituraVariables>().toHaveProperty('matriz')
    expectTypeOf<EscrituraVariables>().toHaveProperty('sag')
    expectTypeOf<EscrituraVariables>().toHaveProperty('lote')
    expectTypeOf<EscrituraVariables>().toHaveProperty('servidumbre')
    expectTypeOf<EscrituraVariables>().toHaveProperty('transaccion')
    expectTypeOf<EscrituraVariables>().toHaveProperty('mandato')
    expectTypeOf<EscrituraVariables>().toHaveProperty('personeria')
  })

  it('servidumbre.aplica es boolean', () => {
    expectTypeOf<EscrituraVariables['servidumbre']['aplica']>().toEqualTypeOf<boolean>()
  })

  it('personeria.aplica es boolean', () => {
    expectTypeOf<EscrituraVariables['personeria']['aplica']>().toEqualTypeOf<boolean>()
  })

  it('matriz.deslindes acepta claves dinámicas adicionales', () => {
    const vars: EscrituraVariables = {
      vendedor: { tipo: 'natural', nombre: 'TEST', rut: '1.111.111-1' },
      comprador: { tipo: 'natural', nombre: 'TEST', rut: '2.222.222-2' },
      matriz: {
        nombre_predio: 'Fundo Los Maquis',
        ubicacion: 'Colchagua',
        superficie_total: '500 ha',
        deslindes: {
          norte: 'con Río Tinguiririca',
          nororiente: 'con camino público',  // clave dinámica
        },
      },
      sag: {},
      lote: { numero_nombre: 'LOTE DOSCIENTOS', superficie_total: '300 m2', deslindes: 'Norte: ...' },
      servidumbre: { aplica: false },
      transaccion: { precio_numeros: '50000000', precio_letras: 'CINCUENTA MILLONES', forma_pago: 'al contado' },
      mandato: {},
      personeria: { aplica: false },
    }
    expect(vars.matriz.deslindes['nororiente']).toBe('con camino público')
    expect(vars.servidumbre.aplica).toBe(false)
  })
})
