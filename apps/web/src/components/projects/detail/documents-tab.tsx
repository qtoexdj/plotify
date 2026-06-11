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
  Loading02Icon,
  ViewIcon,
  Share01Icon,
} from '@hugeicons/core-free-icons'
import type { ProjectWithMetrics } from '@/types/database.types'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { DocumentViewer } from './document-viewer'
import Image from 'next/image'
import Link from 'next/link'
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

  const reservedLots = lots.filter((l) => l.estado === 'reservado')
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
    <div className="space-y-6">
      {/* ── Documentos de Reserva ─────────────────────────────────── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={FileAttachmentIcon} className="w-5 h-5 text-indigo-600" />
              Documentos de Reserva
            </CardTitle>
            <CardDescription>
              Genera comprobantes de reserva (PDF/DOCX) para los lotes con estado{' '}
              <span className="font-medium text-foreground">reservado</span> desde la plantilla
              activa del proyecto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reservedLots.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg text-sm">
                No hay lotes en estado <strong>reservado</strong> en este proyecto.
              </div>
            ) : (
              <div className="divide-y rounded-lg border overflow-hidden">
                {reservedLots.map((lot) => (
                  <div
                    key={lot.id}
                    className="flex items-center justify-between px-4 py-3 bg-card hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="text-amber-700 bg-amber-50 border-amber-200 text-xs"
                      >
                        Reservado
                      </Badge>
                      <span className="text-sm font-medium">{lot.numero_lote}</span>
                    </div>
                    <Link href={`/documentos/generar/${lot.id}`} id={`generate-doc-${lot.id}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                      >
                        <HugeiconsIcon icon={FileUploadIcon} className="w-4 h-4 mr-1.5" />
                        Generar documento
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Documentos de Escritura ── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={FileAttachmentIcon} className="w-5 h-5 text-green-600" />
              Documentos de Escritura
            </CardTitle>
            <CardDescription>
              Genera la escritura definitiva de compraventa (PDF/DOCX) para los lotes vendidos tras
              completar la revisión de sus variables legales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {soldLots.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground border-2 border-dashed rounded-lg text-sm">
                No hay lotes en estado <strong>vendido</strong> disponibles para escritura en este
                proyecto.
              </div>
            ) : (
              <div className="divide-y rounded-lg border overflow-hidden">
                {soldLots.map((lot) => (
                  <div key={lot.id} className="space-y-3 px-4 py-3 bg-card">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className="text-green-700 bg-green-50 border-green-200 text-xs"
                        >
                          Escritura Pendiente
                        </Badge>
                        <span className="text-sm font-medium">{lot.numero_lote}</span>
                      </div>
                      <Link
                        href={`/documentos/generar/${lot.id}?type=escritura`}
                        id={`generate-escritura-${lot.id}`}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-green-600 border-green-200 hover:bg-green-50"
                        >
                          <HugeiconsIcon icon={FileUploadIcon} className="w-4 h-4 mr-1.5" />
                          Revisar y Generar
                        </Button>
                      </Link>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon icon={ImageAdd01Icon} className="w-5 h-5 text-blue-600" />
              Galería de Imágenes
            </CardTitle>
            <CardDescription>Hasta 10 imágenes del proyecto.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {project.images && project.images.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleShareAllImages}>
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
                <Button variant="outline" size="sm" asChild disabled={isUploading === 'images'}>
                  <label htmlFor="image-upload" className="cursor-pointer">
                    {isUploading === 'images' ? (
                      <HugeiconsIcon icon={Loading02Icon} className="w-4 h-4 mr-2 animate-spin" />
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
            <div className="py-10 text-center text-slate-500 border-2 border-dashed rounded-lg">
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
                      <div className="relative aspect-square rounded-lg overflow-hidden border bg-slate-100 group">
                        <Image
                          src={getFullUrl(path)}
                          alt={`img-${index}`}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                          <Button variant="ghost" size="icon" className="text-white" asChild>
                            <a href={getFullUrl(path)} target="_blank" rel="noopener noreferrer">
                              <HugeiconsIcon icon={ViewIcon} className="w-5 h-5" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-white"
                            onClick={() => handleShare(getFullUrl(path), 'Imagen del Proyecto')}
                          >
                            <HugeiconsIcon icon={Share01Icon} className="w-5 h-5" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-400 hover:text-red-500"
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
                <CarouselPrevious className="absolute -left-4 xl:-left-8" />
                <CarouselNext className="absolute -right-4 xl:-right-8" />
              </Carousel>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentos Legales */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={FileAttachmentIcon} className="w-5 h-5 text-blue-600" />
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
                return (
                  <div
                    key={doc.id}
                    className="p-4 border rounded-lg space-y-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-blue-600">
                          <HugeiconsIcon icon={FileUploadIcon} className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium">{doc.label}</p>
                          {activeDocuments.length > 0 ? (
                            <Badge
                              variant="outline"
                              className="text-green-600 bg-green-50 border-green-200"
                            >
                              {activeDocuments.length}{' '}
                              {activeDocuments.length === 1
                                ? 'documento activo'
                                : 'documentos activos'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 bg-slate-50">
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
                          <Button size="sm" asChild disabled={isUploading === doc.id}>
                            <label htmlFor={`upload-${doc.id}`} className="cursor-pointer">
                              {isUploading === doc.id ? (
                                <HugeiconsIcon
                                  icon={Loading02Icon}
                                  className="w-4 h-4 mr-2 animate-spin"
                                />
                              ) : (
                                <HugeiconsIcon icon={FileUploadIcon} className="w-4 h-4 mr-2" />
                              )}
                              Agregar
                            </label>
                          </Button>
                        </div>
                      )}
                    </div>
                    {activeDocuments.length > 0 && (
                      <div className="divide-y rounded-lg border overflow-hidden">
                        {activeDocuments.map((activeDocument) => (
                          <div
                            key={activeDocument.id}
                            className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between bg-card"
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
                                  className="text-blue-600 bg-blue-50 border-blue-200 text-xs"
                                >
                                  {LEGAL_EXTRACTION_STATUS_LABELS[activeDocument.extraction_status]}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                              <DocumentViewer
                                url={getFullUrl(activeDocument.storage_path)}
                                title={activeDocument.original_filename}
                              />
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={getFullUrl(activeDocument.storage_path)}
                                  download={activeDocument.original_filename}
                                  target="_blank"
                                  rel="noopener noreferrer"
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
                                    onChange={(e) => handleFileUpload(doc.id, e, activeDocument.id)}
                                    disabled={isUploading === `replace-${activeDocument.id}`}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                    disabled={isUploading === `replace-${activeDocument.id}`}
                                  >
                                    <label
                                      htmlFor={`replace-${activeDocument.id}`}
                                      className="cursor-pointer"
                                    >
                                      {isUploading === `replace-${activeDocument.id}` ? (
                                        <HugeiconsIcon
                                          icon={Loading02Icon}
                                          className="w-4 h-4 animate-spin"
                                        />
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
                                  className="text-red-500"
                                  onClick={() => handleDeleteLegalDocument(activeDocument)}
                                >
                                  <HugeiconsIcon icon={Trash01Icon} className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeDocuments.length === 0 && path && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg border">
                        <Badge
                          variant="outline"
                          className="text-green-600 bg-green-50 border-green-200"
                        >
                          Cargado (sin registro legal)
                        </Badge>
                        <div className="flex items-center gap-1 sm:gap-2">
                          <DocumentViewer url={getFullUrl(path)} title={doc.label} />
                          <Button variant="outline" size="sm" asChild>
                            <a
                              href={getFullUrl(path)}
                              download={`${doc.label}.pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <HugeiconsIcon icon={Download01Icon} className="w-4 h-4" />
                            </a>
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500"
                              onClick={() => handleDelete(doc.id, path)}
                            >
                              <HugeiconsIcon icon={Trash01Icon} className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              }
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-blue-600">
                      <HugeiconsIcon icon={FileUploadIcon} className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium">{doc.label}</p>
                      {path ? (
                        <div className="flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className="text-green-600 bg-green-50 border-green-200"
                          >
                            Cargado
                          </Badge>
                          {extractionStatus && (
                            <Badge
                              variant="outline"
                              className="text-blue-600 bg-blue-50 border-blue-200"
                            >
                              {LEGAL_EXTRACTION_STATUS_LABELS[extractionStatus]}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-slate-400 bg-slate-50">
                          Pendiente
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    {path ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleShare(getFullUrl(path), doc.label)}
                        >
                          <HugeiconsIcon icon={Share01Icon} className="w-4 h-4 sm:mr-2" />
                          <span className="hidden sm:inline">Compartir</span>
                        </Button>
                        <DocumentViewer url={getFullUrl(path)} title={doc.label} />
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={getFullUrl(path)}
                            download={`${doc.label}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <HugeiconsIcon icon={Download01Icon} className="w-4 h-4 sm:mr-2" />
                            <span className="hidden sm:inline">Descargar</span>
                          </a>
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500"
                            onClick={() => handleDelete(doc.id, path)}
                          >
                            <HugeiconsIcon icon={Trash01Icon} className="w-4 h-4" />
                          </Button>
                        )}
                      </>
                    ) : (
                      isAdmin && (
                        <div className="relative">
                          <input
                            type="file"
                            id={`upload-${doc.id}`}
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => handleFileUpload(doc.id, e)}
                            disabled={isUploading === doc.id}
                          />
                          <Button size="sm" asChild disabled={isUploading === doc.id}>
                            <label htmlFor={`upload-${doc.id}`} className="cursor-pointer">
                              {isUploading === doc.id ? (
                                <HugeiconsIcon
                                  icon={Loading02Icon}
                                  className="w-4 h-4 mr-2 animate-spin"
                                />
                              ) : (
                                <HugeiconsIcon icon={FileUploadIcon} className="w-4 h-4 mr-2" />
                              )}
                              Subir
                            </label>
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
