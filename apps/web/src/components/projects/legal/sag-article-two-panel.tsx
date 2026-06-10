'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  LEGAL_VARIABLE_STATE_LABELS,
  type VariableInventoryItem,
} from '@/lib/legal/variable-resolution-types'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Refresh01Icon,
  Edit01Icon,
  CheckmarkCircle02Icon,
  DocumentValidationIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

interface SagArticleTwoPanelProps {
  variables: VariableInventoryItem[]
  isLoading?: boolean
  isRecalculating?: boolean
  canRecalculate?: boolean
  onRecalculate?: () => void
  onEditVariable: (variable: VariableInventoryItem) => void
  onApproveVariable: (variable: VariableInventoryItem) => void
  onViewEvidence: (variable: VariableInventoryItem) => void
}

const SAG_ARTICLE_TWO_FIELDS = [
  {
    key: 'sag.region_oficina',
    label: 'Región SAG',
    empty: 'Sin región',
  },
  {
    key: 'sag.certificado_numero',
    label: 'Número de certificado',
    empty: 'Sin número',
  },
  {
    key: 'sag.certificado_fecha',
    label: 'Fecha de certificado',
    empty: 'Sin fecha',
  },
] as const

const STATE_PRIORITY = {
  approved: 0,
  resolved: 1,
  proposed: 2,
  derived: 3,
  manual_review: 4,
  conflict: 5,
  missing: 6,
  not_applicable: 7,
  superseded: 8,
} as const

function hasValue(variable: VariableInventoryItem | undefined) {
  return Boolean(variable?.value_text?.trim() || variable?.value_json)
}

function pickCurrentVariable(variables: VariableInventoryItem[], key: string) {
  return [...variables]
    .filter((variable) => variable.variable_key === key)
    .sort((left, right) => {
      const valueRank = Number(hasValue(right)) - Number(hasValue(left))
      if (valueRank !== 0) return valueRank
      const stateRank = STATE_PRIORITY[left.state] - STATE_PRIORITY[right.state]
      if (stateRank !== 0) return stateRank
      return (right.confidence ?? 0) - (left.confidence ?? 0)
    })[0]
}

function valueFor(variable: VariableInventoryItem | undefined) {
  return variable?.value_text?.trim() || 'Pendiente'
}

function evidenceFor(variable: VariableInventoryItem | undefined) {
  const evidence = variable?.evidence[0]
  if (!evidence) return 'Sin evidencia'
  const page = evidence.page_number ? `, página ${evidence.page_number}` : ''
  return `${evidence.document_name ?? 'Documento'}${page}`
}

export function SagArticleTwoPanel({
  variables,
  isLoading = false,
  isRecalculating = false,
  canRecalculate = false,
  onRecalculate,
  onEditVariable,
  onApproveVariable,
  onViewEvidence,
}: SagArticleTwoPanelProps) {
  const byKey = new Map(
    SAG_ARTICLE_TWO_FIELDS.map((field) => [field.key, pickCurrentVariable(variables, field.key)])
  )

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-muted/10">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Datos SAG artículo segundo
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Región, certificado y fecha que encabezan la cláusula de subdivisión.
          </p>
        </div>
        {onRecalculate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canRecalculate || isRecalculating}
            onClick={onRecalculate}
            className="self-start sm:self-auto h-8 text-xs flex items-center gap-1.5 transition-all duration-200"
          >
            <HugeiconsIcon
              icon={Refresh01Icon}
              className={cn('w-3.5 h-3.5', isRecalculating && 'animate-spin')}
            />
            Recalcular SAG
          </Button>
        ) : null}
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-2 border border-dashed border-border rounded-lg">
            <HugeiconsIcon icon={Refresh01Icon} className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs">Cargando datos SAG...</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {SAG_ARTICLE_TWO_FIELDS.map((field) => {
              const variable = byKey.get(field.key)
              const variableHasValue = hasValue(variable)
              const state = variable?.state ?? 'missing'
              return (
                <div
                  key={field.key}
                  className="rounded-lg border border-border bg-muted/5 p-4 flex flex-col justify-between hover:border-primary/20 transition-all duration-150"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-semibold text-foreground tracking-tight">
                          {field.label}
                        </h4>
                        <p className="mt-0.5 text-[10px] text-muted-foreground font-mono">
                          {field.key}
                        </p>
                      </div>
                      <Badge
                        variant={
                          state === 'approved'
                            ? 'outline'
                            : state === 'missing' || state === 'conflict'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-[9px] px-1.5 py-0"
                      >
                        {variable ? LEGAL_VARIABLE_STATE_LABELS[variable.state] : 'Faltante'}
                      </Badge>
                    </div>

                    <p className="mt-4 text-sm font-bold text-foreground">
                      {variable ? valueFor(variable) : field.empty}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground font-medium">
                      {evidenceFor(variable)}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border/40 pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!variable}
                      onClick={() => variable && onEditVariable(variable)}
                      className="h-7 text-xs px-2.5 flex items-center gap-1 transition-all duration-150"
                    >
                      <HugeiconsIcon icon={Edit01Icon} className="w-3 h-3" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!variable || !variableHasValue || variable.state === 'approved'}
                      onClick={() => variable && onApproveVariable(variable)}
                      className="h-7 text-xs px-2.5 flex items-center gap-1 transition-all duration-150"
                    >
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-3 h-3" />
                      Aprobar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!variable || variable.evidence.length === 0}
                      onClick={() => variable && onViewEvidence(variable)}
                      className="h-7 text-xs px-2.5 flex items-center gap-1 transition-all duration-150 text-muted-foreground hover:text-foreground"
                    >
                      <HugeiconsIcon icon={DocumentValidationIcon} className="w-3 h-3" />
                      Evidencia
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
