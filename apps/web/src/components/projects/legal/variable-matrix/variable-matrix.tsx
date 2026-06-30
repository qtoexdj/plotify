'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LegalVariableEditor } from '@/components/projects/legal/legal-variable-editor'
import {
  computeMoldeProgress,
  groupByProducer,
  type MatrixEntry,
} from '@/lib/legal/variable-matrix-model'
import type {
  LegalVariableEditPayload,
  VariableInventoryItem,
  VariableInventoryResponse,
} from '@/lib/legal/variable-resolution-types'
import { MoldeProgressHeader } from './molde-progress-header'
import { ProducerGroup } from './producer-group'
import { SaleGapPanel } from './sale-gap-panel'
import { VariableInspector } from './variable-inspector'

/**
 * SDD 013 US1 — superficie unica de la matriz de variables agrupada por
 * productor. Reemplaza los KPI cards del Centro de Control Legal. Solo
 * presentacion: toda accion usa los endpoints existentes (el motor no cambia).
 */

export function flattenInventory(
  groups: VariableInventoryResponse['groups']
): VariableInventoryItem[] {
  return Object.values(groups).flatMap((group) => group ?? [])
}

interface VariableMatrixProps {
  projectId: string
  projectName?: string
  scope?: 'project' | 'lot'
  lotId?: string
}

export function VariableMatrix({
  projectId,
  projectName,
  scope = 'project',
  lotId,
}: VariableMatrixProps) {
  const [items, setItems] = useState<VariableInventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editorItem, setEditorItem] = useState<VariableInventoryItem | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ include_evidence: 'true' })
      if (lotId) params.set('lot_id', lotId)
      const response = await fetch(`/api/projects/${projectId}/legal-variables?${params.toString()}`)
      const payload = (await response.json()) as VariableInventoryResponse & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Error al cargar variables')
      setItems(flattenInventory(payload.groups))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar variables')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, lotId])

  useEffect(() => {
    load()
  }, [load])

  const sections = useMemo(() => groupByProducer(items), [items])
  const progress = useMemo(() => computeMoldeProgress(items), [items])
  const selected = useMemo<MatrixEntry | null>(
    () => sections.flatMap((section) => section.entries).find((entry) => entry.id === selectedId) ?? null,
    [sections, selectedId]
  )

  const persist = useCallback(
    async (
      variable: VariableInventoryItem,
      payload: LegalVariableEditPayload,
      successMessage: string
    ) => {
      setSavingId(variable.id)
      try {
        const response = await fetch(
          `/api/projects/${projectId}/legal-variables/${variable.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        )
        const result = (await response.json()) as { error?: string }
        if (!response.ok) throw new Error(result.error || 'Error al actualizar variable')
        toast.success(successMessage)
        setEditorOpen(false)
        await load()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al actualizar variable')
      } finally {
        setSavingId(null)
      }
    },
    [projectId, load]
  )

  const approve = useCallback(
    (variable: VariableInventoryItem) =>
      persist(
        variable,
        {
          action: 'approve',
          value_text: variable.value_text,
          value_json: variable.value_json,
          state: 'approved',
          correction_reason: variable.correction_reason,
          evidence_policy: 'keep_existing',
        },
        'Variable aprobada'
      ),
    [persist]
  )

  const openEditor = useCallback((variable: VariableInventoryItem) => {
    setEditorItem(variable)
    setEditorOpen(true)
  }, [])

  const bulkApprove = useCallback(
    async (variableKeys: string[]) => {
      if (variableKeys.length === 0) return
      setBulkSaving(true)
      try {
        const response = await fetch(
          `/api/projects/${projectId}/legal-variables/bulk-approve`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variable_keys: variableKeys }),
          }
        )
        const result = (await response.json()) as { approved_count?: number; error?: string }
        if (!response.ok) throw new Error(result.error || 'Error al aprobar en bloque')
        toast.success(`${result.approved_count ?? variableKeys.length} variables aprobadas`)
        await load()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al aprobar en bloque')
      } finally {
        setBulkSaving(false)
      }
    },
    [projectId, load]
  )

  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        Cargando variables…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <section aria-label="Matriz de variables" data-testid="variable-matrix" className="space-y-4">
      <MoldeProgressHeader progress={progress} projectName={projectName} scope={scope} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {sections.map((section) =>
            section.producer === 'sale_gap' ? (
              <SaleGapPanel key={section.producer} section={section} />
            ) : (
              <ProducerGroup
                key={section.producer}
                section={section}
                selectedId={selectedId}
                savingId={savingId}
                bulkSaving={bulkSaving}
                onSelect={(entry) => setSelectedId(entry.id)}
                onApprove={approve}
                onBulkApprove={bulkApprove}
              />
            )
          )}
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <VariableInspector
            entry={selected}
            saving={savingId !== null || bulkSaving}
            onApprove={approve}
            onEdit={openEditor}
            onBulkApprove={bulkApprove}
          />
        </aside>
      </div>

      <LegalVariableEditor
        variable={editorItem}
        open={editorOpen}
        isSaving={savingId !== null}
        onOpenChange={setEditorOpen}
        onSave={(variable, payload) => persist(variable, payload, 'Variable corregida')}
        onApprove={(variable, payload) => persist(variable, payload, 'Variable aprobada')}
        onMarkNotApplicable={(variable, payload) => persist(variable, payload, 'Marcada no aplica')}
      />
    </section>
  )
}
