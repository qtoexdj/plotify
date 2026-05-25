'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Upload01Icon,
  FileUploadIcon,
  Tick02Icon,
  Alert01Icon,
  Loading02Icon,
  Location01Icon,
} from '@hugeicons/core-free-icons'
import type { ParsedFeature } from '@/types/onboarding.types'

interface GeometryUploadPanelProps {
  projectId: string
  onUploadSuccess: (features: ParsedFeature[], sourceType: 'kmz' | 'kml' | 'dxf' | 'dwg') => void
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

export function GeometryUploadPanel({ projectId, onUploadSuccess }: GeometryUploadPanelProps) {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_fileType, setFileType] = useState<'kmz' | 'kml' | 'dxf' | 'dwg' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [featuresCount, setFeaturesCount] = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)

      // Basic type detection
      if (file.name.toLowerCase().endsWith('.kmz')) setFileType('kmz')
      else if (file.name.toLowerCase().endsWith('.kml')) setFileType('kml')
      else if (process.env.NEXT_PUBLIC_ENABLE_CAD_UPLOAD === 'true') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (file.name.toLowerCase().endsWith('.dxf')) setFileType('dxf' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        else if (file.name.toLowerCase().endsWith('.dwg')) setFileType('dwg' as any)
        else setFileType(null)
      } else setFileType(null)

      setStatus('idle')
      setErrorMessage(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setStatus('uploading')
    setErrorMessage(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s timeout

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('project_id', projectId)

      const response = await fetch('/api/uploads/geometry', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data = await response.json()

      if (!response.ok) {
        const detailMsg =
          typeof data.details === 'string'
            ? data.details
            : Array.isArray(data.details)
              ? data.details.join(', ')
              : JSON.stringify(data.details)

        throw new Error(detailMsg || data.error || 'Error al procesar el archivo')
      }

      setStatus('success')
      setFeaturesCount(data.totalFeatures)
      setSelectedFile(null)
      setFileType(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      onUploadSuccess(data.features, data.sourceType)
    } catch (error) {
      clearTimeout(timeoutId)
      setStatus('error')
      if (error instanceof Error && error.name === 'AbortError') {
        setErrorMessage('La operación tardó demasiado. Intenta con un archivo más pequeño.')
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Error al procesar el archivo')
      }
    }
  }

  const isCadEnabled = process.env.NEXT_PUBLIC_ENABLE_CAD_UPLOAD === 'true'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Location01Icon} className="w-5 h-5 text-blue-600" />
          <CardTitle>Subir Geometría (CAD/GIS)</CardTitle>
        </div>
        <CardDescription>
          Sube un archivo KMZ o KML
          {isCadEnabled ? ' o CAD (DXF y DWG soportados)' : ' (Soporte CAD próximamente en V2.1)'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="file-upload">Seleccionar archivo</Label>
          <Input
            ref={fileInputRef}
            id="file-upload"
            type="file"
            accept={isCadEnabled ? '.kmz,.kml,.dxf,.dwg' : '.kmz,.kml'}
            onChange={handleFileSelect}
            disabled={status === 'uploading'}
          />
        </div>

        {selectedFile && (
          <div className="flex flex-col gap-3 p-3 bg-slate-50 rounded border border-slate-200">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={FileUploadIcon} className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <span className="text-xs text-slate-500">
                ({(selectedFile.size / 1024).toFixed(2)} KB)
              </span>
            </div>
          </div>
        )}

        <Button
          onClick={handleUpload}
          disabled={!selectedFile || status === 'uploading'}
          className="w-full"
        >
          {status === 'uploading' ? (
            <>
              <HugeiconsIcon icon={Loading02Icon} className="w-4 h-4 mr-2 animate-spin" />
              Procesando archivo...
            </>
          ) : (
            <>
              <HugeiconsIcon icon={Upload01Icon} className="w-4 h-4 mr-2" />
              Subir y Procesar
            </>
          )}
        </Button>

        {status === 'success' && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded text-green-700">
            <HugeiconsIcon icon={Tick02Icon} className="w-4 h-4" />
            <span className="text-sm font-medium">
              Archivo parseado correctamente. {featuresCount} geometrías detectadas.
            </span>
          </div>
        )}

        {status === 'error' && errorMessage && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700">
            <HugeiconsIcon icon={Alert01Icon} className="w-4 h-4" />
            <span className="text-sm">{errorMessage}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
