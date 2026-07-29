'use client'

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ImageAdd01Icon,
  FileUploadIcon,
  Delete02Icon as Trash01Icon,
  Tick02Icon,
  FileAttachmentIcon,
} from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

interface ProjectMediaStepProps {
  projectId: string
  onMediaChange: (media: { fileIds: string[] }) => void
}

const DOCUMENT_TYPES = [
  {
    id: 'doc_dominio_vigente',
    documentType: 'dominio_vigente',
    label: 'Dominio Vigente',
    accept: '.pdf',
  },
  {
    id: 'doc_hipoteca_gravamen',
    documentType: 'hipoteca_gravamen',
    label: 'Certificado Hipoteca y Gravamen',
    accept: '.pdf',
  },
  {
    id: 'doc_roles',
    documentType: 'certificado_roles_sii',
    label: 'Certificado de Roles',
    accept: '.pdf',
  },
  {
    id: 'doc_subdivision',
    documentType: 'certificado_sag',
    label: 'Certificado de Subdivisión',
    accept: '.pdf',
  },
  {
    id: 'doc_plano_oficial',
    documentType: 'plano_oficial',
    label: 'Plano Oficial',
    accept: '.pdf',
  },
  { id: 'doc_otros', documentType: 'otro', label: 'Otros Documentos', accept: '.pdf' },
]

export function ProjectMediaStep({ projectId, onMediaChange }: ProjectMediaStepProps) {
  const [images, setImages] = useState<{ file: File; preview: string }[]>([])
  const [docs, setDocs] = useState<Record<string, { file: File }>>({})
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (images.length + files.length > 10) {
      toast.error('Máximo 10 imágenes permitidas')
      return
    }

    const newImages = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))

    setImages((prev) => [...prev, ...newImages])
  }

  const removeImage = (index: number) => {
    setImages((prev) => {
      const updated = [...prev]
      URL.revokeObjectURL(updated[index].preview)
      updated.splice(index, 1)
      return updated
    })
  }

  const handleDocSelect = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setDocs((prev) => ({ ...prev, [id]: { file } }))
    }
  }

  const uploadFiles = async () => {
    setIsUploading(true)
    const fileIds: string[] = []

    const upload = async (
      file: File,
      category: 'project_image' | 'legal_document',
      document?: { sourceField: string; documentType: string }
    ) => {
      const body = new FormData()
      body.append('file', file)
      if (document) {
        body.append('sourceField', document.sourceField)
        body.append('documentType', document.documentType)
      }
      const response = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: {
          'x-plotify-file-category': category,
          'idempotency-key': crypto.randomUUID(),
        },
        body,
      })
      const result = (await response.json()) as { fileId?: string; code?: string }
      if (!response.ok || !result.fileId) throw new Error(result.code ?? 'FILE_UPLOAD_FAILED')
      fileIds.push(result.fileId)
    }

    try {
      for (const img of images) {
        await upload(img.file, 'project_image')
      }

      for (const [id, doc] of Object.entries(docs)) {
        const definition = DOCUMENT_TYPES.find((item) => item.id === id)
        if (!definition) throw new Error('FILE_CATEGORY_NOT_ALLOWED')
        await upload(doc.file, 'legal_document', {
          sourceField: definition.id,
          documentType: definition.documentType,
        })
      }

      setUploadedFileIds(fileIds)
      onMediaChange({ fileIds })

      toast.success('Archivos preparados con éxito')
    } catch (error) {
      console.error('Error uploading files:', error)
      toast.error('Error al subir archivos')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={ImageAdd01Icon} className="w-5 h-5 text-info" />
            Imágenes del Proyecto (Máx 10)
          </CardTitle>
          <CardDescription>Sube fotos para mostrar el terreno y su entorno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {images.map((img, index) => (
              <div
                key={index}
                className="relative aspect-square rounded-lg overflow-hidden border bg-muted group"
              >
                <img
                  src={img.preview}
                  alt={`preview-${index}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <HugeiconsIcon icon={Trash01Icon} className="w-6 h-6 text-white" />
                </button>
              </div>
            ))}
            {images.length < 10 && (
              <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted transition-colors border-border">
                <HugeiconsIcon
                  icon={ImageAdd01Icon}
                  className="w-8 h-8 text-muted-foreground/60 mb-2"
                />
                <span className="text-xs text-muted-foreground">Agregar foto</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageSelect}
                />
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={FileAttachmentIcon} className="w-5 h-5 text-info" />
            Documentos Legales (PDF)
          </CardTitle>
          <CardDescription>Sube los documentos disponibles. No son obligatorios.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {DOCUMENT_TYPES.map((type) => (
              <div key={type.id} className="space-y-2">
                <Label htmlFor={type.id}>{type.label}</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="file"
                      id={type.id}
                      accept={type.accept}
                      onChange={(e) => handleDocSelect(type.id, e)}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      asChild
                    >
                      <label htmlFor={type.id} className="cursor-pointer">
                        <HugeiconsIcon icon={FileUploadIcon} className="w-4 h-4 mr-2" />
                        {docs[type.id]?.file.name || 'Seleccionar PDF'}
                      </label>
                    </Button>
                  </div>
                  {docs[type.id] && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        const newDocs = { ...docs }
                        delete newDocs[type.id]
                        setDocs(newDocs)
                      }}
                    >
                      <HugeiconsIcon icon={Trash01Icon} className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={uploadFiles}
          disabled={isUploading || (images.length === 0 && Object.keys(docs).length === 0)}
          className="min-w-40"
        >
          {isUploading ? (
            <>
              <Spinner className="w-4 h-4 mr-2" />
              Subiendo...
            </>
          ) : uploadedFileIds.length > 0 ? (
            <>
              <HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 mr-2" />
              Archivos Listos
            </>
          ) : (
            'Preparar archivos'
          )}
        </Button>
      </div>
    </div>
  )
}
