'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  approveTitleCase,
  fetchProjectTitleCase,
  reanalyzeProjectTitle,
} from '@/lib/legal/title-client'
import {
  TITLE_CASE_PANEL_ANCHOR,
  type ProjectTitleCase,
  type TitleApproveBlockingItem,
  type TitleCasePanelState,
} from '@/lib/legal/title-types'
import { cn } from '@/lib/utils'
import { TitleAlertsList } from './title-alerts-list'
import { TitleChainTimeline } from './title-chain-timeline'
import { TitleNarrativeEditor } from './title-narrative-editor'

export const TITLE_PANEL_STATE_LABELS: Record<TitleCasePanelState, string> = {
  no_documents: 'Sin documentos de título',
  not_started: 'Pendiente de análisis',
  processing: 'Analizando título…',
  proposed: 'Propuesto',
  needs_review: 'Requiere revisión',
  failed: 'Análisis fallido',
  llm_disabled: 'Modo manual',
  approved: 'Aprobado',
  superseded: 'Reemplazado',
}

export const TITLE_STRUCTURE_LABELS: Record<string, string> = {
  dominio_unico: 'Dominio único',
  multiples_dominios: 'Múltiples dominios',
  compra_derechos: 'Compra de derechos',
  herencia: 'Herencia',
  mixto: 'Mixto',
}

/** Map the fetched analysis (or its absence) to the panel state matrix. */
export function deriveTitlePanelState(analysis: ProjectTitleCase | null): TitleCasePanelState {
  if (!analysis) return 'no_documents'
  return analysis.status
}

export const TITLE_PROCESSING_POLL_INTERVAL_MS = 5_000
/** 10 minutes of polling at 5s per tick. */
export const TITLE_PROCESSING_POLL_MAX_TICKS = 120

const SOURCE_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  dominio_vigente: 'dominio vigente',
  hipoteca_gravamen: 'hipoteca y gravamen',
  personeria: 'personería',
}

/** "2 dominio vigente, 1 hipoteca y gravamen" — breakdown for the empty states. */
export function describeSourceDocuments(analysis: ProjectTitleCase | null): string {
  const counts = new Map<string, number>()
  for (const doc of analysis?.source_documents ?? []) {
    counts.set(doc.document_type, (counts.get(doc.document_type) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([type, count]) => `${count} ${SOURCE_DOCUMENT_TYPE_LABELS[type] ?? type}`)
    .join(', ')
}

/** Human-readable checklist entry for a server-side approval blocking item. */
export function formatBlockingItem(item: TitleApproveBlockingItem): string {
  if (item.kind === 'alert') {
    return `Alerta pendiente: ${item.tipo ?? 'sin tipo'}`
  }
  const stateLabel = item.state === 'conflict' ? 'en conflicto' : 'pendiente de revisión'
  return `Variable ${item.key ?? 'desconocida'} ${stateLabel}`
}

const statusBadgeClassName: Partial<Record<TitleCasePanelState, string>> = {
  not_started: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  proposed: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  needs_review: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
  approved: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  llm_disabled: 'border-border bg-muted/20 text-muted-foreground',
  superseded: 'border-border bg-muted/20 text-muted-foreground',
}

interface TitleCasePanelProps {
  projectId: string
  onNavigateToDocuments?: () => void
}

export function TitleCasePanel({ projectId, onNavigateToDocuments }: TitleCasePanelProps) {
  const [analysis, setAnalysis] = useState<ProjectTitleCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [blocking, setBlocking] = useState<TitleApproveBlockingItem[]>([])
  const [approving, setApproving] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchProjectTitleCase(projectId)
    if (!error) {
      setAnalysis(data)
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [load])

  // Poll while the agent runs so the panel refreshes itself when the
  // analysis finishes (5s interval, capped at 10 minutes).
  const pollCountRef = useRef(0)
  useEffect(() => {
    if (analysis?.status !== 'processing') {
      pollCountRef.current = 0
      return
    }
    const intervalId = window.setInterval(() => {
      pollCountRef.current += 1
      if (pollCountRef.current > TITLE_PROCESSING_POLL_MAX_TICKS) {
        window.clearInterval(intervalId)
        return
      }
      void (async () => {
        const { data, error } = await fetchProjectTitleCase(projectId)
        if (!error) {
          setAnalysis(data)
        }
      })()
    }, TITLE_PROCESSING_POLL_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [analysis?.status, projectId])

  const handleReanalyze = useCallback(async () => {
    setReanalyzing(true)
    setActionError(null)
    const { error } = await reanalyzeProjectTitle(projectId)
    if (error) {
      setActionError(error.message)
    } else {
      await load()
    }
    setReanalyzing(false)
  }, [projectId, load])

  const handleApprove = useCallback(async () => {
    if (!analysis) return
    setApproving(true)
    setActionError(null)
    setBlocking([])
    const { data, error } = await approveTitleCase(projectId, analysis.id)
    if (error) {
      if (error.blocking) {
        setBlocking(error.blocking.blocking)
      } else {
        setActionError(error.message)
      }
    } else if (data) {
      setAnalysis(data)
    }
    setApproving(false)
  }, [analysis, projectId])

  const state = deriveTitlePanelState(analysis)

  if (loading) {
    return (
      <div className="rounded-lg border border-border p-4 text-xs text-muted-foreground">
        Cargando caso de título…
      </div>
    )
  }

  return (
    <section
      id={TITLE_CASE_PANEL_ANCHOR}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      aria-label="Caso de título de dominio vigente"
      data-testid="title-case-panel"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Título de dominio vigente</h3>
          <Badge
            variant="outline"
            className={cn('text-[10px]', statusBadgeClassName[state])}
            data-testid="title-panel-state"
          >
            {TITLE_PANEL_STATE_LABELS[state]}
          </Badge>
        </div>
        {analysis && state !== 'processing' && state !== 'approved' && state !== 'not_started' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={reanalyzing}
            onClick={handleReanalyze}
          >
            {reanalyzing ? 'Encolando…' : 'Reanalizar'}
          </Button>
        )}
      </header>

      {state === 'not_started' && (
        <div
          className="flex flex-col items-start gap-2 text-xs text-muted-foreground"
          data-testid="title-not-started"
        >
          <p>
            Hay {analysis?.source_documents.length ?? 0} documento(s) de título activos sin análisis
            vigente
            {describeSourceDocuments(analysis) ? ` (${describeSourceDocuments(analysis)})` : ''}.
            Inicia el análisis para extraer la cadena de adquisición.
          </p>
          <Button type="button" size="sm" disabled={reanalyzing} onClick={handleReanalyze}>
            {reanalyzing ? 'Encolando…' : 'Analizar título'}
          </Button>
        </div>
      )}

      {state === 'no_documents' && (
        <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground">
          <p>No hay documentos de título activos para este proyecto.</p>
          {onNavigateToDocuments && (
            <Button type="button" variant="outline" size="sm" onClick={onNavigateToDocuments}>
              Ir a documentos
            </Button>
          )}
        </div>
      )}

      {state === 'processing' && (
        <p className="text-xs text-muted-foreground">
          El análisis del título está en curso. Esta vista se actualizará al finalizar.
        </p>
      )}

      {state === 'failed' && analysis && (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-400">
          El análisis falló{analysis.run ? ` (modelo ${analysis.run.model_name})` : ''}. Usa
          “Reanalizar” para reintentar.
        </p>
      )}

      {state === 'llm_disabled' && (
        <p
          className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400"
          data-testid="title-manual-mode-banner"
        >
          Modo de ingreso manual: el agente de análisis de títulos está deshabilitado. Las variables
          del título pueden completarse manualmente desde el inventario de variables, con la misma
          auditoría de SDD 007.
        </p>
      )}

      {state === 'superseded' && (
        <p className="rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
          Este análisis fue reemplazado por una versión más reciente del documento. Recarga el panel
          para ver el nuevo estado.
        </p>
      )}

      {analysis && (state === 'proposed' || state === 'needs_review' || state === 'approved') && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="title-summary">
            {analysis.structure_type && (
              <Badge variant="outline" className="text-[10px]">
                {TITLE_STRUCTURE_LABELS[analysis.structure_type] ?? analysis.structure_type}
              </Badge>
            )}
            <span className="text-muted-foreground">
              {analysis.source_documents.length} documento(s) fuente
            </span>
            {analysis.verification && (
              <span className="text-muted-foreground">
                {analysis.verification.verified_count} verificados ·{' '}
                {analysis.verification.unverified_count} pendientes
              </span>
            )}
            {analysis.run?.model_name && (
              <span className="text-muted-foreground">
                {analysis.run.model_name}
                {typeof analysis.run.duration_ms === 'number'
                  ? ` · ${(analysis.run.duration_ms / 1000).toFixed(1)}s`
                  : ''}
              </span>
            )}
            {state === 'approved' && analysis.approved_at && (
              <span className="text-emerald-600 dark:text-emerald-400">
                Aprobado el {new Date(analysis.approved_at).toLocaleDateString('es-CL')}
              </span>
            )}
          </div>

          <Separator />

          <div>
            <h4 className="mb-2 text-xs font-semibold text-foreground">Cadena de adquisición</h4>
            <TitleChainTimeline
              inscripciones={analysis.analysis?.inscripciones ?? []}
              failures={analysis.verification?.failures ?? []}
            />
          </div>

          {(analysis.analysis?.propietarios_actuales?.length ?? 0) > 0 && (
            <>
              <Separator />
              <div data-testid="title-owners-section">
                <h4 className="mb-2 text-xs font-semibold text-foreground">
                  Propietario(s) actual(es) consolidado(s)
                </h4>
                <ul className="flex flex-col gap-2">
                  {analysis.analysis?.propietarios_actuales.map((owner, index) => (
                    <li
                      // The name alone collides when a stale analysis lists
                      // the same person twice (pre-migration merge bug).
                      key={`${owner.nombre?.value ?? 'propietario'}-${index}`}
                      className="rounded-lg border border-border bg-muted/5 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">
                          {owner.nombre?.value ?? 'Sin nombre'}
                        </span>
                        <div className="flex items-center gap-1">
                          {owner.cuota && (
                            <Badge variant="outline" className="text-[10px]">
                              {owner.cuota}
                            </Badge>
                          )}
                          {owner.requiere_personeria && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                            >
                              requiere personería
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {[
                          owner.rut?.value && `RUT ${owner.rut.value}`,
                          owner.nacionalidad?.value,
                          owner.estado_civil?.value,
                          owner.profesion?.value,
                          owner.domicilio?.value,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Sin datos personales con evidencia'}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <Separator />

          <div>
            <h4 className="mb-2 text-xs font-semibold text-foreground">Bloques narrativos</h4>
            <TitleNarrativeEditor
              projectId={projectId}
              analysisId={analysis.id}
              narrative={analysis.narrative}
              disabled={state === 'approved'}
              pendingPaths={analysis.pending_review.map((item) => item.path)}
              blockChecks={analysis.verification?.block_checks ?? null}
              onSaved={() => void load()}
            />
          </div>

          {(analysis.verification?.agent_notes?.length ?? 0) > 0 && (
            <>
              <Separator />
              <div data-testid="title-agent-notes">
                <h4 className="mb-2 text-xs font-semibold text-foreground">Notas del agente</h4>
                <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
                  {analysis.verification?.agent_notes?.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <Separator />

          <div>
            <h4 className="mb-2 text-xs font-semibold text-foreground">Alertas legales</h4>
            <TitleAlertsList
              projectId={projectId}
              analysisId={analysis.id}
              alerts={analysis.alerts}
              disabled={state === 'approved'}
              onResolved={() => void load()}
            />
          </div>

          {state !== 'approved' && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-foreground">Aprobación</h4>
                  <Button
                    type="button"
                    size="sm"
                    disabled={approving}
                    onClick={handleApprove}
                    data-testid="title-approve-button"
                  >
                    {approving ? 'Aprobando…' : 'Aprobar caso de título'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  La aprobación es responsabilidad del abogado revisor; los datos verificados
                  automáticamente no reemplazan la revisión profesional.
                </p>
                {blocking.length > 0 && (
                  <ul
                    className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400"
                    data-testid="title-blocking-list"
                  >
                    {blocking.map((item, index) => (
                      <li key={`${item.kind}-${item.key ?? item.tipo ?? index}`}>
                        {formatBlockingItem(item)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}

      {actionError && <p className="text-[11px] text-red-600 dark:text-red-400">{actionError}</p>}
    </section>
  )
}
