'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  LEGAL_VARIABLE_STATE_LABELS,
  type VariableInventoryItem,
} from '@/lib/legal/variable-resolution-types'
import { HugeiconsIcon } from '@hugeicons/react'
import { Edit01Icon, CheckmarkCircle02Icon, AlertCircleIcon } from '@hugeicons/core-free-icons'

interface PlanoArchivePanelProps {
  variables: VariableInventoryItem[]
  isLoading?: boolean
  onEditVariable: (variable: VariableInventoryItem) => void
  onApproveVariable: (variable: VariableInventoryItem) => void
}

const PLANO_ARCHIVE_FIELDS = [
  {
    key: 'sag.plano_cbr_numero',
    label: 'Número de archivo',
    empty: 'Sin número',
  },
  {
    key: 'sag.plano_cbr_anio',
    label: 'Año de archivo',
    empty: 'Sin año',
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

export function PlanoArchivePanel({
  variables,
  isLoading = false,
  onEditVariable,
  onApproveVariable,
}: PlanoArchivePanelProps) {
  const byKey = new Map(
    PLANO_ARCHIVE_FIELDS.map((field) => [field.key, pickCurrentVariable(variables, field.key)])
  )

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div className="p-6 border-b border-border bg-muted/10">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          Plano archivado en CBR
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Número y año bajo los cuales el plano quedó archivado en el Conservador.
        </p>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg">
            <p className="text-xs">Cargando datos del plano...</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {PLANO_ARCHIVE_FIELDS.map((field) => {
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
                    <div className="mt-1 flex items-start gap-1.5 text-[10px] text-muted-foreground leading-normal">
                      <HugeiconsIcon
                        icon={AlertCircleIcon}
                        className="w-3.5 h-3.5 flex-shrink-0 text-amber-500/80 mt-0.5"
                      />
                      <span>
                        Ingreso manual recomendado por baja confiabilidad del timbre escaneado.
                      </span>
                    </div>
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
