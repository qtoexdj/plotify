'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LegalVariableEditor } from '@/components/projects/legal/legal-variable-editor'
import {
  computeMoldeProgress,
  groupByProducer,
  isPorRevisar,
  type MatrixEntry,
} from '@/lib/legal/variable-matrix-model'
import type {
  LegalVariableEditPayload,
  VariableInventoryItem,
  VariableInventoryResponse,
} from '@/lib/legal/variable-resolution-types'
import { ManualInputDialog } from './manual-input-dialog'
import { MoldeProgressHeader } from './molde-progress-header'
import { ProducerGroup } from './producer-group'
import { SaleGapPanel } from './sale-gap-panel'
import { SiiLotDetail } from './sii-lot-detail'
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
  const [siiDetailOpen, setSiiDetailOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [pendingFocus, setPendingFocus] = useState(false)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (signal?.aborted) return
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ include_evidence: 'true' })
        if (lotId) params.set('lot_id', lotId)
        const response = await fetch(
          `/api/projects/${projectId}/legal-variables?${params.toString()}`,
          { signal }
        )
        const payload = (await response.json()) as VariableInventoryResponse & { error?: string }
        if (!response.ok) throw new Error(payload.error || 'Error al cargar variables')
        if (signal?.aborted) return
        setItems(flattenInventory(payload.groups))
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Error al cargar variables')
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [projectId, lotId]
  )

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => {
      void load(controller.signal)
    })
    return () => controller.abort()
  }, [load])

  const sections = useMemo(() => groupByProducer(items), [items])
  const progress = useMemo(() => computeMoldeProgress(items), [items])
  const effectivePendingFocus = pendingFocus && progress.porRevisar > 0
  const pendingEntries = useMemo(
    () => sections.flatMap((section) => section.entries.filter(isPorRevisar)),
    [sections]
  )
  const visibleSections = useMemo(() => {
    if (!effectivePendingFocus) return sections
    return sections
      .map((section) => ({
        ...section,
        entries: section.entries.filter(isPorRevisar),
      }))
      .filter((section) => section.entries.length > 0)
  }, [effectivePendingFocus, sections])
  const selected = useMemo<MatrixEntry | null>(
    () =>
      sections.flatMap((section) => section.entries).find((entry) => entry.id === selectedId) ??
      null,
    [sections, selectedId]
  )

  const togglePendingFocus = useCallback(
    (active: boolean) => {
      setPendingFocus(active)
      if (active && pendingEntries.length > 0) {
        setSelectedId(pendingEntries[0].id)
      }
    },
    [pendingEntries]
  )

  const persist = useCallback(
    async (
      variable: VariableInventoryItem,
      payload: LegalVariableEditPayload,
      successMessage: string
    ) => {
      setSavingId(variable.id)
      try {
        const response = await fetch(`/api/projects/${projectId}/legal-variables/${variable.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
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
    async (variableKeys: string[]): Promise<boolean> => {
      if (variableKeys.length === 0) return true
      setBulkSaving(true)
      try {
        const response = await fetch(`/api/projects/${projectId}/legal-variables/bulk-approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variable_keys: variableKeys }),
        })
        const result = (await response.json()) as { approved_count?: number; error?: string }
        if (!response.ok) throw new Error(result.error || 'Error al aprobar en bloque')
        toast.success(`${result.approved_count ?? variableKeys.length} variables aprobadas`)
        await load()
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al aprobar en bloque')
        return false
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
      <MoldeProgressHeader
        progress={progress}
        projectName={projectName}
        scope={scope}
        pendingFocus={effectivePendingFocus}
        onPendingFocusChange={togglePendingFocus}
      />

      {effectivePendingFocus ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100"
          data-testid="pending-focus-banner"
        >
          <span className="font-medium">
            Mostrando solo {progress.porRevisar} variables por aprobar.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => togglePendingFocus(false)}>
            Ver matriz completa
          </Button>
        </div>
      ) : null}

      {scope === 'project' ? (
        <div className="flex justify-stretch sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10 w-full sm:w-auto"
            onClick={() => setManualOpen(true)}
          >
            <Plus className="size-4" aria-hidden />
            Ingresar dato manual
          </Button>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="min-w-0 space-y-3">
          {visibleSections.map((section) => (
            <ProducerGroup
              key={section.producer}
              section={section}
              selectedId={selectedId}
              savingId={savingId}
              bulkSaving={bulkSaving}
              onSelect={(entry) => setSelectedId(entry.id)}
              onApprove={approve}
              onBulkApprove={bulkApprove}
              onOpenSiiDetail={() => setSiiDetailOpen(true)}
              forceOpen={effectivePendingFocus}
            />
          ))}
          {scope === 'project' && !effectivePendingFocus ? <SaleGapPanel /> : null}
        </div>

        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <VariableInspector
            entry={selected}
            saving={savingId !== null || bulkSaving}
            onApprove={approve}
            onEdit={openEditor}
            onBulkApprove={bulkApprove}
            onOpenSiiDetail={() => setSiiDetailOpen(true)}
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

      <SiiLotDetail
        projectId={projectId}
        open={siiDetailOpen}
        onOpenChange={setSiiDetailOpen}
        onSaved={load}
      />

      <ManualInputDialog
        projectId={projectId}
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSaved={load}
      />
    </section>
  )
}
