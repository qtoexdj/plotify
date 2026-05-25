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
  Loading02Icon,
  FileAttachmentIcon,
} from '@hugeicons/core-free-icons'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface ProjectMediaStepProps {
  onMediaChange: (media: {
    images: string[]
    doc_dominio_vigente?: string
    doc_hipoteca_gravamen?: string
    doc_roles?: string
    doc_subdivision?: string
    doc_plano_oficial?: string
    doc_otros?: string
  }) => void
}

const DOCUMENT_TYPES = [
  { id: 'doc_dominio_vigente', label: 'Dominio Vigente', accept: '.pdf' },
  { id: 'doc_hipoteca_gravamen', label: 'Certificado Hipoteca y Gravamen', accept: '.pdf' },
  { id: 'doc_roles', label: 'Certificado de Roles', accept: '.pdf' },
  { id: 'doc_subdivision', label: 'Certificado de Subdivisión', accept: '.pdf' },
  { id: 'doc_plano_oficial', label: 'Plano Oficial', accept: '.pdf' },
  { id: 'doc_otros', label: 'Otros Documentos', accept: '.pdf' },
]

export function ProjectMediaStep({ onMediaChange }: ProjectMediaStepProps) {
  const [images, setImages] = useState<{ file: File; preview: string; path?: string }[]>([])
  const [docs, setDocs] = useState<Record<string, { file: File; path?: string }>>({})
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedPaths, setUploadedPaths] = useState<{
    images: string[]
    docs: Record<string, string>
  }>({ images: [], docs: {} })

  const supabase = createClient()

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
    const newUploadedImages: string[] = []
    const newUploadedDocs: Record<string, string> = {}

    try {
      // Upload Images
      for (const img of images) {
        const fileExt = img.file.name.split('.').pop()
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `temp/images/${fileName}`

        const { data, error } = await supabase.storage
          .from('project-files')
          .upload(filePath, img.file)

        if (error) throw error
        newUploadedImages.push(data.path)
      }

      // Upload Docs
      for (const [id, doc] of Object.entries(docs)) {
        const fileExt = doc.file.name.split('.').pop()
        const fileName = `${id}-${Math.random().toString(36).substring(2)}.${fileExt}`
        const filePath = `temp/docs/${fileName}`

        const { data, error } = await supabase.storage
          .from('project-files')
          .upload(filePath, doc.file)

        if (error) throw error
        newUploadedDocs[id] = data.path
      }

      setUploadedPaths({ images: newUploadedImages, docs: newUploadedDocs })

      onMediaChange({
        images: newUploadedImages,
        doc_dominio_vigente: newUploadedDocs['doc_dominio_vigente'],
        doc_hipoteca_gravamen: newUploadedDocs['doc_hipoteca_gravamen'],
        doc_roles: newUploadedDocs['doc_roles'],
        doc_subdivision: newUploadedDocs['doc_subdivision'],
        doc_plano_oficial: newUploadedDocs['doc_plano_oficial'],
        doc_otros: newUploadedDocs['doc_otros'] || undefined,
      })

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
            <HugeiconsIcon icon={ImageAdd01Icon} className="w-5 h-5 text-blue-600" />
            Imágenes del Proyecto (Máx 10)
          </CardTitle>
          <CardDescription>Sube fotos para mostrar el terreno y su entorno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {images.map((img, index) => (
              <div
                key={index}
                className="relative aspect-square rounded-lg overflow-hidden border bg-slate-100 group"
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
              <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors border-slate-200 dark:border-slate-800">
                <HugeiconsIcon icon={ImageAdd01Icon} className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-xs text-slate-500">Agregar foto</span>
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
            <HugeiconsIcon icon={FileAttachmentIcon} className="w-5 h-5 text-blue-600" />
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
                      className="text-red-500"
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
              <HugeiconsIcon icon={Loading02Icon} className="w-4 h-4 mr-2 animate-spin" />
              Subiendo...
            </>
          ) : uploadedPaths.images.length > 0 || Object.keys(uploadedPaths.docs).length > 0 ? (
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
