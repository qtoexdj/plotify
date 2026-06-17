'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ProseKit, useDocChange } from '@prosekit/react'
import { createEditor, defineKeyDownHandler, insertNode } from '@prosekit/core'
import type { ProseMirrorNode } from '@prosekit/pm/model'
import { Copy, FileText, GripVertical, Library, Plus, RefreshCw, Save, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  clauseContentFromDoc,
  clauseDocFromContent,
  CLASES_NODOS_EDITOR,
  defineMatrizClauseExtension,
} from '@/lib/documents/matriz-schema'
import {
  createEscrituraTemplate,
  getEscrituraTemplate,
  listEscrituraTemplates,
  MatrizClientError,
  publishEscrituraTemplate,
  upsertEscrituraTemplateClause,
} from '@/lib/documents/matriz-client'
import { MESA_TEXT, PLANTILLA_STATUS_LABELS } from '@/lib/documents/matriz-microcopy'
import { cn } from '@/lib/utils'
import type {
  AlertTipo,
  ClauseContentJson,
  ClauseUpsertRequest,
  EscrituraTemplateDetail,
  EscrituraTemplateSummary,
  InsertableVariable,
  InvalidTemplateKey,
  TemplateClause,
} from '@/lib/documents/matriz-types'
import { InsertarDatoPicker, atributosDeDato } from './insertar-dato-picker'
import {
  condicionDesdeCampos,
  condicionPorId,
  CondicionClausulaForm,
  SIN_SELECCION,
} from './condicion-clausula-form'

export const EMPTY_TEMPLATE_CONTENT: ClauseContentJson = {
  schema_version: 1,
  type: 'doc',
  content: [{ type: 'paragraph', content: [] }],
}

export function sanitizeClauseContent(content: ClauseContentJson): ClauseContentJson {
  const cleanNode = (node: unknown): unknown | null => {
    if (!node || typeof node !== 'object') return node
    const current = node as { type?: string; text?: string; content?: unknown[] }
    if (current.type === 'text' && current.text === '') return null
    if (!Array.isArray(current.content)) return current
    const cleanContent = current.content.map(cleanNode).filter((child) => child !== null)
    return { ...current, content: cleanContent }
  }

  return {
    ...content,
    content: content.content
      .map(cleanNode)
      .filter((node) => node !== null) as ClauseContentJson['content'],
  }
}

export function formatTemplateVersion(template: Pick<EscrituraTemplateSummary, 'version'>): string {
  return `v${template.version}`
}

export function canEditTemplate(template: Pick<EscrituraTemplateSummary, 'status'>): boolean {
  return template.status === 'draft'
}

export function mergeTemplateDetailIntoList(
  templates: EscrituraTemplateSummary[],
  detail: EscrituraTemplateDetail
): EscrituraTemplateSummary[] {
  const summary: EscrituraTemplateSummary = {
    id: detail.id,
    name: detail.name,
    document_type: detail.document_type,
    version: detail.version,
    status: detail.status,
    published_at: detail.published_at,
    clause_count: detail.clauses.length,
    updated_at: detail.updated_at,
  }
  const exists = templates.some((template) => template.id === detail.id)
  const merged = exists
    ? templates.map((template) => (template.id === detail.id ? summary : template))
    : [summary, ...templates]
  return merged.sort((a, b) => a.name.localeCompare(b.name) || b.version - a.version)
}

export function reordenarTemplateClauses(
  clauses: TemplateClause[],
  activeKey: string,
  overKey: string
): TemplateClause[] {
  const from = clauses.findIndex((clause) => clause.clause_key === activeKey)
  const to = clauses.findIndex((clause) => clause.clause_key === overKey)
  if (from === -1 || to === -1 || from === to) return clauses
  return arrayMove(clauses, from, to).map((clause, position) => ({ ...clause, position }))
}

export function extractInvalidTemplateKeys(detail: unknown): InvalidTemplateKey[] {
  const candidates: unknown[] = []
  if (detail && typeof detail === 'object') {
    candidates.push((detail as { error?: unknown }).error)
    candidates.push((detail as { detail?: unknown }).detail)
  }
  candidates.push(detail)

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const payload = candidate as { code?: unknown; invalid_keys?: unknown }
    if (payload.code === 'invalid_keys' && Array.isArray(payload.invalid_keys)) {
      return payload.invalid_keys as InvalidTemplateKey[]
    }
  }

  return []
}

export function formatInvalidTemplateIssue(issue: InvalidTemplateKey): string {
  const display = issue.display_text || MESA_TEXT.datoFueraCatalogo
  return issue.suggested_label
    ? display + '. ' + MESA_TEXT.errorCatalogoSugerencia + ': ' + issue.suggested_label
    : display
}

type PlantillaEditorProps = {
  initialTemplates?: EscrituraTemplateSummary[]
}

export function PlantillaEditor({ initialTemplates = [] }: PlantillaEditorProps) {
  const [templates, setTemplates] = useState<EscrituraTemplateSummary[]>(initialTemplates)
  // Catálogo de datos insertables servido por la API (SDD 010 FR-014): fuente
  // única, jamás una copia hardcodeada que derive del catálogo canónico.
  const [insertables, setInsertables] = useState<InsertableVariable[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplates[0]?.id ?? null
  )
  const [selectedTemplate, setSelectedTemplate] = useState<EscrituraTemplateDetail | null>(null)
  const [selectedClauseKey, setSelectedClauseKey] = useState<string | null>(null)
  const [newTemplateName, setNewTemplateName] = useState('Compraventa predio rústico')
  const [isListLoading, setIsListLoading] = useState(initialTemplates.length === 0)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visibleTemplate = selectedTemplate?.id === selectedTemplateId ? selectedTemplate : null
  const editable = visibleTemplate ? canEditTemplate(visibleTemplate) : false
  const selectedClause =
    visibleTemplate?.clauses.find((clause) => clause.clause_key === selectedClauseKey) ??
    visibleTemplate?.clauses[0] ??
    null

  useEffect(() => {
    if (initialTemplates.length > 0) return
    let active = true
    listEscrituraTemplates()
      .then((response) => {
        if (!active) return
        setTemplates(response.templates)
        setInsertables(response.insertable_variables ?? [])
        setSelectedTemplateId(response.templates[0]?.id ?? null)
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : MESA_TEXT.noSePudoCargar)
      })
      .finally(() => {
        if (active) setIsListLoading(false)
      })
    return () => {
      active = false
    }
  }, [initialTemplates.length])

  useEffect(() => {
    if (!selectedTemplateId) return
    let active = true
    Promise.resolve()
      .then(() => {
        setIsDetailLoading(true)
        setError(null)
        return getEscrituraTemplate(selectedTemplateId)
      })
      .then((detail) => {
        if (!active) return
        setSelectedTemplate(detail)
        setSelectedClauseKey(detail.clauses[0]?.clause_key ?? null)
        setTemplates((current) => mergeTemplateDetailIntoList(current, detail))
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : MESA_TEXT.noSePudoCargar)
      })
      .finally(() => {
        if (active) setIsDetailLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedTemplateId])

  async function refreshTemplates(preferredId?: string) {
    setIsListLoading(true)
    setError(null)
    try {
      const response = await listEscrituraTemplates()
      setTemplates(response.templates)
      setSelectedTemplateId(preferredId ?? response.templates[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : MESA_TEXT.noSePudoCargar)
    } finally {
      setIsListLoading(false)
    }
  }

  async function handleCreateTemplate(cloneFromTemplateId?: string) {
    const name = newTemplateName.trim()
    if (!name) {
      setError(MESA_TEXT.nombrePlantilla)
      return
    }
    setIsBusy(true)
    setError(null)
    try {
      const detail = await createEscrituraTemplate({
        name,
        document_type: 'compraventa',
        clone_from_template_id: cloneFromTemplateId ?? null,
      })
      setSelectedTemplate(detail)
      setTemplates((current) => mergeTemplateDetailIntoList(current, detail))
      setSelectedTemplateId(detail.id)
      setSelectedClauseKey(detail.clauses[0]?.clause_key ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : MESA_TEXT.noSePudoCargar)
    } finally {
      setIsBusy(false)
    }
  }

  async function handlePublish() {
    if (!visibleTemplate) return
    setIsBusy(true)
    setError(null)
    try {
      const detail = await publishEscrituraTemplate(visibleTemplate.id)
      setSelectedTemplate(detail)
      setTemplates((current) => mergeTemplateDetailIntoList(current, detail))
    } catch (err) {
      setError(err instanceof Error ? err.message : MESA_TEXT.noSePudoCargar)
    } finally {
      setIsBusy(false)
    }
  }

  function handleSaved(detail: EscrituraTemplateDetail) {
    setSelectedTemplate(detail)
    setTemplates((current) => mergeTemplateDetailIntoList(current, detail))
    setSelectedClauseKey(detail.clauses.at(-1)?.clause_key ?? detail.clauses[0]?.clause_key ?? null)
  }

  async function handleReordenar(reordered: TemplateClause[]) {
    if (!visibleTemplate || !editable) return
    const optimistic = { ...visibleTemplate, clauses: reordered }
    setSelectedTemplate(optimistic)
    try {
      const responses = await Promise.all(
        reordered.map((clause) =>
          upsertEscrituraTemplateClause({
            templateId: visibleTemplate.id,
            clauseKey: clause.clause_key,
            payload: {
              title: clause.title,
              position: clause.position,
              fixed_position: clause.fixed_position,
              content_json: clause.content_json,
              condition_key: clause.condition_key,
              condition_mode: clause.condition_mode,
              alert_tipo: clause.alert_tipo,
            },
          })
        )
      )
      const latest = responses.at(-1)
      if (latest) setSelectedTemplate(latest)
    } catch (err) {
      setError(err instanceof Error ? err.message : MESA_TEXT.noSePudoGuardarClausula)
      setSelectedTemplate(visibleTemplate)
    }
  }

  if (isListLoading) return <PlantillaEditorSkeleton />

  return (
    <section className="space-y-4" data-testid="plantilla-editor">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Library className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold tracking-tight">
              {MESA_TEXT.bibliotecaPlantillas}
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {templates.length} {MESA_TEXT.plantillasTitle.toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() => refreshTemplates(selectedTemplateId ?? undefined)}
          >
            <RefreshCw />
            {MESA_TEXT.recargar}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!visibleTemplate || isBusy}
            onClick={() => visibleTemplate && handleCreateTemplate(visibleTemplate.id)}
          >
            <Copy />
            {MESA_TEXT.clonar}
          </Button>
          <Button type="button" disabled={!editable || isBusy} onClick={handlePublish}>
            <Upload />
            {MESA_TEXT.publicar}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold">{MESA_TEXT.nuevoBorrador}</p>
            <div className="mt-3 flex gap-2">
              <Input
                value={newTemplateName}
                onChange={(event) => setNewTemplateName(event.target.value)}
                placeholder={MESA_TEXT.nombrePlantilla}
              />
              <Button type="button" onClick={() => handleCreateTemplate()} disabled={isBusy}>
                <Plus />
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">{MESA_TEXT.plantillasTitle}</p>
            </div>
            <div className="max-h-[720px] overflow-auto p-2">
              {templates.length > 0 ? (
                templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      'mb-1 w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      selectedTemplateId === template.id
                        ? 'border-primary bg-primary/10'
                        : 'border-transparent hover:bg-muted'
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{template.name}</span>
                      <Badge variant="outline">{formatTemplateVersion(template)}</Badge>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge>{PLANTILLA_STATUS_LABELS[template.status]}</Badge>
                      <span>{template.clause_count} cláusulas</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="p-3 text-sm text-muted-foreground">{MESA_TEXT.sinPlantillas}</p>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          {isDetailLoading ? (
            <PlantillaDetailSkeleton />
          ) : visibleTemplate ? (
            <>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" />
                      <h3 className="truncate text-lg font-semibold">{visibleTemplate.name}</h3>
                      <Badge variant="outline">{formatTemplateVersion(visibleTemplate)}</Badge>
                      <Badge>{PLANTILLA_STATUS_LABELS[visibleTemplate.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {visibleTemplate.clauses.length} cláusulas
                    </p>
                  </div>
                  {!editable ? (
                    <p className="max-w-md text-sm text-muted-foreground">
                      {MESA_TEXT.plantillaSoloLectura}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                <TemplateClauseList
                  clauses={visibleTemplate.clauses}
                  selectedClauseKey={selectedClause?.clause_key ?? null}
                  editable={editable}
                  onSelect={setSelectedClauseKey}
                  onReorder={handleReordenar}
                />

                <TemplateClauseComposer
                  key={`${visibleTemplate.id}-${selectedClause?.clause_key ?? 'nueva'}`}
                  templateId={visibleTemplate.id}
                  clause={selectedClause}
                  nextPosition={visibleTemplate.clauses.length}
                  editable={editable}
                  insertables={insertables}
                  onSaved={handleSaved}
                />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
              {MESA_TEXT.seleccionarPlantilla}
            </div>
          )}
        </main>
      </div>
    </section>
  )
}

type TemplateClauseListProps = {
  clauses: TemplateClause[]
  selectedClauseKey: string | null
  editable: boolean
  onSelect: (clauseKey: string) => void
  onReorder: (clauses: TemplateClause[]) => void
}

function TemplateClauseList({
  clauses,
  selectedClauseKey,
  editable,
  onSelect,
  onReorder,
}: TemplateClauseListProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    if (!editable || !event.over) return
    const reordered = reordenarTemplateClauses(
      clauses,
      String(event.active.id),
      String(event.over.id)
    )
    if (reordered !== clauses) onReorder(reordered)
  }

  return (
    <div className="rounded-lg border border-border bg-card" data-testid="plantilla-clausulas">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">{MESA_TEXT.indiceTitle}</p>
      </div>
      <div className="max-h-[70vh] overflow-auto p-2">
        {clauses.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={clauses.map((clause) => clause.clause_key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {clauses.map((clause) => (
                  <TemplateClauseRow
                    key={clause.clause_key}
                    clause={clause}
                    selected={selectedClauseKey === clause.clause_key}
                    editable={editable}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="p-3 text-sm text-muted-foreground">{MESA_TEXT.plantillaVacia}</p>
        )}
      </div>
    </div>
  )
}

function TemplateClauseRow({
  clause,
  selected,
  editable,
  onSelect,
}: {
  clause: TemplateClause
  selected: boolean
  editable: boolean
  onSelect: (clauseKey: string) => void
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: clause.clause_key, disabled: !editable })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'grid grid-cols-[2rem_minmax(0,1fr)] rounded-md border text-sm transition-colors',
        selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted',
        isDragging && 'z-10 opacity-70 shadow-sm'
      )}
    >
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!editable}
        aria-label={MESA_TEXT.reordenarClausula}
        className="h-full rounded-md text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </Button>
      <button
        type="button"
        onClick={() => onSelect(clause.clause_key)}
        className="min-w-0 px-2 py-2 text-left"
      >
        <span className="block truncate font-medium">{clause.title}</span>
        {clause.fixed_position ? (
          <span className="mt-1 block text-xs text-muted-foreground">{MESA_TEXT.posicionFija}</span>
        ) : null}
      </button>
    </div>
  )
}

type TemplateClauseComposerProps = {
  templateId: string
  clause: TemplateClause | null
  nextPosition: number
  editable: boolean
  insertables: InsertableVariable[]
  onSaved: (template: EscrituraTemplateDetail) => void
}

function TemplateClauseComposer({
  templateId,
  clause,
  nextPosition,
  editable,
  insertables,
  onSaved,
}: TemplateClauseComposerProps) {
  const [title, setTitle] = useState(clause?.title ?? '')
  const [fixedPosition, setFixedPosition] = useState(clause?.fixed_position ?? false)
  const [conditionId, setConditionId] = useState(
    condicionDesdeCampos(clause?.condition_key ?? null, clause?.condition_mode ?? null)
  )
  const [alertTipo, setAlertTipo] = useState<AlertTipo | null>(clause?.alert_tipo ?? null)
  const [content, setContent] = useState<ClauseContentJson>(
    clause?.content_json ?? EMPTY_TEMPLATE_CONTENT
  )
  const [pickerAbierto, setPickerAbierto] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidKeys, setInvalidKeys] = useState<InvalidTemplateKey[]>([])

  async function handleSave() {
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setError(MESA_TEXT.tituloClausula)
      return
    }
    const condition = condicionPorId(conditionId)
    if (conditionId !== SIN_SELECCION && (!condition.condition_key || !condition.condition_mode)) {
      setError(MESA_TEXT.condicionesIncompletas)
      return
    }

    const payload: ClauseUpsertRequest = {
      title: normalizedTitle,
      position: clause?.position ?? nextPosition,
      fixed_position: fixedPosition,
      content_json: sanitizeClauseContent(content),
      condition_key: condition.condition_key,
      condition_mode: condition.condition_mode,
      alert_tipo: alertTipo,
    }

    setIsSaving(true)
    setError(null)
    setInvalidKeys([])
    try {
      const response = await upsertEscrituraTemplateClause({
        templateId,
        clauseKey: clause?.clause_key ?? null,
        payload,
      })
      onSaved(response)
    } catch (err) {
      if (err instanceof MatrizClientError) {
        const invalid = extractInvalidTemplateKeys(err.detail)
        if (invalid.length > 0) {
          setInvalidKeys(invalid)
          setError(MESA_TEXT.erroresCatalogoTitle)
        } else {
          setError(err.message)
        }
      } else {
        setError(MESA_TEXT.noSePudoGuardarClausula)
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="space-y-4 rounded-lg border border-border bg-card p-4"
      data-testid="plantilla-composer"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{clause ? clause.title : MESA_TEXT.nuevaClausula}</p>
          {!editable ? (
            <p className="mt-1 text-xs text-muted-foreground">{MESA_TEXT.plantillaSoloLectura}</p>
          ) : null}
        </div>
        <Badge variant="outline">
          {editable ? PLANTILLA_STATUS_LABELS.draft : PLANTILLA_STATUS_LABELS.published}
        </Badge>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {invalidKeys.length > 0 ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
          data-testid="template-invalid-keys"
        >
          <p className="mb-2 font-medium">{MESA_TEXT.erroresCatalogoTitle}</p>
          <ul className="space-y-1">
            {invalidKeys.map((issue, index) => (
              <li key={`${issue.reason}-${index}`}>{formatInvalidTemplateIssue(issue)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <div className="space-y-1.5">
          <Label htmlFor="template-clause-title">{MESA_TEXT.tituloClausula}</Label>
          <Input
            id="template-clause-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!editable}
          />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={fixedPosition}
            onChange={(event) => setFixedPosition(event.target.checked)}
            disabled={!editable}
            className="size-4 rounded border-border"
          />
          {MESA_TEXT.clausulaFija}
        </label>
      </div>

      <CondicionClausulaForm
        condicionId={conditionId}
        alertaTipo={alertTipo}
        editable={editable}
        onCondicionChange={setConditionId}
        onAlertaChange={setAlertTipo}
      />

      <TemplateProseEditor
        content={content}
        editable={editable}
        insertables={insertables}
        pickerAbierto={pickerAbierto}
        onPickerAbiertoChange={setPickerAbierto}
        onChange={setContent}
      />

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={!editable || isSaving}>
          <Save />
          {isSaving ? MESA_TEXT.guardando : MESA_TEXT.guardarClausula}
        </Button>
      </div>
    </div>
  )
}

function TemplateProseEditor({
  content,
  editable,
  insertables,
  pickerAbierto,
  onPickerAbiertoChange,
  onChange,
}: {
  content: ClauseContentJson
  editable: boolean
  insertables: InsertableVariable[]
  pickerAbierto: boolean
  onPickerAbiertoChange: (open: boolean) => void
  onChange: (content: ClauseContentJson) => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  // El editor se crea una sola vez por cláusula con su contenido inicial. El
  // composer padre se remonta vía `key` al cambiar de cláusula o plantilla
  // (ver TemplateClauseComposer), así que el contenido inicial alcanza.
  // Depender de `content` lo recreaba en cada tecla (onChange → setContent →
  // nueva dep), reiniciando el documento y perdiendo el cursor al escribir.
  const editor = useMemo(() => {
    const instance = createEditor({ extension: defineMatrizClauseExtension() })
    instance.setContent(clauseDocFromContent(sanitizeClauseContent(content)))
    return instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mountRef.current) return
    const cleanup = editor.mount(mountRef.current)
    const editableNode = mountRef.current.querySelector('[contenteditable]')
    if (!editable) editableNode?.setAttribute('contenteditable', 'false')
    return cleanup
  }, [editor, editable])

  useEffect(() => {
    if (!editable) return
    return editor.use(
      defineKeyDownHandler((_view, event) => {
        if (event.key !== '@' || event.ctrlKey || event.metaKey || event.altKey) return false
        onPickerAbiertoChange(true)
        return true
      })
    )
  }, [editor, editable, onPickerAbiertoChange])

  function insertarDato(variable: InsertableVariable) {
    editor.exec(insertNode({ type: 'variable_token', attrs: atributosDeDato(variable) }))
    editor.focus()
  }

  return (
    <ProseKit editor={editor}>
      <div className="rounded-lg border border-border">
        <div className="flex justify-end border-b border-border px-3 py-2">
          {editable ? (
            <InsertarDatoPicker
              variables={insertables}
              abierto={pickerAbierto}
              onAbiertoChange={onPickerAbiertoChange}
              onInsertar={insertarDato}
            />
          ) : null}
        </div>
        <DocChangeBridge onChange={editable ? onChange : undefined} />
        <div
          ref={mountRef}
          className={cn(
            'min-h-[260px] px-5 py-4 font-serif text-[15px] leading-8 outline-none',
            CLASES_NODOS_EDITOR
          )}
        />
      </div>
    </ProseKit>
  )
}

function DocChangeBridge({ onChange }: { onChange?: (content: ClauseContentJson) => void }) {
  useDocChange((doc: ProseMirrorNode) => {
    if (!onChange) return
    onChange(clauseContentFromDoc(doc.toJSON()))
  })
  return null
}

function PlantillaEditorSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Skeleton className="h-[520px] rounded-lg" />
      <Skeleton className="h-[520px] rounded-lg" />
    </div>
  )
}

function PlantillaDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-[520px] rounded-lg" />
    </div>
  )
}
