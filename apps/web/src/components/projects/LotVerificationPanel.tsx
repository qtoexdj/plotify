'use client'

import { useState, useMemo, useCallback, useTransition, useEffect, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  RulerIcon,
  Shield02Icon,
  Copy01Icon,
  FloppyDiskIcon,
  Cancel01Icon,
  InformationSquareIcon,
} from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'
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

import { saveOfficialOverride, saveAndVerifyLot } from '@/actions/lot-verification.action'
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
    className: 'border-warning/30 text-warning bg-warning/10',
  },
  verified_exact: {
    label: 'Verificado (Coincide)',
    variant: 'default',
    className: 'bg-success/15 text-success border-success/30',
  },
  verified_override: {
    label: 'Verificado (Override)',
    variant: 'default',
    className: 'bg-info/15 text-info border-info/30',
  },
}

interface NumericDraftField {
  lotId: string
  sourceValue: number | null
  value: string
}

interface SegmentWidthDrafts {
  lotId: string
  values: Record<string, string>
}

interface ServitudeSegmentWidthRow {
  segmentId: string
  label: string
  widthM: number | null
}

/** Maps calculated BoundaryWithNeighbor[] directly to editable OfficialBoundaries format 1:1 */
function boundariesToOfficial(calculated: BoundaryWithNeighbor[]): OfficialBoundaries {

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

function formatServitudeWidth(width: number) {
  return Number.isInteger(width) ? width.toString() : width.toFixed(1).replace(/\.0$/, '')
}

function isCanonicalRoadSegmentId(segmentId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    segmentId
  )
}

function buildServitudeSegmentWidthRows(lotDetails: LotDetails): ServitudeSegmentWidthRow[] {
  const rows: ServitudeSegmentWidthRow[] = []
  const seenSegmentIds = new Set<string>()

  for (const source of lotDetails.servidumbre_sources ?? []) {
    if (
      !source.segment_id ||
      !isCanonicalRoadSegmentId(source.segment_id) ||
      seenSegmentIds.has(source.segment_id)
    ) {
      continue
    }

    seenSegmentIds.add(source.segment_id)
    rows.push({
      segmentId: source.segment_id,
      label: source.name?.trim() || `Tramo ${rows.length + 1}`,
      widthM: source.width_m,
    })
  }

  return rows
}

function buildSegmentWidthDraftValues(lotDetails: LotDetails) {
  return Object.fromEntries(
    buildServitudeSegmentWidthRows(lotDetails).map((row) => [
      row.segmentId,
      row.widthM != null ? row.widthM.toString() : '',
    ])
  )
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

  const [servidumbreOfficialDraft, setServidumbreOfficialDraft] = useState<NumericDraftField>(
    () => ({
      lotId: lotDetails.id,
      sourceValue: lotDetails.servidumbre_m2,
      value: lotDetails.servidumbre_m2?.toString() ?? '',
    })
  )

  const [servidumbreAnchoDraft, setServidumbreAnchoDraft] = useState<NumericDraftField>(() => ({
    lotId: lotDetails.id,
    sourceValue: lotDetails.servidumbre_ancho_m,
    value: lotDetails.servidumbre_ancho_m?.toString() ?? '',
  }))

  const [segmentWidthDrafts, setSegmentWidthDrafts] = useState<SegmentWidthDrafts>(() => ({
    lotId: lotDetails.id,
    values: buildSegmentWidthDraftValues(lotDetails),
  }))

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

          // es_servidumbre siempre se refresca desde el recálculo geométrico:
          // los boundaries guardados antes de que existiera el flag (o antes
          // de dibujar el camino) lo traen false/undefined para siempre, y
          // ese flag alimenta "servidumbre de por medio" en los deslindes de
          // la escritura. Solo se respeta un true guardado (marcado a mano).
          const esServidumbre = b.es_servidumbre || match?.es_servidumbre || false

          if (b.colinda && b.colinda.trim() !== '') {
            // Si ya tiene colinda, solo inyectamos metadata si no existe
            return {
              ...b,
              es_servidumbre: esServidumbre,
              neighbors_metadata: b.neighbors_metadata || match?.neighbors_metadata,
            }
          }

          return match
            ? {
                ...b,
                colinda: match.colinda,
                es_servidumbre: esServidumbre,
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
  const [isAutoSavingWidth, setIsAutoSavingWidth] = useState(false)
  const widthAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersistedWidthRef = useRef<number | null>(lotDetails.servidumbre_ancho_m ?? null)
  const segmentWidthAutoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const lastPersistedSegmentWidthsRef = useRef<Record<string, number | null>>({})
  const onLotUpdatedRef = useRef(onLotUpdated)

  const [deslindeAceptado, setDeslindeAceptado] = useState<boolean>(() => {
    return lotDetails.verified_status !== 'draft'
  })

  // ─── Derived Values ─────────────────────────────────────────────────

  const statusConfig = STATUS_CONFIG[lotDetails.verified_status ?? 'draft']

  const servidumbreOfficial =
    servidumbreOfficialDraft.lotId === lotDetails.id &&
    servidumbreOfficialDraft.sourceValue === lotDetails.servidumbre_m2
      ? servidumbreOfficialDraft.value
      : (lotDetails.servidumbre_m2?.toString() ?? '')

  const servidumbreAncho =
    servidumbreAnchoDraft.lotId === lotDetails.id &&
    servidumbreAnchoDraft.sourceValue === lotDetails.servidumbre_ancho_m
      ? servidumbreAnchoDraft.value
      : (lotDetails.servidumbre_ancho_m?.toString() ?? '')

  const setServidumbreOfficial = useCallback(
    (value: string) => {
      setServidumbreOfficialDraft({
        lotId: lotDetails.id,
        sourceValue: lotDetails.servidumbre_m2,
        value,
      })
    },
    [lotDetails.id, lotDetails.servidumbre_m2]
  )

  const setServidumbreAncho = useCallback(
    (value: string) => {
      setServidumbreAnchoDraft({
        lotId: lotDetails.id,
        sourceValue: lotDetails.servidumbre_ancho_m,
        value,
      })
    },
    [lotDetails.id, lotDetails.servidumbre_ancho_m]
  )

  const setSegmentWidthDraft = useCallback(
    (segmentId: string, value: string) => {
      setSegmentWidthDrafts((prev) => ({
        lotId: lotDetails.id,
        values: {
          ...(prev.lotId === lotDetails.id
            ? prev.values
            : buildSegmentWidthDraftValues(lotDetails)),
          [segmentId]: value,
        },
      }))
    },
    [lotDetails]
  )

  const servitudeSegmentWidthRows = useMemo(
    () => buildServitudeSegmentWidthRows(lotDetails),
    [lotDetails]
  )

  const getSegmentWidthDraftValue = useCallback(
    (row: ServitudeSegmentWidthRow) => {
      if (segmentWidthDrafts.lotId !== lotDetails.id) {
        return row.widthM != null ? row.widthM.toString() : ''
      }

      return (
        segmentWidthDrafts.values[row.segmentId] ??
        (row.widthM != null ? row.widthM.toString() : '')
      )
    },
    [lotDetails.id, segmentWidthDrafts]
  )

  const calculatedServitudeWidths = useMemo(() => {
    const sourceWidths = servitudeSegmentWidthRows
      .map((row) => row.widthM)
      .filter((width): width is number => typeof width === 'number')
    const widths = [...(lotDetails.servidumbre_widths_m ?? []), ...sourceWidths]
    return Array.from(
      new Set(
        widths.filter((width): width is number => {
          return typeof width === 'number' && Number.isFinite(width) && width > 0
        })
      )
    ).sort((a, b) => a - b)
  }, [lotDetails.servidumbre_widths_m, servitudeSegmentWidthRows])

  const hasMultipleServitudeWidths = calculatedServitudeWidths.length > 1
  const canEditSingleServitudeWidth =
    servitudeSegmentWidthRows.length === 1 && !hasMultipleServitudeWidths

  const servitudeWidthLabel = useMemo(() => {
    if (lotDetails.servidumbre_ancho_label) return lotDetails.servidumbre_ancho_label
    if (calculatedServitudeWidths.length === 0) return null
    return calculatedServitudeWidths.map(formatServitudeWidth).join(' y ')
  }, [calculatedServitudeWidths, lotDetails.servidumbre_ancho_label])

  const getSingleServitudeWidthInput = useCallback(() => {
    if (!canEditSingleServitudeWidth) return undefined
    const width = parseFloat(servidumbreAncho)
    return Number.isFinite(width) && width > 0 ? width : undefined
  }, [canEditSingleServitudeWidth, servidumbreAncho])

  const singleServitudeWidthInput = getSingleServitudeWidthInput()
  const displayedServitudeWidthLabel =
    servitudeWidthLabel ??
    (singleServitudeWidthInput !== undefined
      ? formatServitudeWidth(singleServitudeWidthInput)
      : null)

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

  useEffect(() => {
    onLotUpdatedRef.current = onLotUpdated
  }, [onLotUpdated])

  useEffect(() => {
    lastPersistedWidthRef.current = lotDetails.servidumbre_ancho_m ?? null
  }, [lotDetails.id, lotDetails.servidumbre_ancho_m])

  useEffect(() => {
    const values = Object.fromEntries(
      servitudeSegmentWidthRows.map((row) => [row.segmentId, row.widthM])
    )

    lastPersistedSegmentWidthsRef.current = values
  }, [servitudeSegmentWidthRows])

  useEffect(() => {
    if (!canEditSingleServitudeWidth) return

    const width = getSingleServitudeWidthInput()
    if (width === undefined || lastPersistedWidthRef.current === width) return

    if (widthAutoSaveTimerRef.current) {
      clearTimeout(widthAutoSaveTimerRef.current)
    }

    widthAutoSaveTimerRef.current = setTimeout(async () => {
      setIsAutoSavingWidth(true)
      try {
        const result = await saveOfficialOverride({
          projectId,
          lotId: lotDetails.id,
          servidumbre_ancho_m: width,
        })

        if (result.success) {
          lastPersistedWidthRef.current = width
          onLotUpdatedRef.current?.()
        } else {
          toast.error(result.error ?? 'Error al recalcular servidumbre')
        }
      } catch {
        toast.error('Error al recalcular servidumbre')
      } finally {
        setIsAutoSavingWidth(false)
      }
    }, 700)

    return () => {
      if (widthAutoSaveTimerRef.current) {
        clearTimeout(widthAutoSaveTimerRef.current)
      }
    }
  }, [canEditSingleServitudeWidth, getSingleServitudeWidthInput, lotDetails.id, projectId])

  useEffect(() => {
    if (servitudeSegmentWidthRows.length <= 1) return

    for (const row of servitudeSegmentWidthRows) {
      const width = parseFloat(getSegmentWidthDraftValue(row))
      if (!Number.isFinite(width) || width <= 0) continue

      if (lastPersistedSegmentWidthsRef.current[row.segmentId] === width) continue

      if (segmentWidthAutoSaveTimersRef.current[row.segmentId]) {
        clearTimeout(segmentWidthAutoSaveTimersRef.current[row.segmentId])
      }

      segmentWidthAutoSaveTimersRef.current[row.segmentId] = setTimeout(async () => {
        setIsAutoSavingWidth(true)
        try {
          const result = await saveOfficialOverride({
            projectId,
            lotId: lotDetails.id,
            servidumbre_ancho_m: width,
            servidumbre_road_segment_id: row.segmentId,
          })

          if (result.success) {
            lastPersistedSegmentWidthsRef.current[row.segmentId] = width
            onLotUpdatedRef.current?.()
          } else {
            toast.error(result.error ?? 'Error al recalcular servidumbre')
          }
        } catch {
          toast.error('Error al recalcular servidumbre')
        } finally {
          delete segmentWidthAutoSaveTimersRef.current[row.segmentId]
          setIsAutoSavingWidth(false)
        }
      }, 700)
    }

    return () => {
      for (const timer of Object.values(segmentWidthAutoSaveTimersRef.current)) {
        clearTimeout(timer)
      }
      segmentWidthAutoSaveTimersRef.current = {}
    }
  }, [getSegmentWidthDraftValue, lotDetails.id, projectId, servitudeSegmentWidthRows])

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
        return next
      })
    },
    []
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
  }, [legalMetrics, lotDetails.servidumbre_m2, setServidumbreOfficial])

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
    try {
      const result = await saveAndVerifyLot({
        projectId,
        lotId: lotDetails.id,
        verified_status: verifiedStatus,
        area_official_m2: areaNum,
        perimeter_official_m: perimeterNum,
        servidumbre_m2: servidumbreOfficial ? parseFloat(servidumbreOfficial) : undefined,
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
    servidumbreOfficial,
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
          <Badge variant={statusConfig.variant} className={`text-[10px] ${statusConfig.className}`}>
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
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-xs text-warning space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <HugeiconsIcon
                icon={InformationSquareIcon}
                className="w-4 h-4 text-warning shrink-0"
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
          <div className="rounded-lg bg-success/10 border border-success/20 p-3 text-xs text-success space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <HugeiconsIcon icon={Shield02Icon} className="w-4 h-4 text-success shrink-0" />
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
            <span className="text-[11px] text-muted-foreground text-right font-mono">
              {displayedServitudeWidthLabel ?? '—'}
            </span>
            <div className="px-1 relative flex items-center">
              {!canEditSingleServitudeWidth ? (
                <Input
                  type="text"
                  value={displayedServitudeWidthLabel ?? ''}
                  readOnly
                  disabled
                  className="h-7 text-xs text-center pr-4"
                />
              ) : (
                <Input
                  type="number"
                  step="0.1"
                  value={servidumbreAncho}
                  onChange={(e) => setServidumbreAncho(e.target.value)}
                  placeholder="0.0"
                  className="h-7 text-xs text-center pr-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              )}
              <span className="absolute right-2 text-[9px] text-muted-foreground pointer-events-none">
                m
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground text-right">
              {isAutoSavingWidth
                ? 'calc.'
                : hasMultipleServitudeWidths
                  ? 'tramos'
                  : canEditSingleServitudeWidth
                    ? 'tramo'
                    : 'calc.'}
            </span>
          </div>

          {servitudeSegmentWidthRows.length > 1 && (
            <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Tramos de servidumbre</span>
                <span>{isAutoSavingWidth ? 'recalculando' : 'ajuste fino'}</span>
              </div>
              <div className="space-y-1.5">
                {servitudeSegmentWidthRows.map((row, index) => (
                  <div
                    key={row.segmentId}
                    className="grid grid-cols-[1fr_70px_100px_60px] gap-0 items-center"
                  >
                    <span className="text-[11px] font-medium text-foreground/70 truncate pr-2">
                      {row.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground text-right font-mono">
                      {row.widthM != null ? formatServitudeWidth(row.widthM) : '—'}
                    </span>
                    <div className="px-1 relative flex items-center">
                      <Input
                        type="number"
                        step="0.1"
                        value={getSegmentWidthDraftValue(row)}
                        onChange={(event) =>
                          setSegmentWidthDraft(row.segmentId, event.target.value)
                        }
                        aria-label={`Ancho servidumbre tramo ${index + 1}`}
                        placeholder="0.0"
                        className="h-7 text-xs text-center pr-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="absolute right-2 text-[9px] text-muted-foreground pointer-events-none">
                        m
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground text-right">
                      tramo {index + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                      ? 'bg-warning/10 border-warning/20'
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
                            ? 'border-warning/50 focus-visible:ring-warning'
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
                                className="w-3.5 h-3.5 text-warning shrink-0 cursor-help"
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
                      className={`w-24 shrink-0 h-7 ${isRoad ? 'border-warning/50' : ''}`}
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
                      className="h-7 w-7 shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
                        isRoad ? 'border-warning/50 focus-visible:ring-warning' : ''
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
                className="h-4 w-4 rounded border-border text-success focus:ring-success cursor-pointer"
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
            className="min-h-11 flex-1 text-xs"
            title="Guarda el progreso sin marcar el lote como verificado"
          >
            {isSaving ? (
              <Spinner className="w-3.5 h-3.5 mr-2" />
            ) : (
              <HugeiconsIcon icon={FloppyDiskIcon} className="w-3.5 h-3.5 mr-2" />
            )}
            Guardar borrador
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <Button
                    size="sm"
                    onClick={handleVerify}
                    disabled={!canVerify || isSaving || isPending}
                    className="min-h-11 w-full text-xs bg-success text-success-foreground hover:bg-success/90"
                  >
                    {isSaving ? (
                      <Spinner className="w-3.5 h-3.5 mr-2" />
                    ) : (
                      <HugeiconsIcon icon={Shield02Icon} className="w-3.5 h-3.5 mr-2" />
                    )}
                    Guardar y Verificar
                  </Button>
                </span>
              </TooltipTrigger>
              {!canVerify && (
                <TooltipContent side="bottom" className="text-xs max-w-52">
                  <div className="flex gap-1.5 items-start">
                    <HugeiconsIcon
                      icon={RulerIcon}
                      className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5"
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
      ? 'text-success bg-success/10'
      : absDiff < 2
        ? 'text-warning bg-warning/10'
        : 'text-destructive bg-destructive/10'

  return (
    <span
      className={`text-[10px] font-mono font-semibold text-right px-1.5 py-0.5 rounded ${color}`}
    >
      {sign}
      {diff.toFixed(1)}%
    </span>
  )
}
