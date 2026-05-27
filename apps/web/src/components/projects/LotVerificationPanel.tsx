'use client'

import { useState, useMemo, useCallback, useTransition } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  RulerIcon,
  Shield02Icon,
  Copy01Icon,
  FloppyDiskIcon,
  Loading02Icon,
  Cancel01Icon,
  InformationSquareIcon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { saveOfficialOverride, markLotVerified } from '@/actions/lot-verification.action'
import type { LotDetails } from '@/types/viewer.types'
import type { OfficialBoundaries, VerifiedStatus } from '@/types/database.types'
import type { LegalMetrics } from '@/lib/geometry/utm'
import type { BoundaryWithNeighbor } from '@/lib/geometry/utils'
import { validateLotDocumentReadiness } from '@/lib/legal/readiness'
import { generateDeslindeText } from '@/lib/legal/deslinde-generator'

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  VerifiedStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }
> = {
  draft: {
    label: 'Borrador',
    variant: 'outline',
    className:
      'border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:bg-amber-500/20',
  },
  verified_exact: {
    label: 'Verificado (Coincide)',
    variant: 'default',
    className:
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-700',
  },
  verified_override: {
    label: 'Verificado (Override)',
    variant: 'default',
    className:
      'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-700',
  },
}

/** Maps calculated BoundaryWithNeighbor[] directly to editable OfficialBoundaries format 1:1 */
function boundariesToOfficial(calculated: BoundaryWithNeighbor[]): OfficialBoundaries {
  console.log(
    '[DEBUG-PANEL] Mapeando calculatedBoundaries a Official:',
    JSON.stringify(calculated, null, 2)
  )
  // Mapeo 1:1 estricto con la arista nativa (sin agrupación ni sufijos)
  return calculated.map((seg) => {
    let colindaFinal = ''
    if (seg.neighbors.length === 0) {
      colindaFinal = ''
    } else {
      // Reconstruir string visual para el input "Colinda con"
      colindaFinal =
        seg.neighbors.length === 2
          ? `${seg.neighbors[0].name} y ${seg.neighbors[1].name}`
          : seg.neighbors.length > 2
            ? `${seg.neighbors
                .slice(0, -1)
                .map((n) => n.name)
                .join(', ')} y ${seg.neighbors[seg.neighbors.length - 1].name}`
            : seg.neighbors[0].name
    }

    return {
      label: seg.direction,
      description: `${seg.direction} en ${seg.distance.toFixed(2)} m`,
      distance: parseFloat(seg.distance.toFixed(2)),
      colinda: colindaFinal,
      es_servidumbre: seg.touchesRoad,
      neighbors_metadata: seg.neighbors, // Persistimos metadata estructurada
    }
  })
}

/** Checks if a boundary's 'colinda' description matches keywords for a servitude (servidumbre) */
export const isServidumbreMatch = (colinda?: string) => {
  if (!colinda) return false
  const lower = colinda.toLowerCase()
  // Expanded keywords to catch more cases ("serv" alone catches both servidumbre and serv)
  const keywords = ['servidumbre', 'camino', 'tránsito', 'transito', 'calle', 'pasaje', 'serv']
  return keywords.some((k) => lower.includes(k))
}

// ─── Component ──────────────────────────────────────────────────────────────

interface LotVerificationPanelProps {
  projectId: string
  lotDetails: LotDetails
  legalMetrics: LegalMetrics | null
  calculatedBoundaries?: BoundaryWithNeighbor[]
  onLotUpdated?: () => void
}

export function LotVerificationPanel({
  projectId,
  lotDetails,
  legalMetrics,
  calculatedBoundaries = [],
  onLotUpdated,
}: LotVerificationPanelProps) {
  const [isPending] = useTransition()

  // ─── Form State ─────────────────────────────────────────────────────

  const [areaOfficial, setAreaOfficial] = useState<string>(
    lotDetails.area_official_m2?.toString() ?? ''
  )

  const [perimeterOfficial, setPerimeterOfficial] = useState<string>(
    lotDetails.perimeter_official_m?.toString() ?? ''
  )

  const [servidumbreOfficial, setServidumbreOfficial] = useState<string>(
    lotDetails.servidumbre_m2?.toString() ?? ''
  )

  const [servidumbreAncho, setServidumbreAncho] = useState<string>(
    lotDetails.servidumbre_ancho_m?.toString() ?? ''
  )

  const [boundaries, setBoundaries] = useState<OfficialBoundaries>(() => {
    // 1. Si hay oficiales guardados en DB → prioridad
    if (
      Array.isArray(lotDetails.boundaries_official) &&
      lotDetails.boundaries_official.length > 0
    ) {
      // Enriquecer colinda vacío con datos calculados de vecinos
      if (calculatedBoundaries.length > 0) {
        const calculatedOfficial = boundariesToOfficial(calculatedBoundaries)
        return lotDetails.boundaries_official.map((b) => {
          // Buscar match por label/dirección para obtener metadata fresca
          const match = calculatedOfficial.find((c) => c.label === b.label)

          if (b.colinda && b.colinda.trim() !== '') {
            // Si ya tiene colinda, solo inyectamos metadata si no existe
            return {
              ...b,
              neighbors_metadata: b.neighbors_metadata || match?.neighbors_metadata,
            }
          }

          return match
            ? {
                ...b,
                colinda: match.colinda,
                neighbors_metadata: match.neighbors_metadata,
              }
            : b
        })
      }
      return lotDetails.boundaries_official
    }
    // Migration from old object format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const old = lotDetails.boundaries_official as any
    if (old && typeof old === 'object' && !Array.isArray(old)) {
      return [
        { label: 'Norte', description: old.north || '' },
        { label: 'Sur', description: old.south || '' },
        { label: 'Oriente', description: old.east || '' },
        { label: 'Poniente', description: old.west || '' },
      ]
    }
    // 2. Si hay calculados → pre-poblar
    if (calculatedBoundaries.length > 0) {
      return boundariesToOfficial(calculatedBoundaries)
    }
    // 3. Sin datos
    return []
  })

  const [isSaving, setIsSaving] = useState(false)

  const [deslindeAceptado, setDeslindeAceptado] = useState<boolean>(() => {
    return lotDetails.verified_status !== 'draft'
  })

  // ─── Derived Values ─────────────────────────────────────────────────

  const statusConfig = STATUS_CONFIG[lotDetails.verified_status ?? 'draft']

  /** Calculates the percentage difference between official and calculated */
  const areaDiff = useMemo(() => {
    const calculated = legalMetrics?.area_legal_m2
    const official = parseFloat(areaOfficial)
    if (!calculated || !official || isNaN(official)) return null
    return ((official - calculated) / calculated) * 100
  }, [areaOfficial, legalMetrics])

  /** Calculates the percentage difference between official and calculated perimeter */
  const perimeterDiff = useMemo(() => {
    const calculated = legalMetrics?.perimeter_legal_m
    const official = parseFloat(perimeterOfficial)
    if (!calculated || !official || isNaN(official)) return null
    return ((official - calculated) / calculated) * 100
  }, [perimeterOfficial, legalMetrics])

  /** Servidumbre diff (calculated vs editable) */
  const servidumbreDiff = useMemo(() => {
    const calculated = lotDetails.servidumbre_m2
    const official = parseFloat(servidumbreOfficial)
    if (!calculated || !official || isNaN(official)) return null
    return ((official - calculated) / calculated) * 100
  }, [servidumbreOfficial, lotDetails.servidumbre_m2])

  /** Whether we have all data required to verify */
  const canVerify = useMemo(() => {
    const hasArea = areaOfficial && parseFloat(areaOfficial) > 0
    const hasPerimeter = perimeterOfficial && parseFloat(perimeterOfficial) > 0
    const hasBoundaries =
      boundaries.length > 0 &&
      boundaries.every((b) => b.label.trim() !== '' && (b.distance ?? 0) > 0)
    return hasArea && hasPerimeter && hasBoundaries && deslindeAceptado
  }, [areaOfficial, perimeterOfficial, boundaries, deslindeAceptado])

  const readiness = useMemo(() => {
    return validateLotDocumentReadiness({
      id: lotDetails.id,
      verified_status: lotDetails.verified_status,
      area_official_m2: areaOfficial ? parseFloat(areaOfficial) : null,
      boundaries_official: boundaries,
      perimeter_official_m: perimeterOfficial ? parseFloat(perimeterOfficial) : null,
    })
  }, [lotDetails.id, lotDetails.verified_status, perimeterOfficial, areaOfficial, boundaries])

  const generatedDeslindeText = useMemo(() => {
    return generateDeslindeText({
      numero_lote: lotDetails.numero_lote,
      area_official_m2: areaOfficial ? parseFloat(areaOfficial) : null,
      m2: legalMetrics ? Math.round(legalMetrics.area_legal_m2) : null,
      servidumbre_m2: servidumbreOfficial ? parseFloat(servidumbreOfficial) : null,
      boundaries_official: boundaries.length > 0 ? boundaries : null,
    })
  }, [lotDetails.numero_lote, areaOfficial, legalMetrics, servidumbreOfficial, boundaries])

  // ─── Handlers ───────────────────────────────────────────────────────

  const handleBoundaryFieldChange = useCallback(
    (index: number, field: 'label' | 'distance' | 'colinda', value: string) => {
      setBoundaries((prev) => {
        const next = [...prev]
        if (field === 'distance') {
          const num = parseFloat(value)
          next[index] = {
            ...next[index],
            distance: isNaN(num) ? undefined : num,
            // Keep description in sync for backward compat
            description: `${next[index].label} en ${value} m`,
          }
        } else if (field === 'colinda') {
          next[index] = { ...next[index], colinda: value }
        } else {
          next[index] = {
            ...next[index],
            label: value,
            description: `${value} en ${next[index].distance?.toFixed(2) ?? '0'} m`,
          }
        }
        // Auto-recalcular servidumbre si hay ancho
        const ancho = parseFloat(servidumbreAncho)
        if (!isNaN(ancho) && ancho > 0) {
          const total = next
            .filter((b) => isServidumbreMatch(b.colinda))
            .reduce((sum, b) => sum + (b.distance ?? 0), 0)
          if (total > 0) {
            setServidumbreOfficial((ancho * total).toFixed(2))
          } else {
            // Si borraron el 'camino' de todos lados
            setServidumbreOfficial('0.00')
          }
        }
        return next
      })
    },
    [servidumbreAncho]
  )

  const handleAddBoundary = useCallback(() => {
    setBoundaries((prev) => [...prev, { label: '', description: '', distance: 0, colinda: '' }])
  }, [])

  const handleRemoveBoundary = useCallback((index: number) => {
    setBoundaries((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const result = await saveOfficialOverride({
        projectId,
        lotId: lotDetails.id,
        area_official_m2: areaOfficial ? parseFloat(areaOfficial) : undefined,
        perimeter_official_m: perimeterOfficial ? parseFloat(perimeterOfficial) : undefined,
        servidumbre_m2: servidumbreOfficial ? parseFloat(servidumbreOfficial) : undefined,
        servidumbre_ancho_m: servidumbreAncho ? parseFloat(servidumbreAncho) : undefined,
        boundaries_official: boundaries.length > 0 ? boundaries : undefined,
      })

      if (result.success) {
        toast.success(result.message)
        onLotUpdated?.()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }, [
    projectId,
    lotDetails.id,
    areaOfficial,
    perimeterOfficial,
    servidumbreOfficial,
    servidumbreAncho,
    boundaries,
    onLotUpdated,
  ])

  const handleUseCalculated = useCallback(() => {
    if (!legalMetrics) {
      toast.error('No hay métricas calculadas disponibles')
      return
    }
    setAreaOfficial(legalMetrics.area_legal_m2.toFixed(2))
    setPerimeterOfficial(legalMetrics.perimeter_legal_m.toFixed(2))
    if (lotDetails.servidumbre_m2 != null && lotDetails.servidumbre_m2 > 0) {
      setServidumbreOfficial(lotDetails.servidumbre_m2.toFixed(2))
    }
    toast.info('Valores calculados copiados como oficiales')
  }, [legalMetrics, lotDetails.servidumbre_m2])

  const handleUseCalculatedBoundaries = useCallback(() => {
    if (calculatedBoundaries.length === 0) {
      toast.error('No hay deslindes calculados disponibles')
      return
    }
    setBoundaries(boundariesToOfficial(calculatedBoundaries))
    toast.info('Deslindes calculados copiados como oficiales')
  }, [calculatedBoundaries])

  const handleVerify = useCallback(async () => {
    if (!canVerify) {
      toast.error('Completa todos los datos oficiales antes de verificar')
      return
    }

    const areaNum = parseFloat(areaOfficial)
    const perimeterNum = parseFloat(perimeterOfficial)

    // Determine if exact or override
    const isExact = legalMetrics
      ? Math.abs((areaNum - legalMetrics.area_legal_m2) / legalMetrics.area_legal_m2) < 0.001
      : false

    const verifiedStatus: VerifiedStatus = isExact ? 'verified_exact' : 'verified_override'

    setIsSaving(true)
    console.log('[DEBUG-PANEL] Enviando a markLotVerified:', {
      boundaries_official: boundaries,
      area_official_m2: areaNum,
      perimeter_official_m: perimeterNum,
      verified_status: verifiedStatus,
    })
    try {
      const result = await markLotVerified({
        projectId,
        lotId: lotDetails.id,
        verified_status: verifiedStatus,
        area_official_m2: areaNum,
        perimeter_official_m: perimeterNum,
        boundaries_official: boundaries,
        calculated_snapshot: legalMetrics
          ? {
              area_m2: legalMetrics.area_legal_m2,
              perimeter_m: legalMetrics.perimeter_legal_m,
            }
          : undefined,
      })

      if (result.success) {
        toast.success(result.message)
        onLotUpdated?.()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Error al verificar')
    } finally {
      setIsSaving(false)
    }
  }, [
    canVerify,
    areaOfficial,
    perimeterOfficial,
    boundaries,
    legalMetrics,
    projectId,
    lotDetails.id,
    onLotUpdated,
  ])

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <Card className="border-primary/20 bg-linear-to-br from-primary/2 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <HugeiconsIcon icon={RulerIcon} className="w-4 h-4 text-primary" />
            Verificación Legal
          </CardTitle>
          <Badge
            variant={statusConfig.variant}
            className={`text - [10px] ${statusConfig.className} `}
          >
            {statusConfig.label}
          </Badge>
        </div>
        {lotDetails.verified_at && (
          <p className="text-[10px] text-muted-foreground">
            Verificado el {new Date(lotDetails.verified_at).toLocaleDateString('es-CL')}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Readiness State Alerts */}
        {!readiness.isReady ? (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-800 dark:text-amber-400 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <HugeiconsIcon
                icon={InformationSquareIcon}
                className="w-4 h-4 text-amber-500 shrink-0"
              />
              Lote pendiente de verificación y deslindes
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground dark:text-foreground/75">
              {readiness.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-800 dark:text-emerald-400 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <HugeiconsIcon icon={Shield02Icon} className="w-4 h-4 text-emerald-500 shrink-0" />
              Lote completamente verificado y apto para documentos
            </div>
          </div>
        )}

        {/* ─── Comparison Table ──────────────────────────────────── */}
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_70px_100px_60px] gap-0 bg-muted text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2">
            <span>Concepto</span>
            <span className="text-right">Calc.</span>
            <span className="text-center">Oficial</span>
            <span className="text-right">Diff</span>
          </div>

          {/* Area Row */}
          <div className="grid grid-cols-[1fr_70px_100px_60px] gap-0 items-center px-3 py-2.5 border-t border-border">
            <span className="text-xs font-medium text-foreground/70">Superficie</span>
            <span className="text-[11px] text-muted-foreground text-right font-mono">
              {legalMetrics ? `${legalMetrics.area_legal_m2.toFixed(1)} ` : 'N/A'}
            </span>
            <div className="px-1 relative flex items-center">
              <Input
                type="number"
                step="0.01"
                value={areaOfficial}
                onChange={(e) => setAreaOfficial(e.target.value)}
                placeholder="0.00"
                className="h-7 text-xs text-center pr-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-2 text-[9px] text-muted-foreground pointer-events-none">
                m²
              </span>
            </div>
            <DiffBadge diff={areaDiff} />
          </div>

          {/* Perimeter Row */}
          <div className="grid grid-cols-[1fr_70px_100px_60px] gap-0 items-center px-3 py-2.5 border-t border-border">
            <span className="text-xs font-medium text-foreground/70">Perímetro</span>
            <span className="text-[11px] text-muted-foreground text-right font-mono">
              {legalMetrics ? `${legalMetrics.perimeter_legal_m.toFixed(1)} ` : 'N/A'}
            </span>
            <div className="px-1 relative flex items-center">
              <Input
                type="number"
                step="0.01"
                value={perimeterOfficial}
                onChange={(e) => setPerimeterOfficial(e.target.value)}
                placeholder="0.00"
                className="h-7 text-xs text-center pr-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-2 text-[9px] text-muted-foreground pointer-events-none">
                m
              </span>
            </div>
            <DiffBadge diff={perimeterDiff} />
          </div>

          {/* Servidumbre Row */}
          <div className="grid grid-cols-[1fr_70px_100px_60px] gap-0 items-center px-3 py-2.5 border-t border-border">
            <span className="text-xs font-medium text-foreground/70">Servidumbre</span>
            <span className="text-[11px] text-muted-foreground text-right font-mono">
              {lotDetails.servidumbre_m2 != null && lotDetails.servidumbre_m2 > 0
                ? lotDetails.servidumbre_m2.toFixed(1)
                : '—'}
            </span>
            <div className="px-1 relative flex items-center">
              <Input
                type="number"
                step="0.01"
                value={servidumbreOfficial}
                onChange={(e) => setServidumbreOfficial(e.target.value)}
                placeholder="0.00"
                className="h-7 text-xs text-center pr-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-2 text-[9px] text-muted-foreground pointer-events-none">
                m²
              </span>
            </div>
            <DiffBadge diff={servidumbreDiff} />
          </div>

          {/* Ancho Servidumbre Row */}
          <div className="grid grid-cols-[1fr_70px_100px_60px] gap-0 items-center px-3 py-2.5 border-t border-border">
            <span className="text-xs font-medium text-foreground/70">Ancho Serv.</span>
            <span className="text-[11px] text-muted-foreground text-right font-mono">—</span>
            <div className="px-1 relative flex items-center">
              <Input
                type="number"
                step="0.1"
                value={servidumbreAncho}
                onChange={(e) => {
                  const newAncho = e.target.value
                  setServidumbreAncho(newAncho)
                  // Auto-recalcular servidumbre buscando palabras clave en colinda
                  const ancho = parseFloat(newAncho)
                  if (!isNaN(ancho) && ancho > 0) {
                    const total = boundaries
                      .filter((b) => isServidumbreMatch(b.colinda))
                      .reduce((sum, b) => sum + (b.distance ?? 0), 0)

                    if (total > 0) {
                      setServidumbreOfficial((ancho * total).toFixed(2))
                    } else {
                      setServidumbreOfficial('0.00')
                    }
                  } else {
                    // Si borran el ancho, se puede quedar como está o a 0
                    if (newAncho === '') {
                      setServidumbreOfficial('0.00')
                    }
                  }
                }}
                placeholder="0.0"
                className="h-7 text-xs text-center pr-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-2 text-[9px] text-muted-foreground pointer-events-none">
                m
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground text-right">ancho</span>
          </div>
        </div>

        {/* ─── Copy Calculated Button ───────────────────────────── */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleUseCalculated}
          disabled={!legalMetrics}
          className="w-full text-xs border-dashed"
        >
          <HugeiconsIcon icon={Copy01Icon} className="w-3.5 h-3.5 mr-2" />
          Usar calculado como oficial
        </Button>

        <Separator />

        {/* ─── Boundaries Section ───────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground/70">Deslindes Oficiales</Label>
            <div className="flex gap-1">
              {calculatedBoundaries.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUseCalculatedBoundaries}
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-primary"
                >
                  <HugeiconsIcon icon={Copy01Icon} className="w-3 h-3 mr-1" />
                  Usar calculados
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddBoundary}
                className="h-6 px-2 text-[10px] text-primary hover:text-primary/80"
              >
                + Agregar
              </Button>
            </div>
          </div>

          {/* Column headers */}

          <div className="space-y-2">
            {boundaries.map((boundary, index) => {
              const isRoad = isServidumbreMatch(boundary.colinda)
              return (
                <div
                  key={index}
                  className={`group rounded-lg border p-2.5 transition-colors ${
                    isRoad
                      ? 'bg-amber-50/50 border-amber-200/50 dark:bg-amber-500/10 dark:border-amber-500/20'
                      : 'border-border/50 hover:border-border hover:bg-muted/30'
                  }`}
                >
                  {/* Row 1: Orientación (heading) + Distancia + Remove */}
                  <div className="flex items-center gap-2">
                    {/* Orientación como título con espacio completo */}
                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                      <Input
                        value={boundary.label ?? ''}
                        onChange={(e) => handleBoundaryFieldChange(index, 'label', e.target.value)}
                        placeholder="Ej: Norte"
                        className={`h-7 px-1.5 text-xs font-semibold uppercase tracking-wide bg-transparent transition-colors ${
                          isRoad
                            ? 'border-amber-300 focus-visible:ring-amber-500 dark:border-amber-600'
                            : 'border-transparent hover:border-border focus-visible:ring-primary'
                        }`}
                        title="Editar orientación"
                      />
                      {isRoad && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HugeiconsIcon
                                icon={InformationSquareIcon}
                                className="w-3.5 h-3.5 text-amber-500 shrink-0 cursor-help"
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-[10px] max-w-50">
                              Este deslinde se suma al cálculo de servidumbre porque su colindancia
                              menciona un camino.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>

                    {/* Distancia con sufijo "m" */}
                    <InputGroup
                      className={`w-24 shrink-0 h-7 ${isRoad ? 'border-amber-300 dark:border-amber-600' : ''}`}
                    >
                      <InputGroupInput
                        type="number"
                        step="0.01"
                        value={boundary.distance ?? ''}
                        onChange={(e) =>
                          handleBoundaryFieldChange(index, 'distance', e.target.value)
                        }
                        placeholder="0.00"
                        className="text-xs text-right font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText className="text-[10px]">m</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>

                    {/* Remove */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveBoundary(index)}
                      className="h-7 w-7 shrink-0 text-muted-foreground/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Row 2: Colinda con (full width) */}
                  <div className="mt-1.5">
                    <Input
                      value={boundary.colinda ?? ''}
                      onChange={(e) => handleBoundaryFieldChange(index, 'colinda', e.target.value)}
                      placeholder="Colinda con: Ej. Lote 15 y Camino"
                      className={`h-7 text-[11px] ${
                        isRoad
                          ? 'border-amber-300 focus-visible:ring-amber-500 dark:border-amber-600 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]'
                          : ''
                      }`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Previsualización del Deslinde Legal (T102) */}
        {boundaries.length > 0 && (
          <div className="space-y-1.5 pt-2">
            <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 ml-1">
              Redacción Legal Autogenerada (Escritura)
            </Label>
            <div
              className="text-[10px] text-foreground/80 p-3 rounded-lg bg-muted/40 border border-border leading-relaxed font-mono select-all cursor-help"
              title="Haz doble clic para seleccionar todo el texto"
            >
              {generatedDeslindeText}
            </div>
            <div className="flex items-center gap-2 px-1 pt-1.5">
              <input
                type="checkbox"
                id="accept-deslinde"
                checked={deslindeAceptado}
                onChange={(e) => setDeslindeAceptado(e.target.checked)}
                className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <label
                htmlFor="accept-deslinde"
                className="text-xs text-muted-foreground select-none cursor-pointer"
              >
                Confirmar que la redacción legal de deslindes es correcta y aceptada para
                escrituras.
              </label>
            </div>
          </div>
        )}

        <Separator />

        {/* ─── Action Buttons ───────────────────────────────────── */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || isPending}
            className="flex-1 text-xs"
          >
            {isSaving ? (
              <HugeiconsIcon icon={Loading02Icon} className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <HugeiconsIcon icon={FloppyDiskIcon} className="w-3.5 h-3.5 mr-2" />
            )}
            Guardar
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <Button
                    size="sm"
                    onClick={handleVerify}
                    disabled={!canVerify || isSaving || isPending}
                    className="w-full text-xs bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isSaving ? (
                      <HugeiconsIcon
                        icon={Loading02Icon}
                        className="w-3.5 h-3.5 mr-2 animate-spin"
                      />
                    ) : (
                      <HugeiconsIcon icon={Shield02Icon} className="w-3.5 h-3.5 mr-2" />
                    )}
                    Verificar
                  </Button>
                </span>
              </TooltipTrigger>
              {!canVerify && (
                <TooltipContent side="bottom" className="text-xs max-w-52">
                  <div className="flex gap-1.5 items-start">
                    <HugeiconsIcon
                      icon={RulerIcon}
                      className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5"
                    />
                    <span>Completa superficie y los 4 deslindes para verificar.</span>
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Helper Components ──────────────────────────────────────────────────────

function DiffBadge({ diff }: { diff: number | null }) {
  if (diff === null) {
    return <span className="text-[10px] text-muted-foreground text-right">—</span>
  }

  const absDiff = Math.abs(diff)
  const sign = diff > 0 ? '+' : ''
  const color =
    absDiff < 0.5
      ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/20'
      : absDiff < 2
        ? 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/20'
        : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/20'

  return (
    <span
      className={`text - [10px] font - mono font - semibold text - right px - 1.5 py - 0.5 rounded ${color} `}
    >
      {sign}
      {diff.toFixed(1)}%
    </span>
  )
}
