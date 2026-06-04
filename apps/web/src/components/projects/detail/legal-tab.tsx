'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { generateDeslindeText } from '@/lib/legal/deslinde-generator'
import {
  generateServidumbreText,
  generateServidumbreTextLegacy,
} from '@/lib/legal/servidumbre-generator'
import { analyzeServidumbreBoundaries } from '@/lib/geometry/servidumbre'
import type { LotWithRecord } from '@/components/projects/detail/types'
import type { ProjectWithMetrics, ServidumbreAnalysis } from '@/types/database.types'
import type { ViewerFeatureCollection } from '@/types/viewer.types'
import { saveProjectLegalDataAction } from '@/actions/documents.action'
import { toast } from 'sonner'

import { LegalVariable, filterPendingLegalVariables } from '@/lib/legal/variables'
import { LegalControlCenter } from './legal-control-center'

interface LegalTabProps {
  lots: LotWithRecord[]
  projectId: string
  project: ProjectWithMetrics
}

export function LegalTab({ lots, projectId, project }: LegalTabProps) {
  const [selectedLotId, setSelectedLotId] = useState<string>('')
  const [featureCollection, setFeatureCollection] = useState<ViewerFeatureCollection | null>(null)
  const [isLoadingFC, setIsLoadingFC] = useState(false)

  // Estados para project_legal_data (T066)
  const [fojas, setFojas] = useState('')
  const [numero, setNumero] = useState('')
  const [ano, setAno] = useState('')
  const [sagResolucion, setSagResolucion] = useState('')
  const [sagAno, setSagAno] = useState('')
  const [sourceDoc, setSourceDoc] = useState('')
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [isSaving, setIsSaving] = useState(false)

  // ── Fetch de Datos Legales (T066) al montar ──
  useEffect(() => {
    const fetchLegalData = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/legal-data`)
        if (res.ok) {
          const data = await res.json()
          if (data) {
            setFojas(data.dominio_cbr_fojas || '')
            setNumero(data.dominio_cbr_numero || '')
            setAno(data.dominio_cbr_ano || '')
            setSagResolucion(data.sag_resolucion_numero || '')
            setSagAno(data.sag_resolucion_ano || '')
            setSourceDoc(data.source_document || '')
            setReviewStatus(data.review_status || 'pending')
          }
        }
      } catch (err) {
        console.error('Error al cargar datos legales del proyecto:', err)
      }
    }

    fetchLegalData()
  }, [projectId])

  // ── Fetch Feature Collection (geometrías) al montar ──
  useEffect(() => {
    let cancelled = false

    const fetchFC = async () => {
      setIsLoadingFC(true)
      try {
        const res = await fetch(`/api/viewer/${projectId}/feature-collection`)
        if (res.ok && !cancelled) {
          const data: ViewerFeatureCollection = await res.json()
          setFeatureCollection(data)
        }
      } catch (err) {
        console.error('[DEBUG-SERVIDUMBRE] Error al cargar feature collection:', err)
      } finally {
        if (!cancelled) setIsLoadingFC(false)
      }
    }

    fetchFC()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const selectedLot = lots.find((lot) => lot.id === selectedLotId)

  // ── Computar ServidumbreAnalysis para el lote seleccionado ──
  const servidumbreAnalysis = useMemo<ServidumbreAnalysis | null>(() => {
    if (!selectedLot || !featureCollection || !project.road_geometry) return null

    const lotFeature = featureCollection.features.find(
      (f) => f.properties.lot_id === selectedLot.id && f.properties.geometry_type === 'lot'
    )

    if (!lotFeature) {
      console.warn(
        '[DEBUG-SERVIDUMBRE] No se encontró geometría para lote',
        selectedLot.numero_lote
      )
      return null
    }

    const roadWidth = project.road_width_m || 6

    return analyzeServidumbreBoundaries(
      lotFeature.geometry,
      project.road_geometry,
      roadWidth,
      selectedLot.numero_lote,
      featureCollection.features,
      selectedLot.id
    )
  }, [selectedLot, featureCollection, project.road_geometry, project.road_width_m])

  // ── Generador de deslindes ──
  const deslindesText = selectedLot
    ? generateDeslindeText(selectedLot)
    : 'Selecciona un lote para generar los deslindes.'

  // ── Generador de servidumbre ──
  const servidumbreText = useMemo(() => {
    if (!selectedLot) return 'Selecciona un lote para generar la servidumbre.'
    if (isLoadingFC) return 'Preparando geometrías del proyecto...'

    if (servidumbreAnalysis) {
      return generateServidumbreText(servidumbreAnalysis, project.road_width_m || 6)
    }

    return generateServidumbreTextLegacy(selectedLot)
  }, [selectedLot, servidumbreAnalysis, isLoadingFC, project.road_width_m])

  // Mapear variables para visualización y filtrado de T066/T061
  const legalVariables = useMemo<LegalVariable[]>(() => {
    return [
      {
        key: 'dominio_cbr_fojas',
        label: 'Fojas Dominio',
        value: fojas,
        source: 'project_legal_data',
        required: true,
      },
      {
        key: 'dominio_cbr_numero',
        label: 'Número Dominio',
        value: numero,
        source: 'project_legal_data',
        required: true,
      },
      {
        key: 'dominio_cbr_ano',
        label: 'Año Dominio',
        value: ano,
        source: 'project_legal_data',
        required: true,
      },
      {
        key: 'sag_resolucion_numero',
        label: 'Resolución SAG',
        value: sagResolucion,
        source: 'project_legal_data',
        required: true,
      },
    ]
  }, [fojas, numero, ano, sagResolucion])

  const pendingVariables = useMemo(() => {
    return filterPendingLegalVariables(legalVariables)
  }, [legalVariables])

  // ── Guardar datos de revisión legal (T065/T066) ──
  const handleSaveLegalData = async () => {
    setIsSaving(true)
    try {
      const res = await saveProjectLegalDataAction(projectId, {
        dominio_cbr_fojas: fojas,
        dominio_cbr_numero: numero,
        dominio_cbr_ano: ano,
        sag_resolucion_numero: sagResolucion,
        sag_resolucion_ano: sagAno,
        source_document: sourceDoc,
        review_status: reviewStatus,
      })

      if (res.success) {
        toast.success('Datos legales de la escritura guardados exitosamente.')
      } else {
        toast.error(res.error || 'Error al guardar los datos legales.')
      }
    } catch (err) {
      console.error('Error al guardar datos legales:', err)
      toast.error('Error al conectar con el servidor.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <LegalControlCenter projectId={projectId} projectName={project.name} />

      {/* Panel de Revisión de Variables de Escritura (T066) */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Revisión de Variables de Escritura</CardTitle>
            <CardDescription>
              Completa y verifica los datos legales generales del proyecto extraídos de los
              documentos oficiales.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fojas">Fojas CBR</Label>
                <Input
                  id="fojas"
                  placeholder="Ej: 1234"
                  value={fojas}
                  onChange={(e) => setFojas(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">Origen: project_legal_data</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero">Número CBR</Label>
                <Input
                  id="numero"
                  placeholder="Ej: 5678"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">Origen: project_legal_data</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ano">Año CBR</Label>
                <Input
                  id="ano"
                  placeholder="Ej: 2025"
                  value={ano}
                  onChange={(e) => setAno(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">Origen: project_legal_data</span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sag">Número Resolución SAG</Label>
                <Input
                  id="sag"
                  placeholder="Ej: Resolución Nº 890"
                  value={sagResolucion}
                  onChange={(e) => setSagResolucion(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">Origen: project_legal_data</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sag-ano">Año Resolución SAG</Label>
                <Input
                  id="sag-ano"
                  placeholder="Ej: 2024"
                  value={sagAno}
                  onChange={(e) => setSagAno(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">Origen: project_legal_data</span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="source-doc">Documento Fuente</Label>
                <Input
                  id="source-doc"
                  placeholder="Ej: dominio_vigente.pdf"
                  value={sourceDoc}
                  onChange={(e) => setSourceDoc(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status-select">Estado de Revisión</Label>
                <Select
                  value={reviewStatus}
                  onValueChange={(val: 'pending' | 'approved' | 'rejected') => setReviewStatus(val)}
                >
                  <SelectTrigger id="status-select">
                    <SelectValue placeholder="Selecciona estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="approved">Aprobado</SelectItem>
                    <SelectItem value="rejected">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveLegalData} disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar Revisión Legal'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Panel de Variables Requeridas Pendientes (T066 / T061) */}
        <Card>
          <CardHeader>
            <CardTitle>Variables Requeridas</CardTitle>
            <CardDescription>Variables obligatorias pendientes para la escritura.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingVariables.length === 0 ? (
              <p className="text-sm text-green-600 font-medium">
                ✓ ¡Todas las variables requeridas de la escritura están completas!
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-destructive font-semibold">
                  Faltan {pendingVariables.length} variables obligatorias:
                </p>
                <ul className="space-y-1">
                  {pendingVariables.map((v) => (
                    <li
                      key={v.key}
                      className="text-xs text-muted-foreground flex justify-between items-center p-1 bg-muted rounded"
                    >
                      <span>{v.label}</span>
                      <span className="text-[10px] text-destructive-foreground bg-destructive/25 px-1.5 py-0.5 rounded font-mono">
                        Faltante
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generador de Textos Legales</CardTitle>
          <CardDescription>
            Selecciona un lote para generar automáticamente sus textos de deslindes y servidumbre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col space-y-1.5 md:w-1/3">
              <Label htmlFor="lot-select">Lote</Label>
              <Select value={selectedLotId} onValueChange={setSelectedLotId}>
                <SelectTrigger id="lot-select">
                  <SelectValue placeholder="Selecciona un lote" />
                </SelectTrigger>
                <SelectContent>
                  {lots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      Lote {lot.numero_lote}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Creador de Deslindes</CardTitle>
            <CardDescription>Texto base para escritura con deslindes del lote.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea readOnly className="resize-none min-h-75" value={deslindesText} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Creador de Servidumbre</CardTitle>
            <CardDescription>
              {servidumbreAnalysis
                ? `Motor v2 · ${servidumbreAnalysis.isMultiTramo ? `Multi-tramo (${servidumbreAnalysis.tramos.length})` : 'Simple'} · ${servidumbreAnalysis.allEdges.length} aristas`
                : 'Texto base para escritura con servidumbre del lote.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea readOnly className="resize-none min-h-75" value={servidumbreText} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
