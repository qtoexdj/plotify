/**
 * SDD 009 T029 — Title case panel: state matrix, approve checklist,
 * narrative editor reason flow, evidence popovers, llm_disabled manual mode
 * and superseded banner. Uses the same structural harness as
 * legal-control-center.test.ts.
 */

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import {
  TitleCasePanel,
  TITLE_PANEL_STATE_LABELS,
  deriveTitlePanelState,
  formatBlockingItem,
  formatElapsed,
} from '@/components/projects/legal/title-case-panel'
import {
  TitleChainTimeline,
  failureForPath,
  formatAdquisicionTipo,
} from '@/components/projects/legal/title-chain-timeline'
import {
  TitleNarrativeEditor,
  canSaveNarrativeEdit,
  narrativeDiffLines,
} from '@/components/projects/legal/title-narrative-editor'
import type { ProjectTitleCase, TitleAnalysisStatus } from '@/lib/legal/title-types'

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')
}

function makeAnalysis(status: TitleAnalysisStatus): ProjectTitleCase {
  return {
    id: 'analysis-1',
    status,
    structure_type: 'compra_derechos',
    analysis: null,
    narrative: null,
    alerts: [],
    verification: null,
    pending_review: [],
    source_documents: [],
    run: null,
    approved_by: null,
    approved_at: null,
  }
}

describe('T029 — title case panel exports', () => {
  it('exports the panel, timeline and narrative editor components', () => {
    expect(TitleCasePanel).toBeTypeOf('function')
    expect(TitleChainTimeline).toBeTypeOf('function')
    expect(TitleNarrativeEditor).toBeTypeOf('function')
  })
})

describe('T029 — panel state matrix', () => {
  it('maps a missing analysis to the no_documents empty state', () => {
    expect(deriveTitlePanelState(null)).toBe('no_documents')
  })

  it.each([
    'not_started',
    'processing',
    'proposed',
    'needs_review',
    'failed',
    'llm_disabled',
    'approved',
    'superseded',
  ] as const)('passes through the %s analysis status', (status) => {
    expect(deriveTitlePanelState(makeAnalysis(status))).toBe(status)
  })

  it('labels every panel state in Spanish', () => {
    const states = [
      'no_documents',
      'not_started',
      'processing',
      'proposed',
      'needs_review',
      'failed',
      'llm_disabled',
      'approved',
      'superseded',
    ] as const
    for (const state of states) {
      expect(TITLE_PANEL_STATE_LABELS[state]).toBeTruthy()
    }
    expect(TITLE_PANEL_STATE_LABELS.llm_disabled).toBe('Modo manual')
    expect(TITLE_PANEL_STATE_LABELS.no_documents).toBe('Sin documentos de título')
    expect(TITLE_PANEL_STATE_LABELS.not_started).toBe('Pendiente de análisis')
  })
})

describe('T029 — approve blocking checklist', () => {
  it('formats variable blockers with their state', () => {
    expect(
      formatBlockingItem({
        kind: 'variable',
        key: 'titulo.clausula_primero_texto',
        state: 'manual_review',
      })
    ).toBe('Variable titulo.clausula_primero_texto pendiente de revisión')
    expect(
      formatBlockingItem({ kind: 'variable', key: 'matriz.rol_avaluo', state: 'conflict' })
    ).toBe('Variable matriz.rol_avaluo en conflicto')
  })

  it('formats alert blockers with their type', () => {
    expect(formatBlockingItem({ kind: 'alert', tipo: 'dl_3516' })).toBe('Alerta pendiente: dl_3516')
  })

  it('renders the server-driven blocking list and approve action in source', () => {
    const panelSource = readSource('../src/components/projects/legal/title-case-panel.tsx')
    expect(panelSource).toContain('data-testid="title-blocking-list"')
    expect(panelSource).toContain('data-testid="title-approve-button"')
    expect(panelSource).toContain('approveTitleCase')
    // FR-016 lawyer-responsibility warning restated at approval.
    expect(panelSource).toContain('responsabilidad del abogado revisor')
  })
})

describe('T029 — narrative editor reason flow', () => {
  it('blocks saving without a reason', () => {
    expect(
      canSaveNarrativeEdit({
        editedText: 'Texto nuevo',
        reason: '',
        effectiveText: 'Texto original',
      })
    ).toBe(false)
    expect(
      canSaveNarrativeEdit({
        editedText: 'Texto nuevo',
        reason: '   ',
        effectiveText: 'Texto original',
      })
    ).toBe(false)
  })

  it('blocks saving when the text did not change or is empty', () => {
    expect(
      canSaveNarrativeEdit({
        editedText: 'Mismo texto',
        reason: 'Motivo',
        effectiveText: 'Mismo texto',
      })
    ).toBe(false)
    expect(
      canSaveNarrativeEdit({ editedText: '  ', reason: 'Motivo', effectiveText: 'Algo' })
    ).toBe(false)
  })

  it('allows saving with changed text and a reason', () => {
    expect(
      canSaveNarrativeEdit({
        editedText: 'Texto nuevo',
        reason: 'Ajuste notarial',
        effectiveText: 'Texto viejo',
      })
    ).toBe(true)
  })

  it('diffs generated vs edited narrative line by line', () => {
    const lines = narrativeDiffLines('línea uno\nlínea dos', 'línea uno\nlínea tres')
    expect(lines).toContainEqual({ kind: 'same', text: 'línea uno' })
    expect(lines).toContainEqual({ kind: 'removed', text: 'línea dos' })
    expect(lines).toContainEqual({ kind: 'added', text: 'línea tres' })
  })

  it('keeps the reason dialog and diff toggle wired in source', () => {
    const editorSource = readSource('../src/components/projects/legal/title-narrative-editor.tsx')
    expect(editorSource).toContain('Motivo de la edición')
    expect(editorSource).toContain('updateTitleNarrative')
    expect(editorSource).toContain('Diferencias')
    expect(editorSource).toContain('narrative-diff-')
  })
})

describe('T029 — chain timeline evidence popovers', () => {
  it('formats acquisition types in Spanish', () => {
    expect(formatAdquisicionTipo('compra_derechos')).toBe('Compra de derechos')
    expect(formatAdquisicionTipo('desconocido')).toBe('desconocido')
  })

  it('locates verification failures by chain path', () => {
    const failures = [
      {
        path: 'inscripciones[0].escritura.fecha',
        reason: 'snippet_not_found',
        proposed_snippet: '',
      },
    ]
    expect(failureForPath(failures, 'inscripciones[0].escritura.fecha')?.reason).toBe(
      'snippet_not_found'
    )
    expect(failureForPath(failures, 'inscripciones[1].escritura.fecha')).toBeNull()
  })

  it('renders evidence popover content and sin-evidencia marker in source', () => {
    const timelineSource = readSource('../src/components/projects/legal/title-chain-timeline.tsx')
    expect(timelineSource).toContain('Popover')
    expect(timelineSource).toContain('Evidencia documental')
    expect(timelineSource).toContain('snippet')
    expect(timelineSource).toContain('page_number')
    expect(timelineSource).toContain('sin evidencia')
  })
})

describe('T029 — llm_disabled manual mode and superseded banner', () => {
  it('shows the manual-entry banner for llm_disabled in source', () => {
    const panelSource = readSource('../src/components/projects/legal/title-case-panel.tsx')
    expect(panelSource).toContain('data-testid="title-manual-mode-banner"')
    expect(panelSource).toContain('Modo de ingreso manual')
  })

  it('shows the superseded banner in source', () => {
    const panelSource = readSource('../src/components/projects/legal/title-case-panel.tsx')
    expect(panelSource).toContain('reemplazado por una versión más reciente')
  })

  it('mounts the title panel inside the legal control center', () => {
    const centerSource = readSource('../src/components/projects/detail/legal-control-center.tsx')
    expect(centerSource).toContain('TitleCasePanel')
    expect(centerSource).toContain('@/components/projects/legal/title-case-panel')
  })
})

describe('T039 — title alerts list', () => {
  it('exports the alerts list component and helpers', async () => {
    const alertsModule = await import('@/components/projects/legal/title-alerts-list')
    expect(alertsModule.TitleAlertsList).toBeTypeOf('function')
    expect(alertsModule.formatAlertTipo).toBeTypeOf('function')
    expect(alertsModule.canResolveAlert).toBeTypeOf('function')
  })

  it('labels the full alert taxonomy in Spanish', async () => {
    const { TITLE_ALERT_TIPO_LABELS, formatAlertTipo } =
      await import('@/components/projects/legal/title-alerts-list')
    for (const tipo of [
      'dl_3516',
      'derechos_aguas',
      'vigente_en_el_resto',
      'multi_inmueble',
      'gravamen',
      'personeria_requerida',
      'discrepancia_declaracion',
      'otro',
    ]) {
      expect(TITLE_ALERT_TIPO_LABELS[tipo]).toBeTruthy()
    }
    expect(formatAlertTipo('dl_3516')).toContain('DL 3.516')
    expect(formatAlertTipo('tipo_desconocido')).toBe('tipo_desconocido')
  })

  it('requires a non-pending resolution and a reason to resolve', async () => {
    const { canResolveAlert } = await import('@/components/projects/legal/title-alerts-list')
    expect(canResolveAlert({ resolution: 'clause_added', reason: 'Cláusula agregada' })).toBe(true)
    expect(canResolveAlert({ resolution: 'clause_added', reason: '  ' })).toBe(false)
    expect(canResolveAlert({ resolution: 'pending', reason: 'Motivo' })).toBe(false)
    expect(canResolveAlert({ resolution: '', reason: 'Motivo' })).toBe(false)
  })

  it('marks pending alerts as approval-blocking and wires resolve actions in source', () => {
    const alertsSource = readSource('../src/components/projects/legal/title-alerts-list.tsx')
    expect(alertsSource).toContain('bloquea la aprobación')
    expect(alertsSource).toContain('resolveTitleAlert')
    expect(alertsSource).toContain('Motivo de la resolución')
    expect(alertsSource).toContain('acknowledged')
    expect(alertsSource).toContain('clause_added')
    expect(alertsSource).toContain('dismissed_with_reason')
    expect(alertsSource).toContain('Evidencia documental')
  })

  it('mounts the alerts list inside the title case panel', () => {
    const panelSource = readSource('../src/components/projects/legal/title-case-panel.tsx')
    expect(panelSource).toContain('TitleAlertsList')
    expect(panelSource).toContain('Alertas legales')
  })
})

describe('F4 migración agente — polling, block checks, propietarios y notas', () => {
  it('exposes polling constants bounded to 5s ticks for 10 minutes', async () => {
    const panel = await import('@/components/projects/legal/title-case-panel')
    expect(panel.TITLE_PROCESSING_POLL_INTERVAL_MS).toBe(5000)
    expect(panel.TITLE_PROCESSING_POLL_MAX_TICKS).toBe(120)
    expect(panel.TITLE_PROCESSING_POLL_INTERVAL_MS * panel.TITLE_PROCESSING_POLL_MAX_TICKS).toBe(
      10 * 60 * 1000
    )
  })

  it('polls the title case while processing in source', () => {
    const source = readSource('../src/components/projects/legal/title-case-panel.tsx')
    expect(source).toContain("analysis?.status !== 'processing'")
    expect(source).toContain('TITLE_PROCESSING_POLL_INTERVAL_MS')
    expect(source).toContain('window.clearInterval')
  })

  it('renders consolidated owners and agent notes sections in source', () => {
    const source = readSource('../src/components/projects/legal/title-case-panel.tsx')
    expect(source).toContain('title-owners-section')
    expect(source).toContain('Propietario(s) actual(es) consolidado(s)')
    expect(source).toContain('requiere personería')
    expect(source).toContain('title-agent-notes')
    expect(source).toContain('blockChecks={analysis.verification?.block_checks ?? null}')
  })

  it('labels every block-check motivo in Spanish', async () => {
    const editor = await import('@/components/projects/legal/title-narrative-editor')
    expect(editor.formatBlockCheckMotivo('numero_sin_respaldo_verificado')).toBe(
      'Número sin respaldo verificado'
    )
    expect(editor.formatBlockCheckMotivo('fecha_sin_respaldo_verificado')).toBe(
      'Fecha sin respaldo verificado'
    )
    expect(editor.formatBlockCheckMotivo('nombre_sin_respaldo_verificado')).toBe(
      'Nombre sin respaldo verificado'
    )
    expect(editor.formatBlockCheckMotivo('no_redactado_por_el_agente')).toBe(
      'El agente no redactó este bloque'
    )
    expect(editor.formatBlockCheckMotivo('motivo_desconocido')).toBe('motivo_desconocido')
  })

  it('shows block-check issues to the reviewer in source', () => {
    const source = readSource('../src/components/projects/legal/title-narrative-editor.tsx')
    expect(source).toContain('block-check-issues-')
    expect(source).toContain('hechos sin calce contra la cadena verificada')
  })
})

describe('diálogo de carga mientras el análisis procesa', () => {
  it('formatElapsed redacta el tiempo transcurrido en es-CL', () => {
    expect(formatElapsed(0)).toBe('0 s')
    expect(formatElapsed(45)).toBe('45 s')
    expect(formatElapsed(60)).toBe('1 min 00 s')
    expect(formatElapsed(125)).toBe('2 min 05 s')
  })

  it('muestra un AlertDialog con spinner y barra mientras procesa, en source', () => {
    const source = readSource('../src/components/projects/legal/title-case-panel.tsx')
    expect(source).toContain('title-processing-dialog')
    expect(source).toContain('<AlertDialog open={showProcessing}>')
    expect(source).toContain('animate-spin')
    expect(source).toContain('role="progressbar"')
    expect(source).toContain("const showProcessing = reanalyzing || state === 'processing'")
  })
})
