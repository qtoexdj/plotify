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

import { decideMesaVista } from '@/components/documents/mesa/mesa-escritura'
import {
  bloquesDeClausula,
  clausulasOrdenadas,
  esClausulaOmitida,
  ordinalesLegales,
} from '@/components/documents/mesa/mesa-documento'
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
  it('la vista resuelta reconoce el bloque de título aprobado por su texto', () => {
    const bloques = bloquesDeClausula(CLAUSULA_COMPARECENCIA, 'resuelta', RESOLUCION)
    expect(bloques).toEqual([
      {
        kind: 'bloque-titulo',
        blockKey: 'titulo.comparecencia_vendedor_texto',
        label: 'Comparecencia del vendedor',
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

describe('cláusulas omitidas consultables (T010, FR-010)', () => {
  it('una condición no cumplida marca la cláusula como omitida', () => {
    expect(esClausulaOmitida(CLAUSULA_SERVIDUMBRE)).toBe(true)
    expect(esClausulaOmitida(CLAUSULA_COMPRAVENTA)).toBe(false)
  })

  it('una cláusula desactivada no se trata como omitida (no es consultable en el texto)', () => {
    expect(esClausulaOmitida({ ...CLAUSULA_SERVIDUMBRE, disabled: true })).toBe(false)
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

  it('el orquestador decide preparación y delega la mesa al builder solo como puente (hasta T013)', () => {
    const source = read('src/components/documents/mesa/mesa-escritura.tsx')
    expect(source).toContain('EstadoPreparacion')
    expect(source).toContain('T013')
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
    expect(source).toContain('data-testid="dato-hueco"')
    expect(source).toContain('omitted_reason')
  })
})
