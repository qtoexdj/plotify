'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
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

interface EscrituraReadinessPanelProps {
  projectId: string
  lotId: string
  compact?: boolean
  onCaseCreated?: (response: CreateEscrituraCaseResponse) => void
}

const gateStatusLabels = {
  blocked: 'Bloqueado',
  needs_review: 'Requiere revision',
  ready: 'Listo',
} as const satisfies Record<ReadinessGateStatus, string>

const gateStatusClassName = {
  blocked: 'border-red-200 bg-red-50 text-red-700',
  needs_review: 'border-amber-200 bg-amber-50 text-amber-700',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-700',
} as const satisfies Record<ReadinessGateStatus, string>

function GateRow({ gate }: { gate: EscrituraReadinessGate }) {
  const blockers = gate.blocking_variables ?? []
  const warnings = gate.warnings ?? []

  return (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {ESCRITURA_READINESS_GATE_LABELS[gate.gate] ?? gate.gate}
        </div>
        {(blockers.length > 0 || warnings.length > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {[...blockers, ...warnings].slice(0, 4).map((item) => (
              <Badge
                key={item}
                variant="outline"
                className="max-w-full truncate font-mono text-[10px]"
              >
                {item}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <Badge variant="outline" className={cn('w-fit shrink-0', gateStatusClassName[gate.status])}>
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
  const [isLoading, setIsLoading] = useState(true)
  const [warningAcknowledged, setWarningAcknowledged] = useState(false)
  const [isCreatingCase, setIsCreatingCase] = useState(false)
  const [createdCase, setCreatedCase] = useState<CreateEscrituraCaseResponse | null>(null)

  const loadReadiness = useCallback(async () => {
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
    const timeoutId = window.setTimeout(() => {
      void loadReadiness()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadReadiness])

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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Validando readiness de escritura...
      </div>
    )
  }

  if (error && !readiness) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            Readiness escritura
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{LEGAL_REVIEW_WARNING}</p>
        </div>
        {readiness && (
          <Badge
            variant="outline"
            className={cn('w-fit', gateStatusClassName[readiness.readiness_status])}
          >
            {gateStatusLabels[readiness.readiness_status]}
          </Badge>
        )}
      </div>

      {!compact && readiness && (
        <div className="grid gap-2 md:grid-cols-2">
          {readiness.gates.map((gate) => (
            <GateRow key={gate.gate} gate={gate} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Switch checked={warningAcknowledged} onCheckedChange={setWarningAcknowledged} />
          <span>Confirmo que la minuta requiere revision y aprobacion de abogado.</span>
        </label>
        <Button type="button" size="sm" disabled={!canCreateCase} onClick={handleCreateCase}>
          {isCreatingCase ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Crear snapshot
        </Button>
      </div>

      {blockingGates.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Hay gates bloqueados; corrige las variables en el Centro de Control Legal.</span>
        </div>
      )}
      {error && <div className="text-xs text-red-700">{error}</div>}
      {createdCase && (
        <div className="text-xs text-emerald-700">
          Snapshot creado: {createdCase.variable_snapshot_count} variables y{' '}
          {createdCase.evidence_snapshot_count} evidencias.
        </div>
      )}
    </div>
  )
}
