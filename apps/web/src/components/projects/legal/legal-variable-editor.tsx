'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import {
  LEGAL_VARIABLE_GROUP_LABELS,
  LEGAL_VARIABLE_SOURCE_TYPE_LABELS,
  LEGAL_VARIABLE_STATE_LABELS,
  type LegalVariableEditPayload,
  type VariableInventoryItem,
} from '@/lib/legal/variable-resolution-types'
import { LegalEvidenceViewer } from './legal-evidence-viewer'

interface LegalVariableEditorProps {
  variable: VariableInventoryItem | null
  open: boolean
  isSaving?: boolean
  onOpenChange: (open: boolean) => void
  onSave: (
    variable: VariableInventoryItem,
    payload: LegalVariableEditPayload
  ) => Promise<void> | void
  onApprove: (
    variable: VariableInventoryItem,
    payload: LegalVariableEditPayload
  ) => Promise<void> | void
  onMarkNotApplicable: (
    variable: VariableInventoryItem,
    payload: LegalVariableEditPayload
  ) => Promise<void> | void
}

function formatValue(variable: VariableInventoryItem | null) {
  if (!variable) return ''
  if (variable.value_text) return variable.value_text
  if (variable.value_json !== null && variable.value_json !== undefined) {
    return JSON.stringify(variable.value_json)
  }
  return ''
}

function formatReviewDate(value: string | null) {
  if (!value) return 'Sin revision'
  return new Date(value).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LegalVariableEditor({
  variable,
  open,
  isSaving = false,
  onOpenChange,
  onSave,
  onApprove,
  onMarkNotApplicable,
}: LegalVariableEditorProps) {
  if (!variable) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Variable legal</SheetTitle>
            <SheetDescription>Selecciona una variable para revisar su detalle.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <LegalVariableEditorContent
      key={variable.id}
      variable={variable}
      open={open}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      onSave={onSave}
      onApprove={onApprove}
      onMarkNotApplicable={onMarkNotApplicable}
    />
  )
}

function LegalVariableEditorContent({
  variable,
  open,
  isSaving,
  onOpenChange,
  onSave,
  onApprove,
  onMarkNotApplicable,
}: Omit<LegalVariableEditorProps, 'variable'> & { variable: VariableInventoryItem }) {
  const [valueText, setValueText] = useState(() => formatValue(variable))
  const [correctionReason, setCorrectionReason] = useState(() => variable.correction_reason ?? '')

  const trimmedReason = correctionReason.trim()
  const trimmedValue = valueText.trim()

  const basePayload = useMemo<LegalVariableEditPayload>(
    () => ({
      action: 'edit',
      value_text: trimmedValue || null,
      state: trimmedValue ? 'resolved' : 'missing',
      correction_reason: trimmedReason || null,
      evidence_policy: 'keep_existing',
    }),
    [trimmedReason, trimmedValue]
  )

  const requiresReason = valueText !== formatValue(variable) || variable.state === 'conflict'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{variable.label ?? variable.variable_key}</SheetTitle>
          <SheetDescription>{variable.description ?? variable.variable_key}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-6">
          <div className="space-y-6 pb-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground">Estado</div>
                <Badge variant="outline" className="mt-2">
                  {LEGAL_VARIABLE_STATE_LABELS[variable.state]}
                </Badge>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground">Grupo</div>
                <div className="mt-2 text-sm font-medium">
                  {LEGAL_VARIABLE_GROUP_LABELS[variable.variable_group]}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground">Fuente</div>
                <div className="mt-2 text-sm font-medium">
                  {LEGAL_VARIABLE_SOURCE_TYPE_LABELS[variable.source_type]}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Ultima revision
                </div>
                <div className="mt-2 text-sm font-medium">
                  {formatReviewDate(variable.reviewed_at)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="legal-variable-value">Valor actual</Label>
              <Input
                id="legal-variable-value"
                value={valueText}
                onChange={(event) => setValueText(event.target.value)}
                placeholder="Ingresa el valor revisado"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="legal-variable-reason">Motivo de correccion o decision</Label>
              <Textarea
                id="legal-variable-reason"
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                placeholder="Ej: corregido segun dominio vigente pagina 2"
                rows={4}
              />
              {requiresReason && !trimmedReason ? (
                <p className="text-xs text-amber-700">
                  Las correcciones y conflictos deben registrar un motivo auditable.
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border p-4">
              <div className="mb-3 text-sm font-medium">Resumen de auditoria</div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Requiere aprobacion: {variable.approval_required ? 'Si' : 'No'}</p>
                <p>Revisado por: {variable.reviewed_by ?? 'Sin revisor'}</p>
                <p>Motivo previo: {variable.correction_reason ?? 'Sin motivo registrado'}</p>
              </div>
            </div>

            <LegalEvidenceViewer evidence={variable.evidence} compact />
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving || (requiresReason && !trimmedReason)}
              onClick={() => onSave(variable, basePayload)}
            >
              Guardar correccion
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={() =>
                onApprove(variable, {
                  ...basePayload,
                  action: 'approve',
                  state: 'approved',
                })
              }
            >
              Aprobar
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving || !trimmedReason}
              onClick={() =>
                onMarkNotApplicable(variable, {
                  action: 'mark_not_applicable',
                  value_text: null,
                  state: 'not_applicable',
                  correction_reason: trimmedReason || null,
                  evidence_policy: 'keep_existing',
                })
              }
            >
              Marcar no aplica
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
