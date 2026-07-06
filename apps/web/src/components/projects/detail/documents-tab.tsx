'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ImageAdd01Icon,
  FileUploadIcon,
  Delete02Icon as Trash01Icon,
  Download01Icon,
  FileAttachmentIcon,
  ViewIcon,
  Share01Icon,
} from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'
import type { ProjectWithMetrics } from '@/types/database.types'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { DocumentViewer } from './document-viewer'
import Image from 'next/image'
import type { LotWithRecord } from './types'
import {
  LEGAL_EXTRACTION_STATUS_LABELS,
  isMultiActiveLegalDocumentType,
  type LegalDocument,
  type LegalDocumentType,
  type LegalExtractionStatus,
} from '@/lib/legal/variable-resolution-types'
import { EscrituraReadinessPanel } from '@/components/projects/legal/escritura-readiness-panel'

interface DocumentsTabProps {
  project: ProjectWithMetrics
  isAdmin: boolean
  lots?: LotWithRecord[]
}

// FR-031/FR-033: los tipos multi-documento (dominios, personerías, hipotecas,
// planos multi-lámina, otros) listan todos los documentos activos y permiten
// agregar o reemplazar uno específico; el resto mantiene slot único por tipo.
const DOCUMENT_TYPES: { id: string; label: string; documentType: LegalDocumentType }[] = [
  { id: 'doc_dominio_vigente', label: 'Dominio Vigente', documentType: 'dominio_vigente' },
  {
    id: 'doc_hipoteca_gravamen',
    label: 'Certificado Hipoteca y Gravamen',
    documentType: 'hipoteca_gravamen',
  },
  {
    id: 'doc_personeria',
    label: 'Personerías / Representación',
    documentType: 'personeria',
  },
  { id: 'doc_roles', label: 'Certificado de Roles', documentType: 'certificado_roles_sii' },
  {
    id: 'doc_subdivision',
    label: 'Certificado de Subdivisión',
    documentType: 'certificado_sag',
  },
  { id: 'doc_plano_oficial', label: 'Plano Oficial', documentType: 'plano_oficial' },
  { id: 'doc_otros', label: 'Otros Documentos', documentType: 'otro' },
]

export function DocumentsTab({ project: initialProject, isAdmin, lots = [] }: DocumentsTabProps) {
  const [project, setProject] = useState(initialProject)
  const [isUploading, setIsUploading] = useState<string | null>(null)
  const [legalDocuments, setLegalDocuments] = useState<LegalDocument[]>([])
  const supabase = createClient()

  const soldLots = lots.filter((l) => l.estado === 'vendido')
  const legalDocumentByField = useMemo(() => {
    const latest = new Map<string, LegalDocument>()
    for (const document of legalDocuments) {
      if (!document.source_field || document.extraction_status === 'superseded') continue
      const current = latest.get(document.source_field)
      if (!current || document.version_number > current.version_number) {
        latest.set(document.source_field, document)
      }
    }
    return latest
  }, [legalDocuments])

  const activeLegalDocumentsByType = useMemo(() => {
    const byType = new Map<LegalDocumentType, LegalDocument[]>()
    for (const document of legalDocuments) {
      if (document.extraction_status === 'superseded') continue
      const list = byType.get(document.document_type) ?? []
      list.push(document)
      byType.set(document.document_type, list)
    }
    for (const list of byType.values()) {
      list.sort((a, b) => a.version_number - b.version_number)
    }
    return byType
  }, [legalDocuments])

  const legalDocumentSummary = useMemo(() => {
    let loadedTypes = 0
    let activeDocumentCount = 0
    let needsReviewCount = 0

    for (const doc of DOCUMENT_TYPES) {
      const legacyPath = (project as ProjectWithMetrics)[doc.id as keyof ProjectWithMetrics] as
        | string
        | null
        | undefined
      const activeDocuments = activeLegalDocumentsByType.get(doc.documentType) ?? []
      const registeredDocument = legalDocumentByField.get(doc.id)
      const hasLoaded = activeDocuments.length > 0 || Boolean(legacyPath)

      if (hasLoaded) loadedTypes += 1
      activeDocumentCount += activeDocuments.length || (legacyPath ? 1 : 0)

      if (activeDocuments.length > 0) {
        needsReviewCount += activeDocuments.filter((document) =>
          ['needs_review', 'failed'].includes(document.extraction_status)
        ).length
      } else if (
        registeredDocument &&
        ['needs_review', 'failed'].includes(registeredDocument.extraction_status)
      ) {
        needsReviewCount += 1
      }
    }

    return {
      totalTypes: DOCUMENT_TYPES.length,
      loadedTypes,
      pendingTypes: DOCUMENT_TYPES.length - loadedTypes,
      activeDocumentCount,
      needsReviewCount,
    }
  }, [activeLegalDocumentsByType, legalDocumentByField, project])

  useEffect(() => {
    let isMounted = true

    async function loadLegalDocuments() {
      try {
        const response = await fetch(`/api/projects/${project.id}/legal-documents`)
        if (!response.ok) return
        const result = (await response.json()) as { documents?: LegalDocument[] }
        if (isMounted) setLegalDocuments(result.documents ?? [])
      } catch (error) {
        console.error('Error loading legal document statuses:', error)
      }
    }

    loadLegalDocuments()

    return () => {
      isMounted = false
    }
  }, [project.id])

  const getFullUrl = (path: string | null | undefined) => {
    if (!path || path === '[]') return ''
    // Limpiamos el path por si ya trae el nombre del bucket (pasa a veces en subidas directas)
    const cleanPath = path.replace(/^project-files\//, '')
    const { data } = supabase.storage.from('project-files').getPublicUrl(cleanPath)
    return data.publicUrl
  }

  const handleShare = async (url: string, title: string) => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: title,
          text: `Revisa este documento: ${title}`,
          url: url,
        })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Enlace copiado', {
          description: 'Enlace del documento copiado al portapapeles.',
        })
      }
    } catch (error: unknown) {
      if ((error as { name?: string }).name !== 'AbortError') {
        console.error('Error sharing:', error)
        toast.error('No se pudo compartir el archivo')
      }
    }
  }

  const handleShareAllImages = async () => {
    if (!project.images || project.images.length === 0) return

    const urlsText = project.images
      .map((path: string, i: number) => `Imagen ${i + 1}: ${getFullUrl(path)}`)
      .join('\n')
    const textToShare = `Galería de imágenes del proyecto ${project.name}:\n\n${urlsText}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Galería - ${project.name}`,
          text: textToShare,
        })
      } else {
        await navigator.clipboard.writeText(textToShare)
        toast.success('Enlaces copiados', {
          description: 'Los enlaces de todas las imágenes se han copiado al portapapeles.',
        })
      }
    } catch (error: unknown) {
      if ((error as { name?: string }).name !== 'AbortError') {
        console.error('Error sharing:', error)
        toast.error('No se pudo compartir la galería')
      }
    }
  }

  const handleFileUpload = async (
    type: string,
    e: React.ChangeEvent<HTMLInputElement>,
    replacesLegalDocumentId?: string
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(replacesLegalDocumentId ? `replace-${replacesLegalDocumentId}` : type)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', project.id)
      formData.append('type', type)
      if (replacesLegalDocumentId) {
        formData.append('replacesLegalDocumentId', replacesLegalDocumentId)
      }

      const response = await fetch('/api/uploads/project-files', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error al validar o subir el archivo')
      }

      setProject(result.project)
      const legalResponse = await fetch(`/api/projects/${project.id}/legal-documents`)
      if (legalResponse.ok) {
        const legalResult = (await legalResponse.json()) as { documents?: LegalDocument[] }
        setLegalDocuments(legalResult.documents ?? [])
      }
      toast.success('Archivo validado y subido con éxito')
    } catch (error: unknown) {
      console.error('Error uploading:', error)
      const message = error instanceof Error ? error.message : 'Error al subir el archivo'
      toast.error(message)
    } finally {
      setIsUploading(null)
    }
  }

  const refreshLegalDocuments = async () => {
    const response = await fetch(`/api/projects/${project.id}/legal-documents`)
    if (response.ok) {
      const result = (await response.json()) as { documents?: LegalDocument[] }
      setLegalDocuments(result.documents ?? [])
    }
  }

  const archiveLegalDocument = async (legalDocumentId: string) => {
    const response = await fetch(
      `/api/projects/${project.id}/legal-documents?legalDocumentId=${encodeURIComponent(legalDocumentId)}`,
      { method: 'DELETE' }
    )
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(result.error || 'Error al eliminar el documento legal')
    }
  }

  const handleDelete = async (type: string, path: string) => {
    if (!confirm('¿Estás seguro de eliminar este archivo?')) return

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage.from('project-files').remove([path])

      if (storageError) throw storageError

      // Update database
      const updates =
        type === 'images'
          ? { images: (project.images || []).filter((img: string) => img !== path) }
          : { [type]: null }

      const { data: updatedProject, error: dbError } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', project.id)
        .select()
        .single()

      if (dbError) throw dbError

      // Archiva tambien el registro legal asociado para que el estado de
      // extraccion no quede activo apuntando a un archivo eliminado.
      const registeredDocument = legalDocumentByField.get(type)
      if (registeredDocument) {
        try {
          await archiveLegalDocument(registeredDocument.id)
          await refreshLegalDocuments()
        } catch (archiveError) {
          console.error('Error archiving legal document:', archiveError)
        }
      }

      setProject(updatedProject)
      toast.success('Archivo eliminado')
    } catch (error) {
      console.error('Error deleting:', error)
      toast.error('Error al eliminar el archivo')
    }
  }

  const handleDeleteLegalDocument = async (legalDocument: LegalDocument) => {
    if (!confirm(`¿Eliminar "${legalDocument.original_filename}"?`)) return

    try {
      await archiveLegalDocument(legalDocument.id)
      // Si la columna legacy del proyecto apunta a este archivo, limpiarla para
      // que no quede un "Cargado" colgante.
      const legacyField = legalDocument.source_field
      if (legacyField) {
        const legacyPath = (project as ProjectWithMetrics)[
          legacyField as keyof ProjectWithMetrics
        ] as string | null
        if (legacyPath && legacyPath === legalDocument.storage_path) {
          const { data: updatedProject } = await supabase
            .from('projects')
            .update({ [legacyField]: null })
            .eq('id', project.id)
            .select()
            .single()
          if (updatedProject) setProject(updatedProject)
        }
      }
      await refreshLegalDocuments()
      toast.success('Documento eliminado')
    } catch (error) {
      console.error('Error deleting legal document:', error)
      const message =
        error instanceof Error ? error.message : 'Error al eliminar el documento legal'
      toast.error(message)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-slate-100/80 p-3 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.65)] dark:border-white/10 dark:bg-background/70 sm:p-4">
      <div className="flex flex-col gap-4">
        <div className="order-1 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border/50 dark:ring-white/10">
            <p className="text-sm text-muted-foreground">Tipos</p>
            <p className="mt-1 font-display text-2xl font-semibold text-foreground">
              {legalDocumentSummary.totalTypes}
            </p>
          </div>
          <div className="rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border/50 dark:ring-white/10">
            <p className="text-sm text-muted-foreground">Cargados</p>
            <p className="mt-1 font-display text-2xl font-semibold text-success">
              {legalDocumentSummary.loadedTypes}
            </p>
          </div>
          <div className="rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border/50 dark:ring-white/10">
            <p className="text-sm text-muted-foreground">Pendientes</p>
            <p className="mt-1 font-display text-2xl font-semibold text-warning">
              {legalDocumentSummary.pendingTypes}
            </p>
          </div>
          <div className="rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border/50 dark:ring-white/10">
            <p className="text-sm text-muted-foreground">Revisión</p>
            <p className="mt-1 font-display text-2xl font-semibold text-info">
              {legalDocumentSummary.needsReviewCount}
            </p>
          </div>
        </div>

        {/* ── Documentos de Escritura ── */}
        {isAdmin && (
          <Card
            size="sm"
            className="order-3 overflow-hidden border-border/70 bg-card shadow-sm dark:border-white/10"
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={FileAttachmentIcon} className="w-5 h-5 text-success" />
                Documentos de Escritura
              </CardTitle>
              <CardDescription>
                Revisa la preparación de los lotes vendidos. La minuta DOCX se genera desde una
                matriz aprobada del caso de escritura.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {soldLots.length === 0 ? (
                <div className="flex min-h-14 items-center justify-center rounded-xl border-2 border-dashed border-border/70 bg-background/60 px-4 py-3 text-center text-sm text-muted-foreground dark:border-white/10 dark:bg-background/50">
                  <span>
                    No hay lotes en estado <strong className="px-1">vendido</strong> disponibles
                    para escritura en este proyecto.
                  </span>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background/60 divide-y dark:border-white/10 dark:divide-white/10 dark:bg-background/50">
                  {soldLots.map((lot) => (
                    <div key={lot.id} className="space-y-3 bg-card px-4 py-3 dark:bg-card">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className="text-success bg-success/10 border-success/20 text-xs"
                          >
                            Escritura Pendiente
                          </Badge>
                          <span className="text-sm font-medium">{lot.numero_lote}</span>
                        </div>
                        <Button variant="outline" size="sm" disabled>
                          <HugeiconsIcon icon={FileAttachmentIcon} className="w-4 h-4 mr-1.5" />
                          Abrir caso legal
                        </Button>
                      </div>
                      <EscrituraReadinessPanel projectId={project.id} lotId={lot.id} compact />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Galería de Imágenes */}
        <Card className="order-4 overflow-hidden border-border/70 bg-card shadow-sm dark:border-white/10">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon icon={ImageAdd01Icon} className="w-5 h-5 text-info" />
                Galería de Imágenes
              </CardTitle>
              <CardDescription>Hasta 10 imágenes del proyecto.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {project.images && project.images.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 min-w-11"
                  onClick={handleShareAllImages}
                >
                  <HugeiconsIcon icon={Share01Icon} className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Compartir Galería</span>
                </Button>
              )}
              {isAdmin && (project.images?.length || 0) < 10 && (
                <div className="relative">
                  <input
                    type="file"
                    id="image-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload('images', e)}
                    disabled={isUploading === 'images'}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    asChild
                    disabled={isUploading === 'images'}
                  >
                    <label htmlFor="image-upload" className="cursor-pointer">
                      {isUploading === 'images' ? (
                        <Spinner className="w-4 h-4 mr-2" />
                      ) : (
                        <HugeiconsIcon icon={ImageAdd01Icon} className="w-4 h-4 mr-2" />
                      )}
                      Subir Imagen
                    </label>
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!project.images || project.images.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border/70 bg-background/60 py-10 text-center text-muted-foreground dark:border-white/10 dark:bg-background/50">
                No hay imágenes cargadas
              </div>
            ) : (
              <div className="px-4">
                <Carousel
                  opts={{
                    align: 'start',
                    loop: false,
                  }}
                  className="w-full"
                >
                  <CarouselContent className="-ml-2 md:-ml-4">
                    {project.images.map((path: string, index: number) => (
                      <CarouselItem
                        key={index}
                        className="pl-2 md:pl-4 basis-full md:basis-1/2 lg:basis-1/4"
                      >
                        <div className="group relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted shadow-xs dark:border-white/10">
                          <Image
                            src={getFullUrl(path)}
                            alt={`img-${index}`}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-11 min-w-11 text-white"
                              asChild
                            >
                              <a href={getFullUrl(path)} target="_blank" rel="noopener noreferrer">
                                <HugeiconsIcon icon={ViewIcon} className="w-5 h-5" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-11 min-w-11 text-white"
                              onClick={() => handleShare(getFullUrl(path), 'Imagen del Proyecto')}
                            >
                              <HugeiconsIcon icon={Share01Icon} className="w-5 h-5" />
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="min-h-11 min-w-11 text-destructive/60 hover:text-destructive"
                                onClick={() => handleDelete('images', path)}
                              >
                                <HugeiconsIcon icon={Trash01Icon} className="w-5 h-5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="absolute -left-4 min-h-11 min-w-11 xl:-left-8" />
                  <CarouselNext className="absolute -right-4 min-h-11 min-w-11 xl:-right-8" />
                </Carousel>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documentos Legales */}
        <Card className="order-2 overflow-hidden border-border/70 bg-card shadow-sm dark:border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={FileAttachmentIcon} className="w-5 h-5 text-info" />
              Documentos Legales
            </CardTitle>
            <CardDescription>Documentación oficial del proyecto.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {DOCUMENT_TYPES.map((doc) => {
                const path = (project as ProjectWithMetrics)[doc.id as keyof ProjectWithMetrics] as
                  | string
                  | null
                const legalDocument = legalDocumentByField.get(doc.id)
                const extractionStatus = legalDocument?.extraction_status as
                  | LegalExtractionStatus
                  | undefined
                if (isMultiActiveLegalDocumentType(doc.documentType)) {
                  const activeDocuments = activeLegalDocumentsByType.get(doc.documentType) ?? []
                  const hasLegacyDocument = activeDocuments.length === 0 && Boolean(path)
                  return (
                    <div
                      key={doc.id}
                      className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4 transition-colors hover:bg-muted/40 dark:border-white/10 dark:bg-background/50 dark:hover:bg-muted/30"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="p-2 bg-info/10 rounded text-info">
                            <HugeiconsIcon icon={FileUploadIcon} className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-medium">{doc.label}</p>
                            {activeDocuments.length > 0 || hasLegacyDocument ? (
                              <Badge
                                variant="outline"
                                className="text-success bg-success/10 border-success/20"
                              >
                                {activeDocuments.length || 1}{' '}
                                {(activeDocuments.length || 1) === 1
                                  ? 'documento activo'
                                  : 'documentos activos'}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground bg-muted">
                                Pendiente
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="relative">
                            <input
                              type="file"
                              id={`upload-${doc.id}`}
                              accept=".pdf"
                              className="hidden"
                              onChange={(e) => handleFileUpload(doc.id, e)}
                              disabled={isUploading === doc.id}
                            />
                            <Button
                              size="sm"
                              className="min-h-11"
                              asChild
                              disabled={isUploading === doc.id}
                            >
                              <label htmlFor={`upload-${doc.id}`} className="cursor-pointer">
                                {isUploading === doc.id ? (
                                  <Spinner className="w-4 h-4 mr-2" />
                                ) : (
                                  <HugeiconsIcon icon={FileUploadIcon} className="w-4 h-4 mr-2" />
                                )}
                                {hasLegacyDocument ? 'Reemplazar' : 'Agregar'}
                              </label>
                            </Button>
                          </div>
                        )}
                      </div>
                      {activeDocuments.length > 0 && (
                        <details className="group" open={activeDocuments.length === 1}>
                          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 [&::-webkit-details-marker]:hidden">
                            <span>
                              {activeDocuments.length === 1
                                ? 'Ver documento activo'
                                : `Ver ${activeDocuments.length} documentos activos`}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              <span className="group-open:hidden">Expandir</span>
                              <span className="hidden group-open:inline">Ocultar</span>
                            </span>
                          </summary>
                          <div className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-card divide-y dark:border-white/10 dark:divide-white/10">
                            {activeDocuments.map((activeDocument) => (
                              <div
                                key={activeDocument.id}
                                className="flex flex-col gap-3 bg-card px-3 py-3 lg:flex-row lg:items-center lg:justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {activeDocument.original_filename}
                                  </p>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    <Badge variant="outline" className="text-xs">
                                      v{activeDocument.version_number}
                                    </Badge>
                                    <Badge
                                      variant="outline"
                                      className="text-info bg-info/10 border-info/20 text-xs"
                                    >
                                      {
                                        LEGAL_EXTRACTION_STATUS_LABELS[
                                          activeDocument.extraction_status
                                        ]
                                      }
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  <DocumentViewer
                                    url={getFullUrl(activeDocument.storage_path)}
                                    title={activeDocument.original_filename}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="min-h-11 min-w-11"
                                    asChild
                                  >
                                    <a
                                      href={getFullUrl(activeDocument.storage_path)}
                                      download={activeDocument.original_filename}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label={`Descargar ${activeDocument.original_filename}`}
                                    >
                                      <HugeiconsIcon icon={Download01Icon} className="w-4 h-4" />
                                    </a>
                                  </Button>
                                  {isAdmin && (
                                    <div className="relative">
                                      <input
                                        type="file"
                                        id={`replace-${activeDocument.id}`}
                                        accept=".pdf"
                                        className="hidden"
                                        onChange={(e) =>
                                          handleFileUpload(doc.id, e, activeDocument.id)
                                        }
                                        disabled={isUploading === `replace-${activeDocument.id}`}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="min-h-11"
                                        asChild
                                        disabled={isUploading === `replace-${activeDocument.id}`}
                                      >
                                        <label
                                          htmlFor={`replace-${activeDocument.id}`}
                                          className="cursor-pointer"
                                        >
                                          {isUploading === `replace-${activeDocument.id}` ? (
                                            <Spinner className="w-4 h-4" />
                                          ) : (
                                            'Reemplazar'
                                          )}
                                        </label>
                                      </Button>
                                    </div>
                                  )}
                                  {isAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="min-h-11 min-w-11 text-destructive"
                                      onClick={() => handleDeleteLegalDocument(activeDocument)}
                                      aria-label={`Eliminar ${activeDocument.original_filename}`}
                                    >
                                      <HugeiconsIcon icon={Trash01Icon} className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {hasLegacyDocument && path && (
                        <details className="group" open>
                          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 [&::-webkit-details-marker]:hidden">
                            <span>Ver documento activo</span>
                            <span className="text-xs text-muted-foreground">
                              <span className="group-open:hidden">Expandir</span>
                              <span className="hidden group-open:inline">Ocultar</span>
                            </span>
                          </summary>
                          <div className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-card dark:border-white/10">
                            <div className="flex flex-col gap-3 bg-card px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{doc.label}.pdf</p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    v1
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="text-success bg-success/10 border-success/20 text-xs"
                                  >
                                    Activo
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="text-muted-foreground bg-muted text-xs"
                                  >
                                    Sin registro legal
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="min-h-11 min-w-11"
                                  onClick={() => handleShare(getFullUrl(path), doc.label)}
                                >
                                  <HugeiconsIcon icon={Share01Icon} className="w-4 h-4 lg:mr-2" />
                                  <span className="hidden lg:inline">Compartir</span>
                                </Button>
                                <DocumentViewer url={getFullUrl(path)} title={doc.label} />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="min-h-11 min-w-11"
                                  asChild
                                >
                                  <a
                                    href={getFullUrl(path)}
                                    download={`${doc.label}.pdf`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Descargar ${doc.label}`}
                                  >
                                    <HugeiconsIcon
                                      icon={Download01Icon}
                                      className="w-4 h-4 lg:mr-2"
                                    />
                                    <span className="hidden lg:inline">Descargar</span>
                                  </a>
                                </Button>
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="min-h-11 min-w-11 text-destructive"
                                    onClick={() => handleDelete(doc.id, path)}
                                    aria-label={`Eliminar ${doc.label}`}
                                  >
                                    <HugeiconsIcon icon={Trash01Icon} className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                  )
                }
                return (
                  <div
                    key={doc.id}
                    className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4 transition-colors hover:bg-muted/40 dark:border-white/10 dark:bg-background/50 dark:hover:bg-muted/30"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="p-2 bg-info/10 rounded text-info">
                          <HugeiconsIcon icon={FileUploadIcon} className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{doc.label}</p>
                          {path ? (
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className="text-success bg-success/10 border-success/20"
                              >
                                1 documento activo
                              </Badge>
                              {extractionStatus && (
                                <Badge
                                  variant="outline"
                                  className="text-info bg-info/10 border-info/20"
                                >
                                  {LEGAL_EXTRACTION_STATUS_LABELS[extractionStatus]}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground bg-muted">
                              Pendiente
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="relative">
                          <input
                            type="file"
                            id={`upload-${doc.id}`}
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => handleFileUpload(doc.id, e)}
                            disabled={isUploading === doc.id}
                          />
                          <Button
                            size="sm"
                            className="min-h-11"
                            asChild
                            disabled={isUploading === doc.id}
                          >
                            <label htmlFor={`upload-${doc.id}`} className="cursor-pointer">
                              {isUploading === doc.id ? (
                                <Spinner className="w-4 h-4 mr-2" />
                              ) : (
                                <HugeiconsIcon icon={FileUploadIcon} className="w-4 h-4 mr-2" />
                              )}
                              {path ? 'Reemplazar' : 'Agregar'}
                            </label>
                          </Button>
                        </div>
                      )}
                    </div>
                    {path && (
                      <details className="group" open>
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 [&::-webkit-details-marker]:hidden">
                          <span>Ver documento activo</span>
                          <span className="text-xs text-muted-foreground">
                            <span className="group-open:hidden">Expandir</span>
                            <span className="hidden group-open:inline">Ocultar</span>
                          </span>
                        </summary>
                        <div className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-card dark:border-white/10">
                          <div className="flex flex-col gap-3 bg-card px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{doc.label}.pdf</p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  v1
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="text-success bg-success/10 border-success/20 text-xs"
                                >
                                  Activo
                                </Badge>
                                {extractionStatus && (
                                  <Badge
                                    variant="outline"
                                    className="text-info bg-info/10 border-info/20 text-xs"
                                  >
                                    {LEGAL_EXTRACTION_STATUS_LABELS[extractionStatus]}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11 min-w-11"
                                onClick={() => handleShare(getFullUrl(path), doc.label)}
                              >
                                <HugeiconsIcon icon={Share01Icon} className="w-4 h-4 lg:mr-2" />
                                <span className="hidden lg:inline">Compartir</span>
                              </Button>
                              <DocumentViewer url={getFullUrl(path)} title={doc.label} />
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11 min-w-11"
                                asChild
                              >
                                <a
                                  href={getFullUrl(path)}
                                  download={`${doc.label}.pdf`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Descargar ${doc.label}`}
                                >
                                  <HugeiconsIcon
                                    icon={Download01Icon}
                                    className="w-4 h-4 lg:mr-2"
                                  />
                                  <span className="hidden lg:inline">Descargar</span>
                                </a>
                              </Button>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="min-h-11 min-w-11 text-destructive"
                                  onClick={() => handleDelete(doc.id, path)}
                                  aria-label={`Eliminar ${doc.label}`}
                                >
                                  <HugeiconsIcon icon={Trash01Icon} className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
