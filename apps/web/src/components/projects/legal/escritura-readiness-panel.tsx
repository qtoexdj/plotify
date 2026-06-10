'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  ESCRITURA_READINESS_GATE_LABELS,
  LEGAL_REVIEW_WARNING,
  type CreateEscrituraCaseResponse,
  type EscrituraReadinessGate,
  type EscrituraReadinessResponse,
  type ReadinessGateStatus,
} from '@/lib/legal/variable-resolution-types'
import { cn } from '@/lib/utils'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  Refresh01Icon,
  File02Icon,
} from '@hugeicons/core-free-icons'

interface EscrituraReadinessPanelProps {
  projectId: string
  lotId: string
  compact?: boolean
  onCaseCreated?: (response: CreateEscrituraCaseResponse) => void
}

const gateStatusLabels = {
  blocked: 'Bloqueado',
  needs_review: 'Requiere revisión',
  ready: 'Listo',
} as const satisfies Record<ReadinessGateStatus, string>

const gateStatusClassName = {
  blocked: 'border-red-200 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  needs_review:
    'border-amber-200 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  ready:
    'border-emerald-200 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
} as const satisfies Record<ReadinessGateStatus, string>

function GateRow({ gate }: { gate: EscrituraReadinessGate }) {
  const blockers = gate.blocking_variables ?? []
  const warnings = gate.warnings ?? []

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/5 p-3 sm:flex-row sm:items-start sm:justify-between hover:border-primary/10 transition-colors">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground">
          {ESCRITURA_READINESS_GATE_LABELS[gate.gate] ?? gate.gate}
        </div>
        {(blockers.length > 0 || warnings.length > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[...blockers, ...warnings].slice(0, 4).map((item) => (
              <Badge
                key={item}
                variant="outline"
                className="max-w-full truncate font-mono text-[9px] px-1 py-0"
              >
                {item}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <Badge
        variant="outline"
        className={cn(
          'w-fit shrink-0 text-[9px] px-1.5 py-0 border',
          gateStatusClassName[gate.status]
        )}
      >
        {gateStatusLabels[gate.status]}
      </Badge>
    </div>
  )
}

export function EscrituraReadinessPanel({
  projectId,
  lotId,
  compact = false,
  onCaseCreated,
}: EscrituraReadinessPanelProps) {
  const [readiness, setReadiness] = useState<EscrituraReadinessResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [warningAcknowledged, setWarningAcknowledged] = useState(false)
  const [isCreatingCase, setIsCreatingCase] = useState(false)
  const [createdCase, setCreatedCase] = useState<CreateEscrituraCaseResponse | null>(null)

  const loadReadiness = useCallback(async () => {
    if (!lotId) return
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/escritura-readiness?lot_id=${encodeURIComponent(lotId)}`
      )
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo obtener readiness de escritura')
      }
      setReadiness(result as EscrituraReadinessResponse)
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'No se pudo obtener readiness de escritura'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [lotId, projectId])

  useEffect(() => {
    if (!lotId) {
      const timeoutId = window.setTimeout(() => {
        setReadiness(null)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
    const timeoutId = window.setTimeout(() => {
      void loadReadiness()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadReadiness, lotId])

  const blockingGates = useMemo(
    () => readiness?.gates.filter((gate) => gate.status === 'blocked') ?? [],
    [readiness]
  )
  const canCreateCase =
    Boolean(readiness) &&
    blockingGates.length === 0 &&
    warningAcknowledged &&
    !isLoading &&
    !isCreatingCase

  const handleCreateCase = async () => {
    setIsCreatingCase(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/escritura-cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lot_id: lotId,
          warning_acknowledged: warningAcknowledged,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo crear el caso de escritura')
      }
      const created = result as CreateEscrituraCaseResponse
      setCreatedCase(created)
      onCaseCreated?.(created)
      await loadReadiness()
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : 'No se pudo crear el caso de escritura'
      setError(message)
    } finally {
      setIsCreatingCase(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-muted/10">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-1.5">
            Readiness escritura
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{LEGAL_REVIEW_WARNING}</p>
        </div>
        {readiness && (
          <Badge
            variant="outline"
            className={cn(
              'w-fit text-[9px] px-1.5 py-0 border',
              gateStatusClassName[readiness.readiness_status]
            )}
          >
            {gateStatusLabels[readiness.readiness_status]}
          </Badge>
        )}
      </div>

      <div className="p-6 space-y-4">
        {!lotId ? (
          <div className="py-8 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg">
            <HugeiconsIcon icon={File02Icon} className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs">Selecciona un lote para validar su readiness de escritura.</p>
          </div>
        ) : isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-2 border border-dashed border-border rounded-lg">
            <HugeiconsIcon icon={Refresh01Icon} className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs">Validando readiness de escritura...</p>
          </div>
        ) : error && !readiness ? (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20 flex items-center gap-2">
            <HugeiconsIcon icon={AlertCircleIcon} className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {!compact && readiness && (
              <div className="grid gap-3">
                {readiness.gates.map((gate) => (
                  <GateRow key={gate.gate} gate={gate} />
                ))}
              </div>
            )}

            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <label className="flex items-start gap-3 text-[11px] text-muted-foreground leading-normal cursor-pointer">
                <Switch
                  checked={warningAcknowledged}
                  onCheckedChange={setWarningAcknowledged}
                  className="mt-0.5"
                />
                <span>Confirmo que la minuta requiere revisión y aprobación de abogado.</span>
              </label>

              <Button
                type="button"
                size="sm"
                disabled={!canCreateCase}
                onClick={handleCreateCase}
                className="w-full h-8 text-xs flex items-center justify-center gap-1.5 transition-all duration-200"
              >
                {isCreatingCase ? (
                  <HugeiconsIcon icon={Refresh01Icon} className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3.5 h-3.5" />
                )}
                Crear snapshot
              </Button>
            </div>

            {blockingGates.length > 0 && (
              <div className="flex items-start gap-1.5 text-[10px] text-red-600 dark:text-red-400 border border-red-500/10 bg-red-500/5 p-2 rounded-lg leading-normal">
                <HugeiconsIcon icon={AlertCircleIcon} className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Hay gates bloqueados; corrige las variables en el Centro de Control Legal.
                </span>
              </div>
            )}

            {error && (
              <div className="p-2 rounded bg-destructive/5 text-destructive text-[10px] border border-destructive/10 flex items-center gap-1.5">
                <HugeiconsIcon icon={AlertCircleIcon} className="w-3 h-3 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {createdCase && (
              <div className="p-2.5 rounded-lg bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 text-[10px] border border-emerald-500/10 flex items-start gap-1.5 leading-normal">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                />
                <span>
                  Snapshot creado: {createdCase.variable_snapshot_count} variables y{' '}
                  {createdCase.evidence_snapshot_count} evidencias.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
