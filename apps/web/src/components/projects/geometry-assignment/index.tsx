'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert01Icon,
  Tick02Icon,
  Cancel01Icon,
  Layers01Icon,
  Location01Icon,
  Loading02Icon,
} from '@hugeicons/core-free-icons'
import { combineLineStrings, combinePolygons } from '@/lib/geometry/utils'

import { AssignmentMapPanel } from './AssignmentMapPanel'
import { AssignmentMapLayers } from './AssignmentMapLayers'
import { AssignmentHoverCard } from './AssignmentHoverCard'
import { AssignmentSidePanel } from './AssignmentSidePanel'
import type {
  GeometryAssignmentProps,
  Lot,
  FilterType,
  AssignAsType,
  ParsedFeature,
} from './types'

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Convert ParsedFeature[] → GeoJSON.FeatureCollection, filtering out hidden/assigned */
function buildFeatureCollection(
  parsed: ParsedFeature[],
  hiddenIds: Set<string>,
  assignedIds: Set<string>,
  filterType: FilterType
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: parsed
      .filter((f) => {
        if (assignedIds.has(f.tempId)) return false
        if (hiddenIds.has(f.tempId)) return false
        if (filterType !== 'all' && f.geometryType !== filterType) return false
        return true
      })
      .map((f) => ({
        type: 'Feature' as const,
        geometry: f.geometry as GeoJSON.Geometry,
        properties: {
          ...f.properties,
          tempId: f.tempId,
          geometryType: f.geometryType,
        },
      })),
  }
}

/** Full collection for autofit (no filter, no visibility) */
function buildFullFeatureCollection(
  parsed: ParsedFeature[],
  assignedIds: Set<string>
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: parsed
      .filter((f) => !assignedIds.has(f.tempId))
      .map((f) => ({
        type: 'Feature' as const,
        geometry: f.geometry as GeoJSON.Geometry,
        properties: {
          ...f.properties,
          tempId: f.tempId,
          geometryType: f.geometryType,
        },
      })),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export function GeometryAssignmentPanel({
  projectId,
  parsedFeatures,
  sourceType,
  onFeatureAssigned,
  onAssignmentComplete,
}: GeometryAssignmentProps) {
  // Data state
  const [lots, setLots] = useState<Lot[]>([])
  const [assignedLotIds, setAssignedLotIds] = useState<Set<string>>(new Set())
  const [assignedCount, setAssignedCount] = useState(0)
  const [assignedShapeTempIds, setAssignedShapeTempIds] = useState<Set<string>>(new Set())
  const [assignmentMap, setAssignmentMap] = useState<Record<string, string[]>>({})

  // Selection state
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null)
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set())
  const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null)

  // UI state
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAssigning, setIsAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [assignAsType, setAssignAsType] = useState<AssignAsType>('lot')
  const [infraName, setInfraName] = useState('')
  const [hiddenShapeIds, setHiddenShapeIds] = useState<Set<string>>(new Set())

  // ─── Load lots + existing geometries ──────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const [lotsRes, geometriesRes] = await Promise.all([
          fetch(`/api/onboarding/${projectId}/lots`),
          fetch(`/api/onboarding/${projectId}/geometries`),
        ])

        const lotsData = await lotsRes.json()
        const geometriesData = await geometriesRes.json()

        const sortedLots = [...lotsData.lots].sort((a: Lot, b: Lot) => {
          const numA = parseInt(a.numero_lote.match(/\d+/)?.[0] || '0')
          const numB = parseInt(b.numero_lote.match(/\d+/)?.[0] || '0')
          return numA - numB
        })

        setLots(sortedLots)

        const assignedIds = new Set<string>()
        const activeGeometries = geometriesData?.geometries || []
        activeGeometries.forEach(
          (g: { geometry_type: string; lot_id?: string }) => {
            if (g.geometry_type === 'lot' && g.lot_id) {
              assignedIds.add(g.lot_id)
            }
          }
        )

        setAssignedLotIds(assignedIds)
        setAssignedCount(assignedIds.size)
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Error al cargar datos')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [projectId])

  // ─── GeoJSON collections ──────────────────────────────────────────────
  const fullFC = useMemo(
    () => buildFullFeatureCollection(parsedFeatures, assignedShapeTempIds),
    [parsedFeatures, assignedShapeTempIds]
  )

  const visibleFC = useMemo(
    () => buildFeatureCollection(parsedFeatures, hiddenShapeIds, assignedShapeTempIds, filterType),
    [parsedFeatures, hiddenShapeIds, assignedShapeTempIds, filterType]
  )

  // Features as flat items for the side panel
  const featureItems = useMemo(
    () =>
      parsedFeatures.map((f) => ({
        tempId: f.tempId,
        geometryType: f.geometryType,
        properties: f.properties as Record<string, unknown>,
      })),
    [parsedFeatures]
  )

  // ─── Click handler ────────────────────────────────────────────────────
  const handleFeatureClick = useCallback(
    (featureId: string, isMulti: boolean) => {
      const feature = parsedFeatures.find((f) => f.tempId === featureId)

      if ((multiSelectMode || isMulti) && feature && feature.geometryType !== 'lot') {
        setSelectedShapeIds((prev) => {
          const next = new Set(prev)
          if (next.has(featureId)) next.delete(featureId)
          else next.add(featureId)
          return next
        })
      } else {
        setSelectedShapeIds(new Set([featureId]))
      }
      setError(null)
      setSuccessMessage(null)
    },
    [parsedFeatures, multiSelectMode]
  )

  // Sidebar click (no multi info)
  const handleSidebarFeatureClick = useCallback(
    (featureId: string) => {
      handleFeatureClick(featureId, false)
    },
    [handleFeatureClick]
  )

  // ─── Assign to lot ────────────────────────────────────────────────────
  const handleAssignToLot = useCallback(async () => {
    if (!selectedLotId || selectedShapeIds.size === 0) return

    const selectedId = selectedShapeIds.values().next().value as string
    const selectedFeature = parsedFeatures.find((f) => f.tempId === selectedId)
    if (!selectedFeature) return

    setIsAssigning(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/onboarding/save-and-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          lotId: selectedLotId,
          geometry: selectedFeature.geometry,
          properties: selectedFeature.properties,
          sourceType,
          geometryType: 'lot',
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error al asignar geometría')

      setSuccessMessage('Geometría asignada correctamente')
      setAssignedCount((prev) => prev + 1)
      setAssignedLotIds((prev) => new Set([...prev, selectedLotId]))
      setAssignedShapeTempIds((prev) => new Set([...prev, selectedId]))
      setAssignmentMap((prev) => ({ ...prev, [selectedLotId]: [selectedId] }))

      onFeatureAssigned(selectedId)
      onAssignmentComplete()

      setSelectedShapeIds(new Set())
      setSelectedLotId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar geometría')
    } finally {
      setIsAssigning(false)
    }
  }, [selectedLotId, selectedShapeIds, parsedFeatures, projectId, sourceType, onFeatureAssigned, onAssignmentComplete])

  // ─── Save infrastructure ──────────────────────────────────────────────
  const handleSaveInfrastructure = useCallback(async () => {
    const selectedFeatures = parsedFeatures.filter((f) => selectedShapeIds.has(f.tempId))
    if (selectedFeatures.length === 0) {
      setError('Selecciona al menos un elemento')
      return
    }

    const geometryType = assignAsType as 'road' | 'common_area'
    setIsAssigning(true)
    setError(null)
    setSuccessMessage(null)

    try {
      let combinedGeometry: ParsedFeature['geometry']
      if (selectedFeatures.length === 1) {
        combinedGeometry = selectedFeatures[0].geometry
      } else {
        combinedGeometry =
          geometryType === 'road'
            ? combineLineStrings(selectedFeatures.map((s) => s.geometry))
            : combinePolygons(selectedFeatures.map((s) => s.geometry))
      }

      const response = await fetch('/api/onboarding/save-infrastructure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          geometry: combinedGeometry,
          properties: selectedFeatures[0].properties,
          sourceType,
          geometryType,
          name: infraName || `${geometryType}-${Date.now()}`,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error al guardar infraestructura')

      const typeLabel = geometryType === 'road' ? 'Camino' : 'Área común'
      setSuccessMessage(`${typeLabel} guardado correctamente`)
      setAssignedCount((prev) => prev + selectedFeatures.length)

      const tempIds = selectedFeatures.map((s) => s.tempId)
      setAssignedShapeTempIds((prev) => new Set([...prev, ...tempIds]))
      setAssignmentMap((prev) => ({
        ...prev,
        [infraName || `${geometryType}-${Date.now()}`]: tempIds,
      }))

      selectedFeatures.forEach((f) => onFeatureAssigned(f.tempId))
      onAssignmentComplete()

      setSelectedShapeIds(new Set())
      setInfraName('')
      setMultiSelectMode(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar infraestructura')
    } finally {
      setIsAssigning(false)
    }
  }, [selectedShapeIds, parsedFeatures, assignAsType, projectId, sourceType, infraName, onFeatureAssigned, onAssignmentComplete])

  // ─── Unassign lot ─────────────────────────────────────────────────────
  const handleUnassignLot = useCallback(
    async (lotId: string) => {
      setIsAssigning(true)
      setError(null)
      setSuccessMessage(null)

      try {
        const response = await fetch(
          `/api/onboarding/unassign-geometry?projectId=${projectId}&lotId=${lotId}`,
          { method: 'DELETE' }
        )
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Error al revertir asignación')

        setSuccessMessage(
          `Asignación revertida correctamente (Lote ${lots.find((l) => l.id === lotId)?.numero_lote || ''})`
        )
        setAssignedCount((prev) => Math.max(0, prev - 1))
        setAssignedLotIds((prev) => {
          const next = new Set(prev)
          next.delete(lotId)
          return next
        })

        const recoveredTempIds = assignmentMap[lotId] || []
        setAssignedShapeTempIds((prev) => {
          const next = new Set(prev)
          recoveredTempIds.forEach((id) => next.delete(id))
          return next
        })

        if (lotId === selectedLotId) setSelectedLotId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al revertir la asignación')
      } finally {
        setIsAssigning(false)
      }
    },
    [projectId, lots, assignmentMap, selectedLotId]
  )

  // ─── Visibility handlers ──────────────────────────────────────────────
  const toggleShapeVisibility = useCallback((tempId: string) => {
    setHiddenShapeIds((prev) => {
      const next = new Set(prev)
      if (next.has(tempId)) next.delete(tempId)
      else next.add(tempId)
      return next
    })
  }, [])

  const toggleTypeVisibility = useCallback(
    (type: FilterType, show: boolean) => {
      const ofType = parsedFeatures.filter(
        (s) => type === 'all' || s.geometryType === type
      )
      setHiddenShapeIds((prev) => {
        const next = new Set(prev)
        ofType.forEach((s) => {
          if (show) next.delete(s.tempId)
          else next.add(s.tempId)
        })
        return next
      })
    },
    [parsedFeatures]
  )

  const showAll = useCallback(() => setHiddenShapeIds(new Set()), [])

  // ─── Counts for filter pills ──────────────────────────────────────────
  const { lotCount, roadCount, commonAreaCount } = useMemo(() => {
    let l = 0,
      r = 0,
      a = 0
    parsedFeatures.forEach((f) => {
      if (assignedShapeTempIds.has(f.tempId)) return
      if (f.geometryType === 'lot') l++
      else if (f.geometryType === 'road') r++
      else if (f.geometryType === 'common_area') a++
    })
    return { lotCount: l, roadCount: r, commonAreaCount: a }
  }, [parsedFeatures, assignedShapeTempIds])

  // ─── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-150 bg-muted/50 rounded-xl border border-border">
        <div className="flex flex-col items-center gap-3">
          <HugeiconsIcon icon={Loading02Icon} className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando datos del proyecto...</p>
        </div>
      </div>
    )
  }

  // ─── Empty ────────────────────────────────────────────────────────────
  if (parsedFeatures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-150 bg-muted/50 rounded-xl border-2 border-dashed border-border">
        <HugeiconsIcon icon={Layers01Icon} className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No hay geometrías</h3>
        <p className="text-muted-foreground text-center max-w-md">
          Sube un archivo KMZ/KML en el paso anterior para visualizar y asignar las geometrías.
        </p>
      </div>
    )
  }

  // ─── Main layout ──────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-220px)] min-h-125 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {/* Map area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Location01Icon} className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm text-foreground">Mapa de Geometrías</span>
            </div>
            <div className="flex items-center gap-1">
              {([
                { key: 'all' as const, label: 'Todos', count: parsedFeatures.length - assignedShapeTempIds.size, active: 'bg-foreground text-background' },
                { key: 'lot' as const, label: 'Lotes', count: lotCount, active: 'bg-emerald-500 text-white' },
                { key: 'road' as const, label: 'Caminos', count: roadCount, active: 'bg-amber-500 text-white' },
                { key: 'common_area' as const, label: 'Áreas', count: commonAreaCount, active: 'bg-violet-500 text-white' },
              ] as const).map((pill) => (
                <button
                  key={pill.key}
                  onClick={() => setFilterType(pill.key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    filterType === pill.key
                      ? pill.active
                      : 'bg-card text-muted-foreground hover:bg-muted border border-border'
                  }`}
                >
                  {pill.label} ({pill.count})
                </button>
              ))}
            </div>
            <Badge variant="secondary" className="text-xs">
              {assignedCount} asignados
            </Badge>
          </div>

          {/* Alerts */}
          {(error || successMessage) && (
            <div className="px-4 py-2 border-b border-border">
              {error && (
                <div className="flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                  <HugeiconsIcon icon={Alert01Icon} className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button onClick={() => setError(null)} className="hover:bg-destructive/20 rounded p-0.5">
                    <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" />
                  </button>
                </div>
              )}
              {successMessage && (
                <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400">
                  <HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{successMessage}</span>
                  <button onClick={() => setSuccessMessage(null)} className="hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded p-0.5">
                    <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Map */}
          <div className="flex-1 relative">
            <AssignmentMapPanel featureCollection={fullFC} className="w-full h-full">
              <AssignmentMapLayers
                featureCollection={visibleFC}
                selectedIds={selectedShapeIds}
                hoveredFeatureId={hoveredFeatureId}
                onFeatureClick={handleFeatureClick}
                onFeatureHover={setHoveredFeatureId}
              />
              <AssignmentHoverCard featureId={hoveredFeatureId} featureCollection={visibleFC} />
            </AssignmentMapPanel>

            {/* Legend */}
            <div className="absolute top-4 right-4 bg-card/90 backdrop-blur-sm rounded-lg shadow-sm border border-border p-2">
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-emerald-200 border border-emerald-400" />
                  <span className="text-muted-foreground">Lotes</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-amber-500" />
                  <span className="text-muted-foreground">Caminos</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-violet-200 border border-violet-400" />
                  <span className="text-muted-foreground">Áreas</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <AssignmentSidePanel
          lots={lots}
          features={featureItems}
          assignedLotIds={assignedLotIds}
          assignedShapeTempIds={assignedShapeTempIds}
          selectedIds={selectedShapeIds}
          selectedLotId={selectedLotId}
          filterType={filterType}
          assignAsType={assignAsType}
          infraName={infraName}
          isAssigning={isAssigning}
          multiSelectMode={multiSelectMode}
          hiddenShapeIds={hiddenShapeIds}
          assignedCount={assignedCount}
          totalCount={parsedFeatures.length}
          onFilterTypeChange={setFilterType}
          onAssignAsTypeChange={setAssignAsType}
          onInfraNameChange={setInfraName}
          onSelectedLotIdChange={setSelectedLotId}
          onMultiSelectModeChange={setMultiSelectMode}
          onAssignToLot={handleAssignToLot}
          onSaveInfrastructure={handleSaveInfrastructure}
          onUnassignLot={handleUnassignLot}
          onFeatureClick={handleSidebarFeatureClick}
          onToggleVisibility={toggleShapeVisibility}
          onToggleTypeVisibility={toggleTypeVisibility}
          onShowAll={showAll}
        />
      </div>
    </TooltipProvider>
  )
}

