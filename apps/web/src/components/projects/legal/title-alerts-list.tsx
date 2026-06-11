'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { resolveTitleAlert } from '@/lib/legal/title-client'
import type {
  TitleAlert,
  TitleAlertResolution,
  TitleAlertResolvePayload,
} from '@/lib/legal/title-types'
import { cn } from '@/lib/utils'

export const TITLE_ALERT_TIPO_LABELS: Record<string, string> = {
  dl_3516: 'DL 3.516 (prohibición de cambio de destino)',
  derechos_aguas: 'Derechos de aguas',
  vigente_en_el_resto: 'Vigente en el resto',
  multi_inmueble: 'Múltiples inmuebles',
  gravamen: 'Gravamen',
  personeria_requerida: 'Personería requerida',
  discrepancia_declaracion: 'Discrepancia de declaración',
  otro: 'Otra alerta',
}

export const ALERT_RESOLUTION_LABELS: Record<TitleAlertResolution, string> = {
  pending: 'Pendiente',
  acknowledged: 'Tomada en cuenta',
  clause_added: 'Cláusula agregada',
  dismissed_with_reason: 'Descartada con motivo',
}

export function formatAlertTipo(tipo: string): string {
  return TITLE_ALERT_TIPO_LABELS[tipo] ?? tipo
}

/** A resolve action is valid only with a non-pending resolution and a reason. */
export function canResolveAlert(input: { resolution: string; reason: string }): boolean {
  return input.resolution !== 'pending' && input.resolution !== '' && input.reason.trim().length > 0
}

const RESOLVE_ACTIONS: Array<{ value: Exclude<TitleAlertResolution, 'pending'>; label: string }> = [
  { value: 'acknowledged', label: 'Tomar en cuenta' },
  { value: 'clause_added', label: 'Cláusula agregada' },
  { value: 'dismissed_with_reason', label: 'Descartar' },
]

interface TitleAlertsListProps {
  projectId: string
  analysisId: string
  alerts: TitleAlert[]
  disabled?: boolean
  onResolved?: (alertIndex: number, alert: TitleAlert) => void
}

export function TitleAlertsList({
  projectId,
  analysisId,
  alerts,
  disabled = false,
  onResolved,
}: TitleAlertsListProps) {
  const [pendingAction, setPendingAction] = useState<{
    index: number
    resolution: Exclude<TitleAlertResolution, 'pending'>
  } | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (alerts.length === 0) {
    return <p className="text-xs text-muted-foreground">El análisis no arrojó alertas legales.</p>
  }

  const handleConfirm = async () => {
    if (!pendingAction) return
    setSaving(true)
    setError(null)
    const payload: TitleAlertResolvePayload = {
      resolution: pendingAction.resolution,
      reason: reason.trim(),
    }
    const { data, error: requestError } = await resolveTitleAlert(
      projectId,
      analysisId,
      pendingAction.index,
      payload
    )
    setSaving(false)
    if (requestError || !data) {
      setError(requestError?.message ?? 'Error al resolver la alerta')
      return
    }
    onResolved?.(pendingAction.index, data)
    setPendingAction(null)
    setReason('')
  }

  return (
    <div className="flex flex-col gap-2" data-testid="title-alerts-list">
      {alerts.map((alert, index) => {
        const pending = alert.resolution === 'pending'
        return (
          <div
            key={`${alert.tipo}-${index}`}
            className={cn(
              'rounded-lg border p-3',
              pending ? 'border-amber-500/20 bg-amber-500/10' : 'border-border bg-muted/5'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    {formatAlertTipo(alert.tipo)}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'px-1 py-0 text-[9px]',
                      pending
                        ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    )}
                  >
                    {ALERT_RESOLUTION_LABELS[alert.resolution]}
                  </Badge>
                  {pending && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      bloquea la aprobación
                    </span>
                  )}
                </div>
                {alert.detalle && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{alert.detalle}</p>
                )}
                {alert.reason && (
                  <p className="mt-1 text-[11px] italic text-muted-foreground">
                    Motivo: {alert.reason}
                  </p>
                )}
              </div>
              {alert.evidence && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                    >
                      Evidencia
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 text-xs" align="end">
                    <p className="font-medium text-foreground">Evidencia documental</p>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      “{alert.evidence.snippet}”
                    </p>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Página {alert.evidence.page_number} · documento{' '}
                      {alert.evidence.legal_document_id}
                    </p>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {pending && !disabled && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {RESOLVE_ACTIONS.map((action) => (
                  <Button
                    key={action.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setPendingAction({ index, resolution: action.value })}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      <Dialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo de la resolución</DialogTitle>
            <DialogDescription>
              La resolución de la alerta queda auditada con su motivo, autor y fecha.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej: Se incorporó la cláusula DL 3.516 a la minuta"
            rows={3}
            aria-label="Motivo de la resolución"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPendingAction(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                saving ||
                !canResolveAlert({
                  resolution: pendingAction?.resolution ?? '',
                  reason,
                })
              }
              onClick={handleConfirm}
            >
              {saving ? 'Guardando…' : 'Confirmar resolución'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
