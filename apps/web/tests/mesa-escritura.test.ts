/**
 * SDD 010 T008/T010 — Mesa de escritura: llegada guiada (fase 3) y
 * documento continuo (fase 4).
 *
 * Vitest corre en node: se cubren los helpers puros exportados y el cableado
 * de la ruta, igual que matriz-builder.test.ts.
 */

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  decideMesaVista,
  mensajeDeGuardado,
  overridesDeLaMatriz,
  resumenDeMesa,
} from '@/components/documents/mesa/mesa-escritura'
import {
  bloquesDeClausula,
  clausulasOrdenadas,
  esClausulaOmitida,
  ordinalesLegales,
} from '@/components/documents/mesa/mesa-documento'
import { DATO_CHIP_TESTID, textoDelChip } from '@/components/documents/mesa/dato-chip'
import { evidenciaDocumental, urlCorreccion } from '@/components/documents/mesa/dato-popover'
import { datosAgrupados, pendientesDelGrupo } from '@/components/documents/mesa/panel-datos'
import { contadorPendientes, contextoDelCaso } from '@/components/documents/mesa/mesa-encabezado'
import { pendientesDeClausula, reordenarClausulas } from '@/components/documents/mesa/mesa-indice'
import { contieneBloquesTitulo } from '@/components/documents/mesa/clausula-editor-inline'
import { MatrizClientError } from '@/lib/documents/matriz-client'
import {
  preparacionProgreso,
  preparacionSubtitulo,
} from '@/components/documents/mesa/estado-preparacion'
import { pendienteHref, pendienteTitle } from '@/components/documents/mesa/pendientes-list'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type {
  ApprovalBlocker,
  ClauseContentJson,
  MatrizClauseView,
  MatrizView,
  ResolutionManifest,
  TokenResolution,
} from '@/lib/documents/matriz-types'

function token(status: TokenResolution['status']): TokenResolution {
  return {
    variableKey: 'comprador.nombre',
    status,
    value_text: null,
    state: null,
    source_type: null,
    evidence_refs: [],
  }
}

function matrizWith(blockers: ApprovalBlocker[], tokens: TokenResolution[] = []): MatrizView {
  return {
    id: 'm1',
    escritura_case_id: 'c1',
    project_id: 'p1',
    status: 'draft',
    version: 1,
    template: { id: 't1', name: 'Compraventa predio rustico', version: 1 },
    snapshot_stale: false,
    clause_order: [],
    clauses: [],
    resolution: { tokens, blocks: [], missing_count: 0 },
    approval_blockers: blockers,
    dismissed_alerts: [],
  }
}

const GATE_BLOCKER: ApprovalBlocker = {
  kind: 'readiness_gate',
  gate: 'title_verified',
  cause: null,
  fix_url: '/projects/p1?tab=legal',
  title: 'Verificación pendiente: estudio de título aprobado',
  description: 'Se revisa en el panel de título del proyecto.',
  action_label: 'Revisar estudio de título',
  action_href: '/projects/p1?tab=legal',
}

const DATO_BLOCKER: ApprovalBlocker = {
  kind: 'token_missing',
  key: 'comprador.estado_civil',
  fix_url: '/projects/p1?tab=legal',
  title: 'Falta estado civil del comprador',
  description: 'Se completa en el registro de venta del lote.',
  action_label: 'Completar dato',
  action_href: '/projects/p1?tab=legal&variable=comprador.estado_civil',
}

describe('decideMesaVista (research D7)', () => {
  it('verificaciones bloqueadas → preparación (jamás mesa parcial)', () => {
    expect(decideMesaVista(matrizWith([GATE_BLOCKER]))).toBe('preparacion')
    expect(decideMesaVista(matrizWith([DATO_BLOCKER, GATE_BLOCKER]))).toBe('preparacion')
  })

  it('solo datos faltantes (sin verificación bloqueada) → mesa', () => {
    expect(decideMesaVista(matrizWith([DATO_BLOCKER]))).toBe('mesa')
    expect(decideMesaVista(matrizWith([]))).toBe('mesa')
  })
})

describe('preparación: progreso y subtítulo', () => {
  it('el progreso es la proporción real de datos verificados', () => {
    const matriz = matrizWith(
      [GATE_BLOCKER],
      [token('resolved'), token('resolved'), token('missing'), token('blocked')]
    )
    expect(preparacionProgreso(matriz)).toBe(50)
  })

  it('sin datos en el manifiesto no hay barra (null)', () => {
    expect(preparacionProgreso(matrizWith([GATE_BLOCKER]))).toBeNull()
  })

  it('el subtítulo concuerda en singular y plural', () => {
    expect(preparacionSubtitulo(1)).toContain('Falta 1 pendiente')
    expect(preparacionSubtitulo(3)).toContain('Faltan 3 pendientes')
  })
})

describe('pendientes humanizados (FR-005)', () => {
  it('usa el título redactado por el servidor', () => {
    expect(pendienteTitle(DATO_BLOCKER)).toBe('Falta estado civil del comprador')
  })

  it('sin título cae a descripción y luego al genérico, nunca a códigos', () => {
    const sinTitulo = { ...DATO_BLOCKER, title: null }
    expect(pendienteTitle(sinTitulo)).toBe('Se completa en el registro de venta del lote.')
    const sinTextos = { ...DATO_BLOCKER, title: null, description: null }
    expect(pendienteTitle(sinTextos)).toBe(MESA_TEXT.pendienteGenerico)
    expect(pendienteTitle(sinTextos)).not.toContain('comprador.estado_civil')
  })

  it('prefiere action_href y cae a fix_url', () => {
    expect(pendienteHref(DATO_BLOCKER)).toBe(
      '/projects/p1?tab=legal&variable=comprador.estado_civil'
    )
    expect(pendienteHref({ ...DATO_BLOCKER, action_href: null })).toBe('/projects/p1?tab=legal')
  })
})

// ─── T010: documento continuo ────────────────────────────────────────────────

function doc(content: ClauseContentJson['content']): ClauseContentJson {
  return { schema_version: 1, type: 'doc', content }
}

function clausula(partial: Partial<MatrizClauseView> & { clause_key: string }): MatrizClauseView {
  return {
    title: partial.clause_key.toUpperCase(),
    position: 0,
    fixed_position: false,
    content_json: doc([]),
    resolved_content: null,
    overridden: false,
    disabled: false,
    condition: null,
    alert_tipo: null,
    ...partial,
  }
}

const COMPARECENCIA_TEXTO =
  'Don JUAN DE DIOS GALAZ ABARCA, chileno, divorciado, rentista, comparece y expone.'
const PRIMERO_TEXTO = 'PRIMERO: Don JUAN DE DIOS GALAZ ABARCA es dueño del inmueble.'

const CLAUSULA_COMPARECENCIA = clausula({
  clause_key: 'comparecencia',
  title: 'COMPARECENCIA',
  fixed_position: true,
  content_json: doc([
    {
      type: 'block_token',
      attrs: { blockKey: 'titulo.comparecencia_vendedor_texto', label: 'Comparecencia aprobada' },
    },
  ]),
  resolved_content: doc([
    { type: 'paragraph', content: [{ type: 'text', text: COMPARECENCIA_TEXTO }] },
  ]),
})

const CLAUSULA_ANTECEDENTES = clausula({
  clause_key: 'antecedentes_dominio',
  title: 'ANTECEDENTES DE DOMINIO',
  content_json: doc([
    { type: 'block_token', attrs: { blockKey: 'titulo.clausula_primero_texto', label: null } },
  ]),
  resolved_content: doc([{ type: 'paragraph', content: [{ type: 'text', text: PRIMERO_TEXTO }] }]),
})

const CLAUSULA_COMPRAVENTA = clausula({
  clause_key: 'compraventa',
  title: 'COMPRAVENTA',
  content_json: doc([
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Vende a la compradora, de estado civil ' },
        {
          type: 'variable_token',
          attrs: { variableKey: 'comprador.estado_civil', label: 'Estado civil de la compradora' },
        },
        { type: 'text', text: ', el lote individualizado.' },
      ],
    },
  ]),
  resolved_content: doc([
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Vende a la compradora, de estado civil ' },
        {
          type: 'variable_token',
          attrs: { variableKey: 'comprador.estado_civil', label: 'Estado civil de la compradora' },
        },
        { type: 'text', text: ', el lote individualizado.' },
      ],
    },
  ]),
})

const CLAUSULA_SERVIDUMBRE = clausula({
  clause_key: 'servidumbre',
  title: 'SERVIDUMBRE',
  condition: { key: 'servidumbre.aplica', mode: 'omit', active: false },
  omitted_reason: 'No aplica en este caso: aplica servidumbre no se cumple.',
})

const RESOLUCION: ResolutionManifest = {
  tokens: [
    {
      ...token('missing'),
      variableKey: 'comprador.estado_civil',
      label: 'Estado civil del comprador',
    },
    {
      ...token('resolved'),
      variableKey: 'precio.total_palabras',
      value_text: 'veinte millones de pesos',
      label: 'Precio en palabras',
    },
  ],
  blocks: [
    {
      blockKey: 'titulo.comparecencia_vendedor_texto',
      status: 'resolved',
      text: COMPARECENCIA_TEXTO,
      label: 'Comparecencia del vendedor',
    },
    {
      blockKey: 'titulo.clausula_primero_texto',
      status: 'resolved',
      text: PRIMERO_TEXTO,
      label: 'Cláusula PRIMERO aprobada',
    },
  ],
  missing_count: 1,
}

describe('documento continuo: orden y numeración legal (T010, FR-001)', () => {
  it('apila las cláusulas según clause_order', () => {
    const matriz = matrizWith([])
    matriz.clauses = [CLAUSULA_COMPRAVENTA, CLAUSULA_COMPARECENCIA, CLAUSULA_ANTECEDENTES]
    matriz.clause_order = ['comparecencia', 'antecedentes_dominio', 'compraventa']
    expect(clausulasOrdenadas(matriz).map((clause) => clause.clause_key)).toEqual([
      'comparecencia',
      'antecedentes_dominio',
      'compraventa',
    ])
  })

  it('espeja la numeración del renderer DOCX: comparecencia sin ordinal, ordinal embebido respetado, siguiente cláusula continúa', () => {
    const ordinales = ordinalesLegales([
      CLAUSULA_COMPARECENCIA,
      CLAUSULA_ANTECEDENTES,
      CLAUSULA_COMPRAVENTA,
    ])
    expect(ordinales.get('comparecencia')).toBeNull()
    expect(ordinales.get('antecedentes_dominio')).toBeNull()
    expect(ordinales.get('compraventa')).toBe('SEGUNDO')
  })

  it('las cláusulas omitidas no consumen ordinal', () => {
    const ordinales = ordinalesLegales([
      CLAUSULA_COMPARECENCIA,
      CLAUSULA_SERVIDUMBRE,
      CLAUSULA_COMPRAVENTA,
    ])
    expect(ordinales.get('servidumbre')).toBeNull()
    expect(ordinales.get('compraventa')).toBe('PRIMERO')
  })
})

describe('documento continuo: bloques y huecos (T010, FR-002/FR-010)', () => {
  it('la vista resuelta reconoce el bloque de título aprobado', () => {
    const bloques = bloquesDeClausula(CLAUSULA_COMPARECENCIA, 'resuelta', RESOLUCION)
    expect(bloques).toEqual([
      {
        kind: 'bloque-titulo',
        blockKey: 'titulo.comparecencia_vendedor_texto',
        label: 'Comparecencia aprobada',
        texto: COMPARECENCIA_TEXTO,
        estado: 'aprobado',
      },
    ])
  })

  it('un dato sin valor queda como hueco con nombre humano, jamás la clave cruda', () => {
    const bloques = bloquesDeClausula(CLAUSULA_COMPRAVENTA, 'resuelta', RESOLUCION)
    expect(bloques).toHaveLength(1)
    const parrafo = bloques[0]
    if (parrafo.kind !== 'parrafo') throw new Error('Se esperaba un párrafo')
    const hueco = parrafo.segmentos.find((segmento) => segmento.kind === 'dato')
    expect(hueco).toMatchObject({
      variableKey: 'comprador.estado_civil',
      label: 'Estado civil de la compradora',
      estado: 'missing',
    })
  })

  it('la vista estructura muestra todos los huecos con nombre y el bloque de título sin texto', () => {
    const bloquesCompraventa = bloquesDeClausula(CLAUSULA_COMPRAVENTA, 'estructura', RESOLUCION)
    const parrafo = bloquesCompraventa[0]
    if (parrafo.kind !== 'parrafo') throw new Error('Se esperaba un párrafo')
    expect(parrafo.segmentos.some((segmento) => segmento.kind === 'dato')).toBe(true)

    const bloquesComparecencia = bloquesDeClausula(CLAUSULA_COMPARECENCIA, 'estructura', RESOLUCION)
    expect(bloquesComparecencia).toEqual([
      {
        kind: 'bloque-titulo',
        blockKey: 'titulo.comparecencia_vendedor_texto',
        label: 'Comparecencia aprobada',
        texto: null,
        estado: 'aprobado',
      },
    ])
  })

  it('un bloque de título sin texto aprobado queda pendiente en la vista resuelta', () => {
    const clause = clausula({
      clause_key: 'antecedentes_dominio',
      content_json: CLAUSULA_ANTECEDENTES.content_json,
      resolved_content: CLAUSULA_ANTECEDENTES.content_json,
    })
    const sinBloques: ResolutionManifest = { tokens: [], blocks: [], missing_count: 0 }
    expect(bloquesDeClausula(clause, 'resuelta', sinBloques)).toEqual([
      {
        kind: 'bloque-titulo',
        blockKey: 'titulo.clausula_primero_texto',
        label: null,
        texto: null,
        estado: 'pendiente',
      },
    ])
  })
})

// ─── T011: chips de dato y popover de evidencia ──────────────────────────────

const CLAUSULA_PRECIO = clausula({
  clause_key: 'precio_liquidacion',
  title: 'PRECIO Y LIQUIDACIÓN',
  content_json: doc([
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'El precio de la compraventa es la suma de ' },
        {
          type: 'variable_token',
          attrs: { variableKey: 'precio.total_palabras', label: '' },
        },
        { type: 'text', text: ', que se paga al contado.' },
      ],
    },
  ]),
  resolved_content: doc([
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'El precio de la compraventa es la suma de ' },
        { type: 'text', text: 'veinte millones de pesos' },
        { type: 'text', text: ', que se paga al contado.' },
      ],
    },
  ]),
})

const CLAUSULA_INSCRIPCIONES = clausula({
  clause_key: 'titulos_inscripciones',
  title: 'TÍTULOS E INSCRIPCIONES VIGENTES',
  content_json: doc([
    {
      type: 'repeat_section',
      attrs: { arrayKey: 'titulo.inscripciones' },
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Inscrita a fojas ' },
            { type: 'variable_token', attrs: { variableKey: 'item.fojas', label: 'Fojas' } },
            { type: 'text', text: '.' },
          ],
        },
      ],
    },
  ]),
  resolved_content: doc([
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Inscrita a fojas ' },
        { type: 'text', text: '1338' },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Inscrita a fojas ' },
        { type: 'text', text: '2410' },
        { type: 'text', text: '.' },
      ],
    },
  ]),
})

describe('fusión estructura↔resuelto: chips con valor real (T011, FR-002/FR-003)', () => {
  it('un dato verificado queda como chip con el valor del texto resuelto', () => {
    const bloques = bloquesDeClausula(CLAUSULA_PRECIO, 'resuelta', RESOLUCION)
    expect(bloques).toHaveLength(1)
    const parrafo = bloques[0]
    if (parrafo.kind !== 'parrafo') throw new Error('Se esperaba un párrafo')
    expect(parrafo.segmentos).toHaveLength(3)
    expect(parrafo.segmentos[1]).toMatchObject({
      kind: 'dato',
      variableKey: 'precio.total_palabras',
      label: 'Precio en palabras',
      estado: 'resolved',
      valor: 'veinte millones de pesos',
    })
  })

  it('una sección expandida (repeticiones) cae a texto plano sin fusión y sin perder contenido', () => {
    const bloques = bloquesDeClausula(CLAUSULA_INSCRIPCIONES, 'resuelta', RESOLUCION)
    expect(bloques).toHaveLength(2)
    for (const bloque of bloques) {
      if (bloque.kind !== 'parrafo') throw new Error('Se esperaba un párrafo')
      expect(bloque.segmentos.every((segmento) => segmento.kind === 'texto')).toBe(true)
    }
    const textos = bloques
      .flatMap((bloque) => (bloque.kind === 'parrafo' ? bloque.segmentos : []))
      .map((segmento) => (segmento.kind === 'texto' ? segmento.texto : ''))
      .join('')
    expect(textos).toContain('1338')
    expect(textos).toContain('2410')
  })
})

describe('chip de dato (T011, ui-contracts §4)', () => {
  it('muestra el valor cuando existe y el nombre del dato en el hueco vacío', () => {
    expect(
      textoDelChip({ estado: 'resolved', valor: '12.345.678-9', label: 'RUT de la compradora' })
    ).toBe('12.345.678-9')
    expect(
      textoDelChip({ estado: 'missing', valor: null, label: 'Estado civil de la compradora' })
    ).toBe('Estado civil de la compradora')
    expect(textoDelChip({ estado: 'blocked', valor: null, label: 'Precio en palabras' })).toBe(
      'Precio en palabras'
    )
  })

  it('los data-testid del contrato usan estados en español', () => {
    expect(DATO_CHIP_TESTID).toEqual({
      resolved: 'dato-chip-verificado',
      blocked: 'dato-chip-por-revisar',
      missing: 'dato-chip-falta',
    })
  })
})

describe('popover de evidencia (T011, FR-003)', () => {
  it('el CTA de corrección apunta al CCL con la variable enfocada', () => {
    expect(urlCorreccion('p1', 'comprador.rut')).toBe(
      '/projects/p1?tab=legal&variable=comprador.rut'
    )
    expect(urlCorreccion('p1')).toBe('/projects/p1?tab=legal')
  })

  it('mapea las referencias del expediente al visor de evidencia', () => {
    const documentos = evidenciaDocumental([
      {
        legal_document_id: 'doc-1',
        legal_document_page_id: 'pagina-7',
        page_number: 7,
        snippet: 'cédula nacional de identidad número 12.345.678-9',
      },
      { legal_document_id: null, legal_document_page_id: null, page_number: null, snippet: null },
    ])
    expect(documentos[0]).toMatchObject({
      id: 'pagina-7',
      legal_document_id: 'doc-1',
      page_number: 7,
      snippet: 'cédula nacional de identidad número 12.345.678-9',
    })
    expect(documentos[1].legal_document_id).toBe('sin-documento')
  })
})

// ─── T012: panel de datos ────────────────────────────────────────────────────

describe('panel de datos agrupado (T012, FR-004)', () => {
  const DATOS: TokenResolution[] = [
    {
      ...token('resolved'),
      variableKey: 'comprador.nombre',
      value_text: 'MARÍA PAZ ROJAS',
      label: 'Nombre de la compradora',
      category: 'comprador',
      category_label: 'Compradora',
    },
    {
      ...token('missing'),
      variableKey: 'comprador.estado_civil',
      label: 'Estado civil de la compradora',
      category: 'comprador',
      category_label: 'Compradora',
    },
    {
      ...token('resolved'),
      variableKey: 'precio.total_palabras',
      value_text: 'veinte millones de pesos',
      label: 'Precio en palabras',
      category: 'precio',
      category_label: 'Precio',
    },
  ]

  it('agrupa por categoría humana conservando el orden del servidor', () => {
    const grupos = datosAgrupados(DATOS)
    expect(grupos.map((grupo) => grupo.categoriaLabel)).toEqual(['Compradora', 'Precio'])
    expect(grupos[0].datos.map((dato) => dato.variableKey)).toEqual([
      'comprador.nombre',
      'comprador.estado_civil',
    ])
  })

  it('un dato sin categoría cae al grupo genérico, jamás se oculta', () => {
    const grupos = datosAgrupados([token('resolved')])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].categoriaLabel).toBe(MESA_TEXT.categoriaSinNombre)
    expect(grupos[0].datos).toHaveLength(1)
  })

  it('cuenta los pendientes del grupo (todo lo no verificado)', () => {
    const grupos = datosAgrupados(DATOS)
    expect(pendientesDelGrupo(grupos[0])).toBe(1)
    expect(pendientesDelGrupo(grupos[1])).toBe(0)
  })
})

describe('cláusulas omitidas consultables (T010, FR-010)', () => {
  it('una condición no cumplida marca la cláusula como omitida', () => {
    expect(esClausulaOmitida(CLAUSULA_SERVIDUMBRE)).toBe(true)
    expect(esClausulaOmitida(CLAUSULA_COMPRAVENTA)).toBe(false)
  })

  it('una cláusula desactivada no se trata como omitida (no es consultable en el texto)', () => {
    expect(esClausulaOmitida({ ...CLAUSULA_SERVIDUMBRE, disabled: true })).toBe(false)
  })
})

// ─── T013: encabezado, índice y cableado final de la mesa ────────────────────

describe('reorden con fijas ancladas (T013, FR-011 — migrado de matriz-builder)', () => {
  const CUATRO_CLAUSULAS = [
    { ...CLAUSULA_COMPARECENCIA, position: 0 },
    { ...CLAUSULA_COMPRAVENTA, clause_key: 'pago', title: 'PAGO', position: 1 },
    {
      ...CLAUSULA_ANTECEDENTES,
      clause_key: 'primero',
      title: 'PRIMERO',
      position: 2,
      fixed_position: true,
    },
    { ...CLAUSULA_COMPRAVENTA, clause_key: 'cierre', title: 'CIERRE', position: 3 },
  ]

  it('reordena solo las movibles y mantiene las fijas ancladas', () => {
    const reordenadas = reordenarClausulas(CUATRO_CLAUSULAS, 'cierre', 'pago')
    expect(reordenadas.map((clause) => clause.clause_key)).toEqual([
      'comparecencia',
      'cierre',
      'primero',
      'pago',
    ])
    expect(reordenadas.find((clause) => clause.clause_key === 'comparecencia')?.position).toBe(0)
    expect(reordenadas.find((clause) => clause.clause_key === 'primero')?.position).toBe(2)
  })

  it('no mueve una cláusula sobre un ancla fija (misma referencia)', () => {
    expect(reordenarClausulas(CUATRO_CLAUSULAS, 'pago', 'comparecencia')).toBe(CUATRO_CLAUSULAS)
    expect(reordenarClausulas(CUATRO_CLAUSULAS, 'primero', 'pago')).toBe(CUATRO_CLAUSULAS)
  })
})

describe('resumen y guardado de la mesa (T013 — migrado de matriz-builder)', () => {
  it('resume cláusulas, pendientes y editabilidad', () => {
    const matriz = matrizWith([DATO_BLOCKER])
    matriz.clauses = [
      CLAUSULA_COMPARECENCIA,
      { ...CLAUSULA_COMPRAVENTA, disabled: true },
      CLAUSULA_SERVIDUMBRE,
    ]
    const resumen = resumenDeMesa(matriz)
    expect(resumen.totalClausulas).toBe(3)
    expect(resumen.fijas).toBe(1)
    expect(resumen.desactivadas).toBe(1)
    expect(resumen.pendientes).toBe(1)
    expect(resumen.puedeEditar).toBe(true)
    expect(resumenDeMesa({ ...matriz, status: 'approved' }).puedeEditar).toBe(false)
    expect(resumenDeMesa({ ...matriz, snapshot_stale: true }).puedeEditar).toBe(false)
  })

  it('el conflicto de versión produce el mensaje humano, jamás el código', () => {
    const conflicto = new MatrizClientError('version conflict', 409)
    expect(mensajeDeGuardado(conflicto)).toBe(MESA_TEXT.conflictoGuardado)
    expect(mensajeDeGuardado(new MatrizClientError('boom', 500))).toBe(MESA_TEXT.noSePudoGuardar)
    expect(mensajeDeGuardado(new Error('x'))).toBe(MESA_TEXT.noSePudoGuardar)
  })

  it('los overrides persistibles incluyen solo cláusulas desactivadas o intervenidas', () => {
    const overrides = overridesDeLaMatriz([
      CLAUSULA_COMPARECENCIA,
      { ...CLAUSULA_COMPRAVENTA, disabled: true },
      { ...CLAUSULA_PRECIO, overridden: true },
    ])
    expect(Object.keys(overrides)).toEqual(['compraventa', 'precio_liquidacion'])
    expect(overrides.compraventa.disabled).toBe(true)
  })
})

describe('encabezado de la mesa (T013, FR-015)', () => {
  it('compone proyecto · lote · comprador desde el expediente', () => {
    const contexto = contextoDelCaso([
      { ...token('resolved'), variableKey: 'proyecto.nombre', value_text: 'El Cóndor de Teno' },
      { ...token('resolved'), variableKey: 'lote.numero_nombre', value_text: 'Lote 12' },
      { ...token('resolved'), variableKey: 'lote.numero', value_text: '12' },
      { ...token('resolved'), variableKey: 'comprador.nombre', value_text: 'MARÍA PAZ ROJAS' },
    ])
    expect(contexto).toBe('El Cóndor de Teno · Lote 12 · MARÍA PAZ ROJAS')
  })

  it('omite las partes sin valor sin dejar separadores colgando', () => {
    expect(
      contextoDelCaso([
        { ...token('resolved'), variableKey: 'comprador.nombre', value_text: 'MARÍA PAZ ROJAS' },
      ])
    ).toBe('MARÍA PAZ ROJAS')
    expect(contextoDelCaso([])).toBe('')
  })

  it('el contador de pendientes concuerda en número', () => {
    expect(contadorPendientes(1)).toBe('1 pendiente')
    expect(contadorPendientes(0)).toBe('0 pendientes')
    expect(contadorPendientes(3)).toBe('3 pendientes')
  })
})

describe('índice: estado por cláusula (T013)', () => {
  it('cuenta los datos no verificados de la cláusula', () => {
    expect(pendientesDeClausula(CLAUSULA_COMPRAVENTA, RESOLUCION)).toBe(1)
    expect(pendientesDeClausula(CLAUSULA_PRECIO, RESOLUCION)).toBe(0)
    expect(pendientesDeClausula(CLAUSULA_COMPARECENCIA, RESOLUCION)).toBe(0)
  })
})

// ─── T014: edición in-place ──────────────────────────────────────────────────

describe('editor in-place (T014, FR-008/US3)', () => {
  it('detecta los bloques de título protegidos de la cláusula', () => {
    expect(contieneBloquesTitulo(CLAUSULA_COMPARECENCIA.content_json)).toBe(true)
    expect(contieneBloquesTitulo(CLAUSULA_PRECIO.content_json)).toBe(false)
    expect(contieneBloquesTitulo(null)).toBe(false)
  })
})

describe('cableado de la ruta y los componentes', () => {
  const read = (relative: string) =>
    fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf-8')

  it('la ruta del caso monta MesaEscritura (T008)', () => {
    const page = read('src/app/(dashboard)/documentos/matriz/[caseId]/page.tsx')
    expect(page).toContain('MesaEscritura')
    expect(page).not.toContain('MatrizBuilder')
  })

  it('el orquestador monta la mesa completa sin el builder viejo (T013)', () => {
    const source = read('src/components/documents/mesa/mesa-escritura.tsx')
    expect(source).toContain('EstadoPreparacion')
    expect(source).toContain('MesaEncabezado')
    expect(source).toContain('MesaIndice')
    expect(source).toContain('MesaDocumento')
    expect(source).toContain('PanelDatos')
    expect(source).toContain('PendientesList')
    expect(source).not.toContain('MatrizBuilder')
  })

  it('el índice reordena con dnd-kit y las fijas ancladas (T013)', () => {
    const indice = read('src/components/documents/mesa/mesa-indice.tsx')
    expect(indice).toContain('data-testid="mesa-indice"')
    expect(indice).toContain('DndContext')
    expect(indice).toContain('SortableContext')
    expect(indice).toContain('useSortable')
    expect(indice).toContain('arrayMove')
    expect(indice).toContain('MESA_TEXT.posicionFija')

    const encabezado = read('src/components/documents/mesa/mesa-encabezado.tsx')
    expect(encabezado).toContain('data-testid="mesa-encabezado"')
    expect(encabezado).toContain('data-testid="mesa-contador-pendientes"')
    expect(encabezado).toContain('MESA_TEXT.expedienteCambio')
  })

  it('el CCL muestra el caso activo con CTA a la mesa y sin jerga (T009)', () => {
    const panel = read('src/components/projects/legal/escritura-readiness-panel.tsx')
    expect(panel).toContain('MESA_TEXT.abrirMesa')
    expect(panel).toContain('/documentos/matriz/')
    expect(panel).toContain('active_case')
    expect(panel).toContain('case_status_label')
    expect(panel).toContain('data-testid="abrir-mesa-escritura"')
    expect(panel).not.toContain('Crear snapshot')
    expect(panel).not.toContain('Readiness escritura')
    expect(panel).not.toContain('Hay gates bloqueados')
    expect(panel).not.toContain('readiness de escritura')
  })

  it('los data-testid del contrato UI están presentes', () => {
    expect(read('src/components/documents/mesa/mesa-escritura.tsx')).toContain(
      'data-testid="mesa-escritura"'
    )
    expect(read('src/components/documents/mesa/estado-preparacion.tsx')).toContain(
      'data-testid="estado-preparacion"'
    )
    expect(read('src/components/documents/mesa/pendientes-list.tsx')).toContain(
      'data-testid="pendientes-list"'
    )
    expect(read('src/components/documents/mesa/mesa-documento.tsx')).toContain(
      'data-testid="mesa-documento"'
    )
  })

  it('el documento continuo usa serif, toggle de estructura y omitidas consultables (T010)', () => {
    const source = read('src/components/documents/mesa/mesa-documento.tsx')
    expect(source).toContain('font-serif')
    expect(source).toContain('MESA_TEXT.mostrarEstructura')
    expect(source).toContain('data-testid="clausula-omitida"')
    expect(source).toContain('data-testid="bloque-titulo"')
    expect(source).toContain('omitted_reason')
  })

  it('el panel de datos usa el mismo popover y muestra estados en español (T012)', () => {
    const panel = read('src/components/documents/mesa/panel-datos.tsx')
    expect(panel).toContain('data-testid="panel-datos"')
    expect(panel).toContain('data-testid="panel-datos-fila"')
    expect(panel).toContain('DatoPopover')
    expect(panel).toContain('MESA_TEXT.datosTitle')
    expect(panel).toContain('datoStatusLabel')
  })

  it('el editor in-place conserva el schema SDD 008 y respeta solo-lectura (T014)', () => {
    const editor = read('src/components/documents/mesa/clausula-editor-inline.tsx')
    expect(editor).toContain('data-testid="clausula-editor-inline"')
    expect(editor).toContain('ProseKit')
    expect(editor).toContain('defineMatrizClauseExtension')
    expect(editor).toContain('aria-readonly')
    expect(editor).toContain('MESA_TEXT.soloLectura')
    expect(editor).toContain('MESA_TEXT.irAlPanelTitulo')
    expect(editor).toContain('data-testid="editor-bloque-titulo-nota"')

    const documento = read('src/components/documents/mesa/mesa-documento.tsx')
    expect(documento).toContain('ClausulaEditorInline')
    expect(documento).toContain('clausulaActiva')
    expect(documento).toContain('MESA_TEXT.editarClausula')
    expect(documento).toContain('MESA_TEXT.cambiosSinGuardar')
    expect(documento).toContain('stopPropagation')

    const orquestador = read('src/components/documents/mesa/mesa-escritura.tsx')
    expect(orquestador).toContain('borradores')
    expect(orquestador).toContain('...overridesDeLaMatriz(matriz.clauses), ...borradores')
  })

  it('los datos del texto son chips con popover de evidencia (T011)', () => {
    const documento = read('src/components/documents/mesa/mesa-documento.tsx')
    expect(documento).toContain('DatoChip')
    expect(documento).toContain('DatoPopover')

    const chip = read('src/components/documents/mesa/dato-chip.tsx')
    expect(chip).toContain('dato-chip-verificado')
    expect(chip).toContain('dato-chip-por-revisar')
    expect(chip).toContain('dato-chip-falta')
    expect(chip).toContain('type="button"')

    const popover = read('src/components/documents/mesa/dato-popover.tsx')
    expect(popover).toContain('data-testid="dato-popover"')
    expect(popover).toContain('MESA_TEXT.corregirEnControlLegal')
    expect(popover).toContain('LegalEvidenceViewer')
    expect(popover).toContain('compact')
  })
})
