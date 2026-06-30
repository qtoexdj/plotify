'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LegalEvidenceViewer } from '@/components/projects/legal/legal-evidence-viewer'
import { isPorRevisar, type MatrixEntry } from '@/lib/legal/variable-matrix-model'
import {
  LEGAL_VARIABLE_STATE_LABELS,
  type VariableInventoryItem,
} from '@/lib/legal/variable-resolution-types'
import { formatVariableValue } from './variable-row'

interface VariableInspectorProps {
  entry: MatrixEntry | null
  saving: boolean
  onApprove: (item: VariableInventoryItem) => void
  onEdit: (item: VariableInventoryItem) => void
}

export function VariableInspector({ entry, saving, onApprove, onEdit }: VariableInspectorProps) {
  if (!entry) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Selecciona una variable para ver su evidencia.
      </div>
    )
  }

  if (entry.kind === 'collapsed') {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card p-4 text-card-foreground">
        <h3 className="text-sm font-semibold">Roles SII por lote</h3>
        <p className="text-sm text-muted-foreground">
          {entry.lotCount} lotes con unidad y pre-rol del certificado SII.
        </p>
        <p className="text-xs text-muted-foreground">
          El detalle por lote y la aprobación en bloque llegan en la siguiente entrega.
        </p>
      </div>
    )
  }

  const item = entry.item

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{item.variable_key}</span>
          <Badge variant="outline">{LEGAL_VARIABLE_STATE_LABELS[item.state]}</Badge>
        </div>
        <div className="text-base font-medium text-foreground">{formatVariableValue(item)}</div>
      </div>

      {isPorRevisar(entry) ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={saving} onClick={() => onApprove(item)}>
            Aprobar
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => onEdit(item)}>
            Corregir
          </Button>
        </div>
      ) : null}

      <LegalEvidenceViewer evidence={item.evidence} compact />
    </div>
  )
}
