'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileAttachmentIcon,
  FileUploadIcon,
  Download01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { DocumentViewer } from './document-viewer'
import { EscrituraReadinessPanel } from '@/components/projects/legal/escritura-readiness-panel'
import {
  LEGAL_EXTRACTION_STATUS_LABELS,
  type LegalDocumentType,
} from '@/lib/legal/variable-resolution-types'
import type { ProjectWithMetrics } from '@/types/database.types'
import type { LotWithRecord } from './types'

interface DocumentsTabProps {
  project: ProjectWithMetrics
  isAdmin: boolean
  lots?: LotWithRecord[]
}

interface ProjectLegalFile {
  id: string
  fileId: string | null
  document_type: LegalDocumentType
  source_field: string | null
  original_filename: string
  version_number: number
  extraction_status: keyof typeof LEGAL_EXTRACTION_STATUS_LABELS
}

const DOCUMENT_TYPES: { id: string; label: string; documentType: LegalDocumentType }[] = [
  { id: 'doc_dominio_vigente', label: 'Dominio Vigente', documentType: 'dominio_vigente' },
  {
    id: 'doc_hipoteca_gravamen',
    label: 'Certificado Hipoteca y Gravamen',
    documentType: 'hipoteca_gravamen',
  },
  { id: 'doc_personeria', label: 'Personerías / Representación', documentType: 'personeria' },
  { id: 'doc_roles', label: 'Certificado de Roles', documentType: 'certificado_roles_sii' },
  { id: 'doc_subdivision', label: 'Certificado de Subdivisión', documentType: 'certificado_sag' },
  { id: 'doc_plano_oficial', label: 'Plano Oficial', documentType: 'plano_oficial' },
  { id: 'doc_otros', label: 'Otros Documentos', documentType: 'otro' },
]

function fileHref(fileId: string) {
  return `/api/files/${encodeURIComponent(fileId)}`
}

async function loadProjectDocuments(projectId: string): Promise<ProjectLegalFile[]> {
  const response = await fetch(`/api/projects/${projectId}/legal-documents`)
  if (!response.ok) throw new Error('No fue posible cargar los documentos')
  const result = (await response.json()) as { documents?: ProjectLegalFile[] }
  return result.documents ?? []
}

export function DocumentsTab({ project, isAdmin, lots = [] }: DocumentsTabProps) {
  const [documents, setDocuments] = useState<ProjectLegalFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setDocuments(await loadProjectDocuments(project.id))
    } catch (error) {
      console.error('Error loading legal documents:', error)
      toast.error('No fue posible cargar los documentos legales')
    } finally {
      setIsLoading(false)
    }
  }, [project.id])

  useEffect(() => {
    let active = true
    void loadProjectDocuments(project.id)
      .then((result) => {
        if (active) setDocuments(result)
      })
      .catch((error) => {
        console.error('Error loading legal documents:', error)
        toast.error('No fue posible cargar los documentos legales')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [project.id])

  const activeByType = useMemo(() => {
    const result = new Map<LegalDocumentType, ProjectLegalFile[]>()
    for (const document of documents) {
      if (document.extraction_status === 'superseded') continue
      const current = result.get(document.document_type) ?? []
      current.push(document)
      result.set(document.document_type, current)
    }
    for (const current of result.values()) {
      current.sort((left, right) => right.version_number - left.version_number)
    }
    return result
  }, [documents])

  const summary = useMemo(() => {
    const loadedTypes = DOCUMENT_TYPES.filter(
      (type) => (activeByType.get(type.documentType) ?? []).length > 0
    ).length
    const activeDocuments = [...activeByType.values()].flat()
    return {
      loadedTypes,
      pendingTypes: DOCUMENT_TYPES.length - loadedTypes,
      activeCount: activeDocuments.length,
      needsReview: activeDocuments.filter((document) =>
        ['needs_review', 'failed'].includes(document.extraction_status)
      ).length,
    }
  }, [activeByType])

  const upload = async (
    definition: (typeof DOCUMENT_TYPES)[number],
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setPendingKey(definition.id)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('sourceField', definition.id)
      body.append('documentType', definition.documentType)
      const response = await fetch(`/api/projects/${project.id}/files`, {
        method: 'POST',
        headers: {
          'x-plotify-file-category': 'legal_document',
          'idempotency-key': crypto.randomUUID(),
        },
        body,
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Error al subir el archivo')
      await refresh()
      toast.success('Documento cargado correctamente')
    } catch (error) {
      console.error('Error uploading legal document:', error)
      toast.error(error instanceof Error ? error.message : 'Error al subir el archivo')
    } finally {
      setPendingKey(null)
    }
  }

  const archive = async (document: ProjectLegalFile) => {
    if (!confirm(`¿Archivar "${document.original_filename}"?`)) return
    setPendingKey(document.id)
    try {
      const response = await fetch(
        `/api/projects/${project.id}/legal-documents?legalDocumentId=${encodeURIComponent(document.id)}`,
        { method: 'DELETE' }
      )
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Error al archivar el documento')
      await refresh()
      toast.success('Documento archivado')
    } catch (error) {
      console.error('Error archiving legal document:', error)
      toast.error(error instanceof Error ? error.message : 'Error al archivar el documento')
    } finally {
      setPendingKey(null)
    }
  }

  const soldLots = lots.filter((lot) => lot.estado === 'vendido')

  return (
    <section className="rounded-2xl border border-border/70 bg-muted/40 p-3 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.65)] dark:border-white/10 dark:bg-background/70 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Tipos', DOCUMENT_TYPES.length],
          ['Cargados', summary.loadedTypes],
          ['Pendientes', summary.pendingTypes],
          ['Revisión', summary.needsReview],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border/50 dark:ring-white/10"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <Card className="mt-4 overflow-hidden border-border/70 bg-card shadow-sm dark:border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={FileAttachmentIcon} className="h-5 w-5 text-info" />
            Documentos legales
          </CardTitle>
          <CardDescription>
            Los archivos privados se consultan mediante identificadores opacos y autorización del
            servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex min-h-24 items-center justify-center">
              <Spinner />
            </div>
          ) : (
            DOCUMENT_TYPES.map((definition) => {
              const current = activeByType.get(definition.documentType) ?? []
              return (
                <div
                  key={definition.id}
                  className="rounded-xl border border-border/70 bg-background/60 p-4 dark:border-white/10"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{definition.label}</p>
                      <Badge
                        variant="outline"
                        className={
                          current.length > 0
                            ? 'border-success/20 bg-success/10 text-success'
                            : 'bg-muted text-muted-foreground'
                        }
                      >
                        {current.length > 0
                          ? `${current.length} ${current.length === 1 ? 'documento activo' : 'documentos activos'}`
                          : 'Pendiente'}
                      </Badge>
                    </div>
                    {isAdmin && (
                      <div className="relative">
                        <input
                          id={`upload-${definition.id}`}
                          type="file"
                          accept="application/pdf,.pdf"
                          className="hidden"
                          disabled={pendingKey !== null}
                          onChange={(event) => void upload(definition, event)}
                        />
                        <Button size="sm" asChild disabled={pendingKey !== null}>
                          <label htmlFor={`upload-${definition.id}`} className="cursor-pointer">
                            {pendingKey === definition.id ? (
                              <Spinner className="mr-2 h-4 w-4" />
                            ) : (
                              <HugeiconsIcon icon={FileUploadIcon} className="mr-2 h-4 w-4" />
                            )}
                            Agregar
                          </label>
                        </Button>
                      </div>
                    )}
                  </div>

                  {current.length > 0 && (
                    <div className="mt-3 divide-y overflow-hidden rounded-xl border border-border/70 bg-card dark:border-white/10">
                      {current.map((document) => (
                        <div
                          key={document.id}
                          className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {document.original_filename}
                            </p>
                            <div className="mt-1 flex gap-2">
                              <Badge variant="outline">v{document.version_number}</Badge>
                              <Badge variant="outline">
                                {LEGAL_EXTRACTION_STATUS_LABELS[document.extraction_status]}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {document.fileId ? (
                              <>
                                <DocumentViewer
                                  url={fileHref(document.fileId)}
                                  title={document.original_filename}
                                />
                                <Button variant="outline" size="icon" asChild>
                                  <a
                                    href={fileHref(document.fileId)}
                                    download={document.original_filename}
                                    aria-label={`Descargar ${document.original_filename}`}
                                  >
                                    <HugeiconsIcon icon={Download01Icon} className="h-4 w-4" />
                                  </a>
                                </Button>
                              </>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-warning/20 bg-warning/10 text-warning"
                              >
                                Migración pendiente
                              </Badge>
                            )}
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={pendingKey !== null}
                                onClick={() => void archive(document)}
                                aria-label={`Archivar ${document.original_filename}`}
                              >
                                {pendingKey === document.id ? (
                                  <Spinner className="h-4 w-4" />
                                ) : (
                                  <HugeiconsIcon
                                    icon={Delete02Icon}
                                    className="h-4 w-4 text-destructive"
                                  />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="mt-4 overflow-hidden border-border/70 bg-card shadow-sm dark:border-white/10">
          <CardHeader>
            <CardTitle>Documentos de escritura</CardTitle>
            <CardDescription>
              Preparación de lotes vendidos para sus casos de escritura.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {soldLots.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No hay lotes vendidos disponibles para escritura.
              </p>
            ) : (
              <div className="divide-y rounded-xl border">
                {soldLots.map((lot) => (
                  <div key={lot.id} className="space-y-3 p-4">
                    <Badge variant="outline">{lot.numero_lote}</Badge>
                    <EscrituraReadinessPanel projectId={project.id} lotId={lot.id} compact />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
