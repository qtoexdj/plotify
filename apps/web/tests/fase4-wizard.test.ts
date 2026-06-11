/**
 * FASE 4 — F-v2-4.11
 * Tests de lógica pura del GenerationWizard:
 *   - resolveTemplate: resolución local de variables Jinja2 (Step 3 preview)
 *   - formValuesToEscrituraVars: mapeo form plano → EscrituraVariables anidadas
 *   - WizardFormSchema: validación Zod del formulario de Step 2
 *   - Auto-relleno de lote: cálculos de lote_numero_nombre, servidumbre_aplica,
 *     precio_letras que ocurren en el useEffect del Step 2
 *   - servidumbre_aplica: se activa iff servidumbre_m2 > 0
 *
 * Nota: componentes React no se renderizan en vitest (env node).
 * Se testean únicamente las funciones puras extraídas o replicadas del wizard.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import { numberToWords } from '@/lib/legal/number-to-words'
import type { EscrituraVariables } from '@/types/documents'

// ─── Replicar lógica pura del wizard (misma que en generation-wizard.tsx) ─────

/**
 * Resolución local de variables Jinja2.
 * Soporta: {{ variable.campo }} y {{ variable.campo | default("valor") }}
 */
function resolveTemplate(templateHtml: string, variables: EscrituraVariables): string {
  return templateHtml.replace(
    /\{\{\s*([\w.]+)\s*(?:\|\s*default\("([^"]*)"\)|\|[^}]*)?\s*\}\}/g,
    (_: string, key: string, fallback: string) => {
      let cursor: unknown = variables as unknown
      for (const k of key.split('.')) {
        if (cursor && typeof cursor === 'object') {
          cursor = (cursor as Record<string, unknown>)[k] ?? null
        } else {
          cursor = null
          break
        }
      }
      if (typeof cursor === 'string') return cursor
      return fallback ?? `[${key}]`
    }
  )
}

/** Schema Zod del Step 2 (idéntico al del wizard) */
const WizardFormSchema = z.object({
  vendedor_tipo: z.enum(['natural', 'juridica']),
  vendedor_nombre: z.string(),
  vendedor_rut: z.string(),
  vendedor_domicilio: z.string(),
  comprador_nombre: z.string(),
  comprador_rut: z.string(),
  comprador_domicilio: z.string(),
  comprador_estado_civil: z.string(),
  comprador_profesion: z.string(),
  matriz_nombre_predio: z.string(),
  matriz_ubicacion: z.string(),
  matriz_superficie_total: z.string(),
  matriz_norte: z.string(),
  matriz_sur: z.string(),
  matriz_oriente: z.string(),
  matriz_poniente: z.string(),
  matriz_rol_avaluo: z.string(),
  sag_certificado_numero: z.string(),
  sag_certificado_fecha: z.string(),
  sag_plano_cbr_numero: z.string(),
  sag_plano_cbr_anio: z.string(),
  lote_numero_nombre: z.string(),
  lote_superficie_total: z.string(),
  lote_deslindes: z.string(),
  lote_rol_tramite: z.string(),
  servidumbre_aplica: z.boolean(),
  servidumbre_superficie: z.string(),
  servidumbre_deslindes_tramo: z.string(),
  transaccion_precio_numeros: z.string(),
  transaccion_precio_letras: z.string(),
  transaccion_forma_pago: z.string(),
  mandato_nombre_representante: z.string(),
  mandato_rut_representante: z.string(),
  personeria_aplica: z.boolean(),
  personeria_tipo_documento: z.string(),
  personeria_notaria: z.string(),
  personeria_fecha: z.string(),
  personeria_inscripcion_fojas: z.string(),
  personeria_inscripcion_numero: z.string(),
  personeria_inscripcion_anio: z.string(),
  personeria_inscripcion_cbr: z.string(),
})

type WizardFormValues = z.infer<typeof WizardFormSchema>

/** Mapeo form plano → EscrituraVariables anidadas (idéntico al del wizard) */
function formValuesToEscrituraVars(vals: WizardFormValues): EscrituraVariables {
  return {
    vendedor: {
      tipo: vals.vendedor_tipo,
      nombre: vals.vendedor_nombre,
      rut: vals.vendedor_rut,
      domicilio: vals.vendedor_domicilio,
    },
    comprador: {
      tipo: 'natural',
      nombre: vals.comprador_nombre,
      rut: vals.comprador_rut,
      domicilio: vals.comprador_domicilio,
      estado_civil: vals.comprador_estado_civil,
      profesion_giro: vals.comprador_profesion,
    },
    matriz: {
      nombre_predio: vals.matriz_nombre_predio,
      ubicacion: vals.matriz_ubicacion,
      superficie_total: vals.matriz_superficie_total,
      deslindes: {
        norte: vals.matriz_norte,
        sur: vals.matriz_sur,
        oriente: vals.matriz_oriente,
        poniente: vals.matriz_poniente,
      },
      rol_avaluo: vals.matriz_rol_avaluo,
    },
    sag: {
      certificado_numero: vals.sag_certificado_numero,
      certificado_fecha: vals.sag_certificado_fecha,
      plano_cbr_numero: vals.sag_plano_cbr_numero,
      plano_cbr_anio: vals.sag_plano_cbr_anio,
    },
    lote: {
      numero_nombre: vals.lote_numero_nombre,
      superficie_total: vals.lote_superficie_total,
      deslindes: vals.lote_deslindes,
      rol_tramite: vals.lote_rol_tramite,
    },
    servidumbre: {
      aplica: vals.servidumbre_aplica,
      superficie: vals.servidumbre_superficie,
      deslindes_tramo: vals.servidumbre_deslindes_tramo,
    },
    transaccion: {
      precio_numeros: vals.transaccion_precio_numeros,
      precio_letras: vals.transaccion_precio_letras,
      forma_pago: vals.transaccion_forma_pago,
    },
    mandato: {
      nombre_representante: vals.mandato_nombre_representante,
      rut_representante: vals.mandato_rut_representante,
    },
    personeria: {
      aplica: vals.personeria_aplica,
      tipo_documento: vals.personeria_tipo_documento,
      notaria: vals.personeria_notaria,
      fecha: vals.personeria_fecha,
      inscripcion_fojas: vals.personeria_inscripcion_fojas,
      inscripcion_numero: vals.personeria_inscripcion_numero,
      inscripcion_anio: vals.personeria_inscripcion_anio,
      inscripcion_cbr: vals.personeria_inscripcion_cbr,
    },
  }
}

/**
 * Lógica de auto-relleno del Step 2.
 * Replica exactamente lo que hace el useEffect en el wizard.
 */
function buildAutoFill(lot: {
  numero_lote: string
  area_official_m2: number | null
  m2: number | null
  servidumbre_m2: number | null
  precio: number | null
  lot_records: Array<{
    cliente_nombre: string | null
    cliente_run: string | null
    cliente_direccion: string | null
    cliente_estado_civil: string | null
    cliente_ocupacion: string | null
  }> | null
}) {
  const lotRecord = lot.lot_records?.[0]
  const area = lot.area_official_m2 ?? lot.m2
  const precio = lot.precio

  const lotNumero = parseInt(lot.numero_lote, 10)
  const lotNumeroWords = !isNaN(lotNumero)
    ? numberToWords(lotNumero).replace(/^UN(\s|$)/, 'UNO$1')
    : lot.numero_lote.toUpperCase()

  const areaWords = area != null && area > 0 ? `${numberToWords(area)} METROS CUADRADOS` : ''

  const precioLetras = precio != null && precio > 0 ? `${numberToWords(precio)} PESOS` : ''

  const tieneServidumbre = (lot.servidumbre_m2 ?? 0) > 0
  const servidumbreWords =
    tieneServidumbre && lot.servidumbre_m2 != null
      ? `${numberToWords(lot.servidumbre_m2)} METROS CUADRADOS`
      : ''

  return {
    comprador_nombre: lotRecord?.cliente_nombre ?? '',
    comprador_rut: lotRecord?.cliente_run ?? '',
    comprador_domicilio: lotRecord?.cliente_direccion ?? '',
    comprador_estado_civil: lotRecord?.cliente_estado_civil ?? '',
    comprador_profesion: lotRecord?.cliente_ocupacion ?? '',
    lote_numero_nombre: `LOTE N ${lotNumeroWords}`,
    lote_superficie_total: areaWords,
    servidumbre_aplica: tieneServidumbre,
    servidumbre_superficie: servidumbreWords,
    transaccion_precio_numeros: precio?.toString() ?? '',
    transaccion_precio_letras: precioLetras,
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FULL_FORM_VALUES: WizardFormValues = {
  vendedor_tipo: 'natural',
  vendedor_nombre: 'SOCIEDAD AGRÍCOLA LAS ROSAS LTDA',
  vendedor_rut: '76.543.210-K',
  vendedor_domicilio: 'Av. Principal 123, Santiago',
  comprador_nombre: 'JUAN CARLOS MÉNDEZ ROJAS',
  comprador_rut: '12.345.678-9',
  comprador_domicilio: 'Calle Los Robles 45, Talca',
  comprador_estado_civil: 'soltero',
  comprador_profesion: 'ingeniero',
  matriz_nombre_predio: 'EL PEUMO',
  matriz_ubicacion: 'sector Las Quebradas, Talca',
  matriz_superficie_total: 'CIEN HECTÁREAS',
  matriz_norte: 'con camino público',
  matriz_sur: 'con río Lircay',
  matriz_oriente: 'con Lote 4',
  matriz_poniente: 'con predio Santa Ana',
  matriz_rol_avaluo: '123-456',
  sag_certificado_numero: 'SAG-2024-001',
  sag_certificado_fecha: '15/01/2024',
  sag_plano_cbr_numero: 'P-2024-001',
  sag_plano_cbr_anio: '2024',
  lote_numero_nombre: 'LOTE N CIENTO SESENTA Y TRES',
  lote_superficie_total: 'DOSCIENTOS CINCUENTA METROS CUADRADOS',
  lote_deslindes:
    'NORTE, en treinta metros con camino público; SUR, en treinta metros con lote ciento sesenta y cuatro.',
  lote_rol_tramite: '789-012',
  servidumbre_aplica: true,
  servidumbre_superficie: 'DIECISIETE METROS CUADRADOS',
  servidumbre_deslindes_tramo: 'NORTE, con el mismo lote.',
  transaccion_precio_numeros: '25000000',
  transaccion_precio_letras: 'VEINTICINCO MILLONES PESOS',
  transaccion_forma_pago: 'al contado',
  mandato_nombre_representante: 'PEDRO SOTO VEGA',
  mandato_rut_representante: '9.876.543-2',
  personeria_aplica: false,
  personeria_tipo_documento: '',
  personeria_notaria: '',
  personeria_fecha: '',
  personeria_inscripcion_fojas: '',
  personeria_inscripcion_numero: '',
  personeria_inscripcion_anio: '',
  personeria_inscripcion_cbr: '',
}

// ─── Tests: resolveTemplate ───────────────────────────────────────────────────

describe('F-v2-4.11 — resolveTemplate: Step 3 preview', () => {
  const vars = formValuesToEscrituraVars(FULL_FORM_VALUES)

  it('resuelve una variable de nivel 2 correctamente', () => {
    const html = '<p>El vendedor es {{ vendedor.nombre }}.</p>'
    expect(resolveTemplate(html, vars)).toBe(
      '<p>El vendedor es SOCIEDAD AGRÍCOLA LAS ROSAS LTDA.</p>'
    )
  })

  it('resuelve múltiples variables en un párrafo', () => {
    const html =
      'Precio: {{ transaccion.precio_numeros }} ({{ transaccion.precio_letras }}), {{ transaccion.forma_pago }}.'
    const result = resolveTemplate(html, vars)
    expect(result).toContain('25000000')
    expect(result).toContain('VEINTICINCO MILLONES PESOS')
    expect(result).toContain('al contado')
    expect(result).not.toContain('{{')
  })

  it('resuelve variables del lote (ART-02)', () => {
    const html =
      '{{ lote.numero_nombre }}, con superficie {{ lote.superficie_total }}, deslindando: {{ lote.deslindes }}'
    const result = resolveTemplate(html, vars)
    expect(result).toContain('LOTE N CIENTO SESENTA Y TRES')
    expect(result).toContain('DOSCIENTOS CINCUENTA METROS CUADRADOS')
    expect(result).not.toContain('{{')
  })

  it('usa el fallback cuando la variable no está definida', () => {
    const html = '{{ vendedor.email | default("sin correo") }}'
    const result = resolveTemplate(html, vars)
    expect(result).toBe('sin correo')
  })

  it('retorna [key] cuando la variable está vacía y no hay fallback', () => {
    const html = '{{ vendedor.email }}'
    const result = resolveTemplate(html, vars)
    expect(result).toBe('[vendedor.email]')
  })

  it('no deja tokens {{ }} sin resolver en template completo pre-rellenado', () => {
    const html = `
      <h1>COMPARECENCIA</h1>
      <p>{{ vendedor.nombre }}, RUT {{ vendedor.rut }}, domiciliado en {{ vendedor.domicilio }}</p>
      <p>{{ comprador.nombre }}, RUT {{ comprador.rut }}, {{ comprador.estado_civil }}</p>
      <h2>PRIMERO</h2>
      <p>Predio {{ matriz.nombre_predio }}, Rol {{ matriz.rol_avaluo }}</p>
      <h2>SEGUNDO</h2>
      <p>Lote {{ lote.numero_nombre }}, {{ lote.superficie_total }}</p>
      <h2>CUARTO</h2>
      <p>Precio: \${{ transaccion.precio_numeros }} ({{ transaccion.precio_letras }})</p>
    `
    const result = resolveTemplate(html, vars)
    const unresolvedMatches = result.match(/\{\{.*?\}\}/g)
    expect(unresolvedMatches).toBeNull()
  })

  it('resuelve variable con filtro |upper (extrae solo la key)', () => {
    const html = '{{ comprador.nombre | upper }}'
    // El filtro no se aplica en la resolución local,
    // pero tampoco debe dejar tokens sin resolver.
    const result = resolveTemplate(html, vars)
    expect(result).toBe('JUAN CARLOS MÉNDEZ ROJAS')
    expect(result).not.toContain('{{')
  })

  it('resuelve deslindes de la matriz (campo anidado en objeto deslindes)', () => {
    const html = 'Norte: {{ matriz.deslindes.norte }}'
    const result = resolveTemplate(html, vars)
    expect(result).toBe('Norte: con camino público')
  })

  it('no rompe HTML sin variables', () => {
    const html = '<p>Sin variables aquí.</p>'
    expect(resolveTemplate(html, vars)).toBe('<p>Sin variables aquí.</p>')
  })
})

// ─── Tests: formValuesToEscrituraVars ─────────────────────────────────────────

describe('F-v2-4.11 — formValuesToEscrituraVars: mapeo form → EscrituraVariables', () => {
  const mapped = formValuesToEscrituraVars(FULL_FORM_VALUES)

  it('mapea vendedor correctamente', () => {
    expect(mapped.vendedor.tipo).toBe('natural')
    expect(mapped.vendedor.nombre).toBe('SOCIEDAD AGRÍCOLA LAS ROSAS LTDA')
    expect(mapped.vendedor.rut).toBe('76.543.210-K')
    expect(mapped.vendedor.domicilio).toBe('Av. Principal 123, Santiago')
  })

  it('comprador siempre tiene tipo="natural"', () => {
    expect(mapped.comprador.tipo).toBe('natural')
  })

  it('mapea comprador correctamente', () => {
    expect(mapped.comprador.nombre).toBe('JUAN CARLOS MÉNDEZ ROJAS')
    expect(mapped.comprador.rut).toBe('12.345.678-9')
    expect(mapped.comprador.estado_civil).toBe('soltero')
    expect(mapped.comprador.profesion_giro).toBe('ingeniero')
  })

  it('mapea deslindes de la matriz a objeto anidado', () => {
    expect(mapped.matriz.deslindes.norte).toBe('con camino público')
    expect(mapped.matriz.deslindes.sur).toBe('con río Lircay')
    expect(mapped.matriz.deslindes.oriente).toBe('con Lote 4')
    expect(mapped.matriz.deslindes.poniente).toBe('con predio Santa Ana')
  })

  it('mapea lote correctamente', () => {
    expect(mapped.lote.numero_nombre).toBe('LOTE N CIENTO SESENTA Y TRES')
    expect(mapped.lote.superficie_total).toBe('DOSCIENTOS CINCUENTA METROS CUADRADOS')
    expect(mapped.lote.deslindes).toContain('NORTE')
    expect(mapped.lote.rol_tramite).toBe('789-012')
  })

  it('mapea servidumbre.aplica como boolean', () => {
    expect(mapped.servidumbre.aplica).toBe(true)
    expect(typeof mapped.servidumbre.aplica).toBe('boolean')
  })

  it('mapea transaccion correctamente', () => {
    expect(mapped.transaccion.precio_numeros).toBe('25000000')
    expect(mapped.transaccion.precio_letras).toBe('VEINTICINCO MILLONES PESOS')
    expect(mapped.transaccion.forma_pago).toBe('al contado')
  })

  it('mapea personeria.aplica como boolean', () => {
    expect(mapped.personeria.aplica).toBe(false)
    expect(typeof mapped.personeria.aplica).toBe('boolean')
  })

  it('todos los grupos de EscrituraVariables están presentes', () => {
    const keys = Object.keys(mapped)
    expect(keys).toContain('vendedor')
    expect(keys).toContain('comprador')
    expect(keys).toContain('matriz')
    expect(keys).toContain('sag')
    expect(keys).toContain('lote')
    expect(keys).toContain('servidumbre')
    expect(keys).toContain('transaccion')
    expect(keys).toContain('mandato')
    expect(keys).toContain('personeria')
  })
})

// ─── Tests: auto-relleno del Step 2 ──────────────────────────────────────────

describe('F-v2-4.11 — buildAutoFill: lógica de auto-relleno del Step 2', () => {
  const LOT_BASE = {
    numero_lote: '163',
    area_official_m2: 250.0,
    m2: 260.0,
    servidumbre_m2: 17.7,
    precio: 25_000_000,
    lot_records: [
      {
        cliente_nombre: 'JUAN CARLOS MÉNDEZ ROJAS',
        cliente_run: '12.345.678-9',
        cliente_direccion: 'Calle Los Robles 45, Talca',
        cliente_estado_civil: 'soltero',
        cliente_ocupacion: 'ingeniero',
      },
    ],
  }

  it('pre-rellena comprador desde lot_records', () => {
    const fill = buildAutoFill(LOT_BASE)
    expect(fill.comprador_nombre).toBe('JUAN CARLOS MÉNDEZ ROJAS')
    expect(fill.comprador_rut).toBe('12.345.678-9')
    expect(fill.comprador_domicilio).toBe('Calle Los Robles 45, Talca')
    expect(fill.comprador_estado_civil).toBe('soltero')
    expect(fill.comprador_profesion).toBe('ingeniero')
  })

  it('construye lote_numero_nombre en mayúsculas con "LOTE N"', () => {
    const fill = buildAutoFill(LOT_BASE)
    expect(fill.lote_numero_nombre).toMatch(/^LOTE N /)
    expect(fill.lote_numero_nombre).toMatch(/CIENTO SESENTA Y TRES$/i)
  })

  it('lote_numero_nombre con lote 1 usa "UNO" no "UN"', () => {
    const fill = buildAutoFill({ ...LOT_BASE, numero_lote: '1' })
    expect(fill.lote_numero_nombre).not.toMatch(/ UN$/)
    expect(fill.lote_numero_nombre).toContain('UNO')
  })

  it('prioriza area_official_m2 sobre m2 para lote_superficie_total', () => {
    const fill = buildAutoFill(LOT_BASE)
    // area_official_m2=250, m2=260 → debe usar 250
    expect(fill.lote_superficie_total).toContain('DOSCIENTOS CINCUENTA')
    expect(fill.lote_superficie_total).toContain('METROS CUADRADOS')
  })

  it('usa m2 si area_official_m2 es null', () => {
    const fill = buildAutoFill({ ...LOT_BASE, area_official_m2: null })
    expect(fill.lote_superficie_total).toContain('DOSCIENTOS SESENTA')
    expect(fill.lote_superficie_total).toContain('METROS CUADRADOS')
  })

  it('servidumbre_aplica=true cuando servidumbre_m2 > 0', () => {
    const fill = buildAutoFill(LOT_BASE)
    expect(fill.servidumbre_aplica).toBe(true)
  })

  it('servidumbre_aplica=false cuando servidumbre_m2 es null', () => {
    const fill = buildAutoFill({ ...LOT_BASE, servidumbre_m2: null })
    expect(fill.servidumbre_aplica).toBe(false)
  })

  it('servidumbre_aplica=false cuando servidumbre_m2 === 0', () => {
    const fill = buildAutoFill({ ...LOT_BASE, servidumbre_m2: 0 })
    expect(fill.servidumbre_aplica).toBe(false)
  })

  it('servidumbre_superficie se genera en palabras cuando aplica', () => {
    const fill = buildAutoFill(LOT_BASE)
    expect(fill.servidumbre_superficie).toContain('METROS CUADRADOS')
    expect(fill.servidumbre_superficie).not.toBe('')
  })

  it('servidumbre_superficie es vacío cuando no aplica', () => {
    const fill = buildAutoFill({ ...LOT_BASE, servidumbre_m2: null })
    expect(fill.servidumbre_superficie).toBe('')
  })

  it('transaccion_precio_letras se genera en palabras con "PESOS"', () => {
    const fill = buildAutoFill(LOT_BASE)
    expect(fill.transaccion_precio_letras).toContain('PESOS')
    expect(fill.transaccion_precio_letras).toContain('VEINTICINCO')
  })

  it('transaccion_precio_numeros es el precio como string', () => {
    const fill = buildAutoFill(LOT_BASE)
    expect(fill.transaccion_precio_numeros).toBe('25000000')
  })

  it('sin lot_records: comprador queda vacío', () => {
    const fill = buildAutoFill({ ...LOT_BASE, lot_records: null })
    expect(fill.comprador_nombre).toBe('')
    expect(fill.comprador_rut).toBe('')
  })

  it('sin precio: precio queda vacío', () => {
    const fill = buildAutoFill({ ...LOT_BASE, precio: null })
    expect(fill.transaccion_precio_numeros).toBe('')
    expect(fill.transaccion_precio_letras).toBe('')
  })

  it('sin área ni m2: lote_superficie_total queda vacío', () => {
    const fill = buildAutoFill({ ...LOT_BASE, area_official_m2: null, m2: null })
    expect(fill.lote_superficie_total).toBe('')
  })
})

// ─── Tests: WizardFormSchema ──────────────────────────────────────────────────

describe('F-v2-4.11 — WizardFormSchema: validación Zod del Step 2', () => {
  const validPayload = {
    vendedor_tipo: 'natural' as const,
    vendedor_nombre: '',
    vendedor_rut: '',
    vendedor_domicilio: '',
    comprador_nombre: '',
    comprador_rut: '',
    comprador_domicilio: '',
    comprador_estado_civil: '',
    comprador_profesion: '',
    matriz_nombre_predio: '',
    matriz_ubicacion: '',
    matriz_superficie_total: '',
    matriz_norte: '',
    matriz_sur: '',
    matriz_oriente: '',
    matriz_poniente: '',
    matriz_rol_avaluo: '',
    sag_certificado_numero: '',
    sag_certificado_fecha: '',
    sag_plano_cbr_numero: '',
    sag_plano_cbr_anio: '',
    lote_numero_nombre: '',
    lote_superficie_total: '',
    lote_deslindes: '',
    lote_rol_tramite: '',
    servidumbre_aplica: false,
    servidumbre_superficie: '',
    servidumbre_deslindes_tramo: '',
    transaccion_precio_numeros: '',
    transaccion_precio_letras: '',
    transaccion_forma_pago: '',
    mandato_nombre_representante: '',
    mandato_rut_representante: '',
    personeria_aplica: false,
    personeria_tipo_documento: '',
    personeria_notaria: '',
    personeria_fecha: '',
    personeria_inscripcion_fojas: '',
    personeria_inscripcion_numero: '',
    personeria_inscripcion_anio: '',
    personeria_inscripcion_cbr: '',
  }

  it('acepta payload mínimo válido (todos los strings vacíos)', () => {
    expect(WizardFormSchema.safeParse(validPayload).success).toBe(true)
  })

  it('acepta payload completo con todos los campos llenos', () => {
    expect(WizardFormSchema.safeParse(FULL_FORM_VALUES).success).toBe(true)
  })

  it('rechaza vendedor_tipo inválido', () => {
    const result = WizardFormSchema.safeParse({
      ...validPayload,
      vendedor_tipo: 'empresa',
    })
    expect(result.success).toBe(false)
  })

  it('acepta vendedor_tipo="juridica"', () => {
    const result = WizardFormSchema.safeParse({
      ...validPayload,
      vendedor_tipo: 'juridica',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza servidumbre_aplica no-boolean', () => {
    const result = WizardFormSchema.safeParse({
      ...validPayload,
      servidumbre_aplica: 'si',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza personeria_aplica no-boolean', () => {
    const result = WizardFormSchema.safeParse({
      ...validPayload,
      personeria_aplica: 1,
    })
    expect(result.success).toBe(false)
  })

  it('tiene 41 campos en el schema', () => {
    const parsed = WizardFormSchema.safeParse(validPayload)
    if (parsed.success) {
      expect(Object.keys(parsed.data)).toHaveLength(41)
    }
  })
})
