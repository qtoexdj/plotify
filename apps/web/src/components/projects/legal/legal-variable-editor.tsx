'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetBody,
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
import type {
  ComparecienteFieldResolutionRequest,
  SellerFact,
  VendedorCompareciente,
} from '@/lib/documents/matriz-types'
import { legalVariableDescription, legalVariableDisplayLabel } from '@/lib/legal/variable-labels'
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

export const COMPARECIENTES_VARIABLE_KEY = 'vendedor.comparecientes[]'

export function isComparecientesVariable(
  variable: Pick<VariableInventoryItem, 'variable_key' | 'value_json'> | null
): boolean {
  return (
    variable?.variable_key === COMPARECIENTES_VARIABLE_KEY && Array.isArray(variable.value_json)
  )
}

export function parseComparecientes(value: unknown): VendedorCompareciente[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (person): person is VendedorCompareciente =>
      typeof person === 'object' && person !== null && typeof person.personId === 'string'
  )
}

export function buildComparecienteResolution(
  input: ComparecienteFieldResolutionRequest,
  grantActive: boolean
): ComparecienteFieldResolutionRequest {
  if (!grantActive) throw new Error('LEGAL_APPROVAL_REQUIRED')
  if (!input.personId || !input.field || !input.value.trim()) {
    throw new Error('SELLER_FACT_VALUE_REQUIRED')
  }
  if (!input.reason.trim()) throw new Error('SELLER_FACT_REASON_REQUIRED')
  if (!input.attestationRef.trim()) throw new Error('SELLER_FACT_ATTESTATION_REQUIRED')
  if (!input.legalApprovalGrantId) throw new Error('LEGAL_APPROVAL_REQUIRED')
  return {
    ...input,
    value: input.value.trim(),
    reason: input.reason.trim(),
    attestationRef: input.attestationRef.trim(),
  }
}

function factLabel(fact: SellerFact | undefined): string {
  if (!fact || fact.value === null || fact.value === '') return 'Faltante'
  return `${fact.value} · ${fact.state === 'manual_approved' ? 'Aprobación manual' : 'Con evidencia'}`
}

export function isJsonVariable(variable: VariableInventoryItem | null): boolean {
  if (!variable) return false
  if (variable.value_json !== null && variable.value_json !== undefined) return true
  return variable.variable_key.endsWith('[]')
}

function formatValue(variable: VariableInventoryItem | null) {
  if (!variable) return ''
  if (variable.value_text) return variable.value_text
  if (variable.value_json !== null && variable.value_json !== undefined) {
    if (typeof variable.value_json === 'string') return variable.value_json
    return JSON.stringify(variable.value_json, null, 2)
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
        <SheetContent data-testid="sheet-legal-editor" className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Variable legal</SheetTitle>
            <SheetDescription>Selecciona una variable para revisar su detalle.</SheetDescription>
          </SheetHeader>
          <SheetBody />
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
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const comparecientes = parseComparecientes(variable.value_json)
  const isJson = isJsonVariable(variable)

  useEffect(() => {
    if (open) returnFocusRef.current = document.activeElement as HTMLElement | null
  }, [open])

  const trimmedReason = correctionReason.trim()
  const trimmedValue = valueText.trim()

  const parsedJson = useMemo(() => {
    if (!trimmedValue) return null
    if (trimmedValue.startsWith('{') || trimmedValue.startsWith('[')) {
      try {
        return JSON.parse(trimmedValue)
      } catch {
        return null
      }
    }
    return null
  }, [trimmedValue])

  const basePayload = useMemo<LegalVariableEditPayload>(
    () => ({
      action: 'edit',
      value_text: parsedJson ? null : trimmedValue || null,
      value_json: parsedJson ?? (isJson && !trimmedValue ? null : undefined),
      state: trimmedValue ? 'resolved' : 'missing',
      correction_reason: trimmedReason || null,
      evidence_policy: 'keep_existing',
    }),
    [trimmedReason, trimmedValue, parsedJson, isJson]
  )

  // SDD 011: el motivo es opcional para ingresar/corregir un valor; solo se
  // sugiere al resolver un conflicto entre extracciones.
  const requiresReason = variable.state === 'conflict'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="sheet-legal-editor"
        className="sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef.current) return
          event.preventDefault()
          returnFocusRef.current.focus()
        }}
      >
        <SheetHeader>
          <SheetTitle>{legalVariableDisplayLabel(variable)}</SheetTitle>
          <SheetDescription>{legalVariableDescription(variable)}</SheetDescription>
        </SheetHeader>

        <SheetBody className="px-6">
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

            {isComparecientesVariable(variable) ? (
              <div className="space-y-3" data-testid="comparecientes-editor">
                <div>
                  <Label>Comparecientes vendedores</Label>
                  <p className="text-xs text-muted-foreground">
                    Cada persona y campo conserva identidad, evidencia y versión propias. Las
                    correcciones requieren delegación jurídica, motivo y referencia de respaldo.
                  </p>
                </div>
                {comparecientes.map((person) => (
                  <div key={person.personId} className="rounded-lg border p-3">
                    <p className="font-medium">{person.nombre?.value ?? 'Vendedor sin nombre'}</p>
                    <p className="text-xs text-muted-foreground">ID: {person.personId}</p>
                    <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                      <div>
                        <dt>Nacionalidad</dt>
                        <dd>{factLabel(person.nacionalidad)}</dd>
                      </div>
                      <div>
                        <dt>Estado civil</dt>
                        <dd>{factLabel(person.estadoCivil)}</dd>
                      </div>
                      <div>
                        <dt>Tratamiento</dt>
                        <dd>{factLabel(person.tratamiento)}</dd>
                      </div>
                      <div>
                        <dt>RUT</dt>
                        <dd>{factLabel(person.rut)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            ) : isJson ? (
              <div className="space-y-2">
                <Label htmlFor="legal-variable-value">Valor actual (Estructura JSON)</Label>
                <Textarea
                  id="legal-variable-value"
                  value={valueText}
                  onChange={(event) => setValueText(event.target.value)}
                  placeholder="Ingresa la estructura JSON revisada"
                  className="font-mono text-xs leading-relaxed"
                  rows={12}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="legal-variable-value">Valor actual</Label>
                <Input
                  id="legal-variable-value"
                  value={valueText}
                  onChange={(event) => setValueText(event.target.value)}
                  placeholder="Ingresa el valor revisado"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="legal-variable-reason">Motivo o nota (opcional)</Label>
              <Textarea
                id="legal-variable-reason"
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                placeholder="Ej: del plano del Conservador"
                rows={3}
              />
              {requiresReason && !trimmedReason ? (
                <p className="text-xs text-warning">
                  Al resolver un conflicto conviene dejar una nota del motivo.
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
        </SheetBody>

        <SheetFooter className="border-t">
          <p role="status" aria-live="polite" className="sr-only">
            {isSaving ? 'Guardando variable legal' : 'Formulario listo para revisión'}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={
                isSaving ||
                isComparecientesVariable(variable) ||
                !trimmedValue ||
                (requiresReason && !trimmedReason)
              }
              onClick={() => onSave(variable, basePayload)}
            >
              Guardar
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={
                isSaving ||
                isComparecientesVariable(variable) ||
                !trimmedValue ||
                (requiresReason && !trimmedReason)
              }
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
