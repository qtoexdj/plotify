'use client'

import { useState, useMemo } from 'react'
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
import { generateServidumbreTextFromOfficialBoundaries } from '@/lib/legal/servidumbre-generator'
import type { LotWithRecord } from '@/components/projects/detail/types'
import type { ProjectWithMetrics } from '@/types/database.types'
import { LegalControlCenter } from './legal-control-center'

interface LegalTabProps {
  lots: LotWithRecord[]
  projectId: string
  project: ProjectWithMetrics
}

export function LegalTab({ lots, projectId, project }: LegalTabProps) {
  const [selectedLotId, setSelectedLotId] = useState<string>('')

  const selectedLot = lots.find((lot) => lot.id === selectedLotId)

  // ── Generador de deslindes ──
  const deslindesText = selectedLot
    ? generateDeslindeText(selectedLot)
    : 'Selecciona un lote para generar los deslindes.'

  // ── Generador de servidumbre ──
  const servidumbreText = useMemo(() => {
    if (!selectedLot) return 'Selecciona un lote para generar la servidumbre.'
    return generateServidumbreTextFromOfficialBoundaries(selectedLot)
  }, [selectedLot])

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
              {selectedLot?.servidumbre_ancho_label
                ? `Ancho ${selectedLot.servidumbre_ancho_label} m · ${selectedLot.servidumbre_m2 ?? 0} m²`
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
