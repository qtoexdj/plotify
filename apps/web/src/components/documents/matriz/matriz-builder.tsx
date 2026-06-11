'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, RefreshCw, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getMatrizCase, saveMatriz } from '@/lib/documents/matriz-client'
import type {
  ApprovalBlocker,
  ClauseContentJson,
  MatrizCaseResponse,
  MatrizClauseView,
  MatrizStatus,
  MatrizView,
} from '@/lib/documents/matriz-types'
import { MatrizClauseEditor } from './matriz-clause-editor'

export const MATRIZ_STATUS_LABELS = {
  draft: 'Borrador',
  legal_review_pending: 'En revisión legal',
  approved: 'Aprobada',
  superseded: 'Reemplazada',
} as const satisfies Record<MatrizStatus, string>

export function getInitialClauseKey(clauses: MatrizClauseView[]): string | null {
  return clauses.find((clause) => !clause.disabled)?.clause_key ?? clauses[0]?.clause_key ?? null
}

export function formatApprovalBlocker(blocker: ApprovalBlocker): string {
  if (blocker.kind === 'snapshot_stale') {
    return blocker.message || 'El expediente cambió; recarga la matriz.'
  }
  if (blocker.kind === 'token_missing') {
    return `Token pendiente: ${blocker.key}`
  }
  if (blocker.kind === 'readiness_gate') {
    return `Gate ${blocker.gate}${blocker.cause ? `: ${blocker.cause}` : ''}`
  }
  return `Cláusula obligatoria faltante: ${blocker.required_clause}`
}

export function summarizeMatrizBuilder(matriz: MatrizView) {
  const disabledCount = matriz.clauses.filter((clause) => clause.disabled).length
  const fixedCount = matriz.clauses.filter((clause) => clause.fixed_position).length
  return {
    clauseCount: matriz.clauses.length,
    disabledCount,
    fixedCount,
    blockerCount: matriz.approval_blockers.length,
    missingTokenCount: matriz.resolution.missing_count,
    canEdit: matriz.status !== 'approved' && !matriz.snapshot_stale,
  }
}

type MatrizBuilderProps = {
  caseId: string
  initialData?: MatrizCaseResponse | null
}

export function MatrizBuilder({ caseId, initialData = null }: MatrizBuilderProps) {
  const [data, setData] = useState<MatrizCaseResponse | null>(initialData)
  const [selectedClauseKey, setSelectedClauseKey] = useState<string | null>(() =>
    initialData ? getInitialClauseKey(initialData.matriz.clauses) : null
  )
  const [draftOverrides, setDraftOverrides] = useState<
    Record<string, { content_json: ClauseContentJson }>
  >({})
  const [isLoading, setIsLoading] = useState(!initialData)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialData) return
    let active = true
    getMatrizCase(caseId)
      .then((response) => {
        if (!active) return
        setData(response)
        setSelectedClauseKey(getInitialClauseKey(response.matriz.clauses))
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'No se pudo cargar la matriz')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [caseId, initialData])

  const matriz = data?.matriz
  const summary = useMemo(() => (matriz ? summarizeMatrizBuilder(matriz) : null), [matriz])
  const selectedClause = useMemo(
    () => matriz?.clauses.find((clause) => clause.clause_key === selectedClauseKey) ?? null,
    [matriz, selectedClauseKey]
  )

  async function handleSave() {
    if (!matriz || !summary?.canEdit) return
    setIsSaving(true)
    setError(null)
    try {
      const response = await saveMatriz(matriz.id, {
        version: matriz.version,
        clause_order: matriz.clause_order,
        clause_overrides: {
          ...Object.fromEntries(
            matriz.clauses
              .filter((clause) => clause.disabled || clause.overridden)
              .map((clause) => [
                clause.clause_key,
                {
                  disabled: clause.disabled,
                  title: clause.title,
                  content_json: clause.content_json,
                },
              ])
          ),
          ...draftOverrides,
        },
      })
      setData(response)
      setDraftOverrides({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la matriz')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <MatrizBuilderSkeleton />
  }

  if (error && !matriz) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (!matriz || !summary) {
    return (
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        No hay matriz disponible para este caso.
      </div>
    )
  }

  return (
    <section className="space-y-4" data-testid="matriz-builder">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{matriz.template.name}</h2>
            <Badge variant="outline">v{matriz.template.version}</Badge>
            <Badge>{MATRIZ_STATUS_LABELS[matriz.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.clauseCount} cláusulas · {summary.fixedCount} fijas ·{' '}
            {summary.missingTokenCount} tokens pendientes
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw />
            Recargar
          </Button>
          <Button type="button" onClick={handleSave} disabled={!summary.canEdit || isSaving}>
            <Save />
            {isSaving ? 'Guardando' : 'Guardar'}
          </Button>
        </div>
      </div>

      {matriz.snapshot_stale ? (
        <div
          data-testid="matriz-snapshot-stale-banner"
          className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">El expediente cambió</p>
            <p>Recarga la matriz antes de guardar o enviarla a revisión.</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[680px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="min-h-0 rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Cláusulas</p>
            <p className="text-xs text-muted-foreground">Orden actual de la matriz</p>
          </div>
          <div className="max-h-[620px] overflow-auto p-2">
            {matriz.clauses.map((clause) => (
              <button
                key={clause.clause_key}
                type="button"
                onClick={() => setSelectedClauseKey(clause.clause_key)}
                className={`mb-1 w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedClauseKey === clause.clause_key
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-transparent hover:bg-muted'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{clause.title}</span>
                  {clause.fixed_position ? (
                    <Badge variant="outline" className="shrink-0">
                      fija
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {clause.disabled ? 'Deshabilitada' : `Posición ${clause.position + 1}`}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0">
          {selectedClause ? (
            <MatrizClauseEditor
              clause={selectedClause}
              tokens={matriz.resolution.tokens}
              blocks={matriz.resolution.blocks}
              readOnly={!summary.canEdit}
              onChange={(content) => {
                setDraftOverrides((current) => ({
                  ...current,
                  [selectedClause.clause_key]: { content_json: content },
                }))
              }}
            />
          ) : (
            <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
              Selecciona una cláusula para editar.
            </div>
          )}
        </main>

        <aside className="min-h-0 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Resumen del caso</p>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Versión</dt>
                <dd className="font-medium">{matriz.version}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Blockers</dt>
                <dd className="font-medium">{summary.blockerCount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Cláusulas ocultas</dt>
                <dd className="font-medium">{summary.disabledCount}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              {matriz.approval_blockers.length === 0 ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="size-4 text-amber-600" />
              )}
              <p className="text-sm font-semibold">Pendientes de aprobación</p>
            </div>
            {matriz.approval_blockers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay blockers activos.</p>
            ) : (
              <ul data-testid="matriz-blocking-list" className="space-y-2">
                {matriz.approval_blockers.map((blocker, index) => (
                  <li key={`${blocker.kind}-${index}`} className="rounded-md bg-muted p-2 text-sm">
                    {formatApprovalBlocker(blocker)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-sm font-semibold">Tokens resueltos</p>
            <div className="max-h-64 space-y-2 overflow-auto">
              {matriz.resolution.tokens.slice(0, 12).map((token) => (
                <div
                  key={token.variableKey}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted px-2 py-1 text-xs"
                >
                  <span className="min-w-0 truncate">{token.variableKey}</span>
                  <Badge variant={token.status === 'resolved' ? 'secondary' : 'outline'}>
                    {token.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

function MatrizBuilderSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <Skeleton className="h-[620px]" />
        <Skeleton className="h-[620px]" />
        <Skeleton className="h-[620px]" />
      </div>
    </div>
  )
}
