'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileAttachmentIcon,
  FileUploadIcon,
  Download01Icon,
  Delete02Icon,
  Calendar01Icon,
  ViewOffIcon,
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
  uploaded_at: string | null
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

function formatUploadDate(value: string | null) {
  if (!value) return 'Fecha no disponible'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible'

  return date.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
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
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
        document?: ProjectLegalFile
      }
      if (!response.ok) throw new Error(result.error || 'Error al subir el archivo')
      if (result.document) {
        const uploadedDocument = result.document
        setDocuments((current) => [
          uploadedDocument,
          ...current.filter((document) => document.id !== uploadedDocument.id),
        ])
      } else {
        // Recuperación excepcional para respuestas idempotentes antiguas que
        // todavía no incluyen la proyección completa del documento.
        await refresh()
      }
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
      setDocuments((current) => current.filter((item) => item.id !== document.id))
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
      <Card className="overflow-hidden border-border/70 bg-card shadow-sm dark:border-white/10">
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
            <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Spinner className="h-8 w-8 text-primary" />
              <p className="text-sm">Cargando documentos...</p>
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
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <Badge variant="outline">Versión {document.version_number}</Badge>
                              <Badge variant="outline">
                                Estado: {LEGAL_EXTRACTION_STATUS_LABELS[document.extraction_status]}
                              </Badge>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <HugeiconsIcon
                                  icon={Calendar01Icon}
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Subido el {formatUploadDate(document.uploaded_at)}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
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
                              <div
                                className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-muted-foreground"
                                role="status"
                              >
                                <HugeiconsIcon
                                  icon={ViewOffIcon}
                                  className="h-4 w-4 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="flex flex-col text-xs leading-tight">
                                  <span className="font-medium text-foreground">
                                    Vista previa no disponible
                                  </span>
                                  <span>Archivo histórico pendiente de vinculación segura.</span>
                                </span>
                              </div>
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
