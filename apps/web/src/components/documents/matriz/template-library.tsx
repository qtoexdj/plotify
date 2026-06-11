'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, FileText, Library, Plus, RefreshCw, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createEscrituraTemplate,
  getEscrituraTemplate,
  listEscrituraTemplates,
  publishEscrituraTemplate,
} from '@/lib/documents/matriz-client'
import type {
  EscrituraTemplateDetail,
  EscrituraTemplateSummary,
  TemplateStatus,
} from '@/lib/documents/matriz-types'
import { TemplateClauseForm } from './template-clause-form'

export const TEMPLATE_STATUS_LABELS = {
  draft: 'Borrador',
  published: 'Publicado',
  retired: 'Retirado',
} as const satisfies Record<TemplateStatus, string>

export function templateStatusLabel(status: TemplateStatus): string {
  return TEMPLATE_STATUS_LABELS[status]
}

export function canEditTemplate(template: Pick<EscrituraTemplateSummary, 'status'>): boolean {
  return template.status === 'draft'
}

export function formatTemplateVersion(template: Pick<EscrituraTemplateSummary, 'version'>): string {
  return `v${template.version}`
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

export function summarizeTemplateLibrary(templates: EscrituraTemplateSummary[]) {
  return {
    totalCount: templates.length,
    draftCount: templates.filter((template) => template.status === 'draft').length,
    publishedCount: templates.filter((template) => template.status === 'published').length,
    totalClauseCount: templates.reduce((total, template) => total + template.clause_count, 0),
  }
}

type TemplateLibraryProps = {
  initialTemplates?: EscrituraTemplateSummary[]
}

export function TemplateLibrary({ initialTemplates = [] }: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<EscrituraTemplateSummary[]>(initialTemplates)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplates[0]?.id ?? null
  )
  const [selectedTemplate, setSelectedTemplate] = useState<EscrituraTemplateDetail | null>(null)
  const [newTemplateName, setNewTemplateName] = useState('Compraventa predio rustico')
  const [isListLoading, setIsListLoading] = useState(initialTemplates.length === 0)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = useMemo(() => summarizeTemplateLibrary(templates), [templates])
  const visibleTemplate = selectedTemplate?.id === selectedTemplateId ? selectedTemplate : null
  const editable = visibleTemplate ? canEditTemplate(visibleTemplate) : false
  const selectedClause = visibleTemplate?.clauses[0] ?? null
  const nextPosition = visibleTemplate?.clauses.length ?? 0

  async function refreshTemplates(preferredId?: string) {
    setIsListLoading(true)
    setError(null)
    try {
      const response = await listEscrituraTemplates()
      setTemplates(response.templates)
      setSelectedTemplateId(preferredId ?? response.templates[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la biblioteca.')
    } finally {
      setIsListLoading(false)
    }
  }

  useEffect(() => {
    if (initialTemplates.length > 0) return
    let active = true
    Promise.resolve()
      .then(() => listEscrituraTemplates())
      .then((response) => {
        if (!active) return
        setTemplates(response.templates)
        setSelectedTemplateId(response.templates[0]?.id ?? null)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'No se pudo cargar la biblioteca.')
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
        setTemplates((current) => mergeTemplateDetailIntoList(current, detail))
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'No se pudo cargar la plantilla.')
      })
      .finally(() => {
        if (active) setIsDetailLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedTemplateId])

  async function handleCreateTemplate(cloneFromTemplateId?: string) {
    const name = newTemplateName.trim()
    if (!name) {
      setError('Indica un nombre para el borrador.')
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
      setTemplates((current) => mergeTemplateDetailIntoList(current, detail))
      setSelectedTemplate(detail)
      setSelectedTemplateId(detail.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el borrador.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handlePublish() {
    if (!selectedTemplate) return
    setIsBusy(true)
    setError(null)
    try {
      const detail = await publishEscrituraTemplate(selectedTemplate.id)
      setSelectedTemplate(detail)
      setTemplates((current) => mergeTemplateDetailIntoList(current, detail))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar la plantilla.')
    } finally {
      setIsBusy(false)
    }
  }

  function handleSaved(detail: EscrituraTemplateDetail) {
    setSelectedTemplate(detail)
    setTemplates((current) => mergeTemplateDetailIntoList(current, detail))
  }

  if (isListLoading) {
    return <TemplateLibrarySkeleton />
  }

  return (
    <section className="space-y-4" data-testid="template-library">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Library className="size-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold tracking-tight">Biblioteca de plantillas</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.totalCount} plantillas · {summary.draftCount} borradores ·{' '}
            {summary.publishedCount} publicadas · {summary.totalClauseCount} cláusulas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => refreshTemplates()}
            disabled={isBusy}
          >
            <RefreshCw />
            Recargar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!selectedTemplate || isBusy}
            onClick={() => selectedTemplate && handleCreateTemplate(selectedTemplate.id)}
          >
            <Copy />
            Clonar
          </Button>
          <Button type="button" disabled={!editable || isBusy} onClick={handlePublish}>
            <Upload />
            Publicar
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
            <p className="text-sm font-semibold">Nuevo borrador</p>
            <div className="mt-3 flex gap-2">
              <Input
                value={newTemplateName}
                onChange={(event) => setNewTemplateName(event.target.value)}
                placeholder="Nombre de la plantilla"
              />
              <Button type="button" onClick={() => handleCreateTemplate()} disabled={isBusy}>
                <Plus />
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Plantillas</p>
              <p className="text-xs text-muted-foreground">Compraventa versionada</p>
            </div>
            <div className="max-h-[720px] overflow-auto p-2">
              {templates.length > 0 ? (
                templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`mb-1 w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      selectedTemplateId === template.id
                        ? 'border-primary bg-primary/10'
                        : 'border-transparent hover:bg-muted'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{template.name}</span>
                      <Badge variant="outline">{formatTemplateVersion(template)}</Badge>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge>{templateStatusLabel(template.status)}</Badge>
                      <span>{template.clause_count} cláusulas</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="p-3 text-sm text-muted-foreground">No hay plantillas todavía.</p>
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          {isDetailLoading ? (
            <TemplateDetailSkeleton />
          ) : visibleTemplate ? (
            <>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" />
                      <h3 className="truncate text-lg font-semibold">{visibleTemplate.name}</h3>
                      <Badge variant="outline">{formatTemplateVersion(visibleTemplate)}</Badge>
                      <Badge>{templateStatusLabel(visibleTemplate.status)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {visibleTemplate.document_type} · {visibleTemplate.clauses.length} cláusulas
                    </p>
                  </div>
                  {!editable ? (
                    <p className="max-w-md text-sm text-muted-foreground">
                      Las plantillas publicadas son inmutables. Clona este template para editar un
                      nuevo borrador.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-semibold">Cláusulas</p>
                    <p className="text-xs text-muted-foreground">Se edita la primera de la lista</p>
                  </div>
                  <div className="p-2">
                    {visibleTemplate.clauses.length > 0 ? (
                      visibleTemplate.clauses.map((clause) => (
                        <div
                          key={clause.clause_key}
                          className="mb-1 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate font-medium">{clause.title}</span>
                            {clause.fixed_position ? <Badge variant="outline">fija</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {clause.clause_key} · posición {clause.position}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="p-3 text-sm text-muted-foreground">
                        Este borrador aún no tiene cláusulas.
                      </p>
                    )}
                  </div>
                </div>

                <TemplateClauseForm
                  key={`${visibleTemplate.id}-${selectedClause?.clause_key ?? 'new'}`}
                  templateId={visibleTemplate.id}
                  clause={selectedClause}
                  nextPosition={nextPosition}
                  editable={editable}
                  onSaved={handleSaved}
                />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
              Selecciona una plantilla para revisar sus cláusulas.
            </div>
          )}
        </main>
      </div>
    </section>
  )
}

function TemplateLibrarySkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Skeleton className="h-[520px] rounded-lg" />
      <Skeleton className="h-[520px] rounded-lg" />
    </div>
  )
}

function TemplateDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-[520px] rounded-lg" />
    </div>
  )
}
