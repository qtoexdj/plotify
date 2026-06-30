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
import { generateDeslindeText } from '@/lib/legal/deslinde-generator'
import {
  generateServidumbreText,
  generateServidumbreTextLegacy,
} from '@/lib/legal/servidumbre-generator'
import { analyzeServidumbreBoundaries } from '@/lib/geometry/servidumbre'
import type { LotWithRecord } from '@/components/projects/detail/types'
import type { ProjectWithMetrics, ServidumbreAnalysis } from '@/types/database.types'
import type { ViewerFeatureCollection } from '@/types/viewer.types'
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

  return (
    <div className="space-y-8">
      <LegalControlCenter projectId={projectId} projectName={project.name} />

      <Card data-testid="legal-text-generator">
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
