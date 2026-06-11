/**
 * SDD 010 T008 — Mesa de escritura: llegada guiada (fase 3).
 *
 * Vitest corre en node: se cubren los helpers puros exportados y el cableado
 * de la ruta, igual que matriz-builder.test.ts.
 */

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import { decideMesaVista } from '@/components/documents/mesa/mesa-escritura'
import {
  preparacionProgreso,
  preparacionSubtitulo,
} from '@/components/documents/mesa/estado-preparacion'
import { pendienteHref, pendienteTitle } from '@/components/documents/mesa/pendientes-list'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { ApprovalBlocker, MatrizView, TokenResolution } from '@/lib/documents/matriz-types'

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
  })
})
