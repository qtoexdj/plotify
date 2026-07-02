'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Layers01Icon,
  Alert01Icon,
  Location01Icon,
  Loading02Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons'
import { createClient } from '@/lib/supabase/client'
import { ItemDetailPanel } from './ItemDetailPanel'
import { BulkActionsPanel } from '@/components/projects/viewer/BulkActionsPanel'
import { MapPanel } from './MapPanel'
import { MapLotLayers } from './MapLotLayers'
import { LotHoverCard } from './LotHoverCard'
import { MapExportButton } from './MapExportButton'
import { useIsMobile } from '@/hooks/use-mobile'

import type { ViewerFeatureCollection, LotDetails } from '@/types/viewer.types'
import type { LotUpdateInput } from '@/lib/validations/lot-update.schema'
import { cn } from '@/lib/utils'

interface GeometryViewerProps {
  projectId: string
  refreshKey?: number
  projectName?: string
  isAdmin?: boolean
}

export function GeometryViewer({
  projectId,
  refreshKey = 0,
  projectName,
  isAdmin = false,
}: GeometryViewerProps) {
  const isMobile = useIsMobile()

  // ─────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────

  // Data
  const [featureCollection, setFeatureCollection] = useState<ViewerFeatureCollection | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const selectedFeatureId = useMemo(() => {
    return selectedIds.size === 1 ? Array.from(selectedIds)[0] : null
  }, [selectedIds])

  const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null)

  // Lot details
  const [lotDetails, setLotDetails] = useState<LotDetails | null>(null)
  const [isLoadingLot, setIsLoadingLot] = useState(false)

  // UI
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false)

  // ─────────────────────────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadFeatures = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/viewer/${projectId}/feature-collection`)
        if (!response.ok) throw new Error('Error al cargar geometrías')
        const data = await response.json()
        setFeatureCollection(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setIsLoading(false)
      }
    }
    loadFeatures()
  }, [projectId, refreshKey])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('lots-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lots',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (!payload.new || !payload.new.id) return

          setFeatureCollection((prev) => {
            if (!prev) return null
            return {
              ...prev,
              features: prev.features.map((f) => {
                if (f.properties.lot_id === payload.new.id) {
                  return {
                    ...f,
                    properties: {
                      ...f.properties,
                      estado: payload.new.estado,
                      precio: payload.new.precio,
                      m2: payload.new.m2,
                    },
                  }
                }
                return f
              }),
            }
          })

          if (lotDetails && lotDetails.id === payload.new.id) {
            setLotDetails((prev) => (prev ? { ...prev, ...payload.new } : null))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, lotDetails])

  const loadLotDetails = useCallback(async () => {
    if (!selectedFeatureId || !featureCollection) {
      setLotDetails(null)
      return
    }

    const feature = featureCollection.features.find(
      (f) => f.properties.geometry_id === selectedFeatureId
    )

    if (!feature?.properties.lot_id) {
      setLotDetails(null)
      return
    }

    setIsLoadingLot(true)
    try {
      const response = await fetch(`/api/onboarding/lot/${feature.properties.lot_id}`)
      if (response.ok) {
        const data = await response.json()
        setLotDetails(data.lot)
      }
    } catch (err) {
      console.error('Error loading lot details:', err)
    } finally {
      setIsLoadingLot(false)
    }
  }, [selectedFeatureId, featureCollection])

  // Silent re-fetch: updates lotDetails without showing loading spinner
  const refreshLotDetails = useCallback(async () => {
    if (!selectedFeatureId || !featureCollection) return

    const feature = featureCollection.features.find(
      (f) => f.properties.geometry_id === selectedFeatureId
    )
    if (!feature?.properties.lot_id) return

    try {
      const response = await fetch(`/api/onboarding/lot/${feature.properties.lot_id}`)
      if (response.ok) {
        const data = await response.json()
        setLotDetails(data.lot)
      }
    } catch (err) {
      console.error('Error refreshing lot details:', err)
    }
  }, [selectedFeatureId, featureCollection])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadLotDetails()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadLotDetails])

  // ─────────────────────────────────────────────────────────────────────────
  // Computed Values
  // ─────────────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!featureCollection)
      return { lots: 0, roads: 0, areas: 0, disponibles: 0, reservados: 0, vendidos: 0 }
    const counts = { lots: 0, roads: 0, areas: 0, disponibles: 0, reservados: 0, vendidos: 0 }

    featureCollection.features.forEach((f) => {
      const type = f.properties.geometry_type
      const estado = f.properties.estado
      if (type === 'lot') counts.lots++
      else if (type === 'road') counts.roads++
      else if (type === 'common_area') counts.areas++
      if (estado === 'disponible') counts.disponibles++
      else if (estado === 'reservado') counts.reservados++
      else if (estado === 'vendido') counts.vendidos++
    })
    return counts
  }, [featureCollection])

  const selectedFeature = useMemo(() => {
    if (!selectedFeatureId || !featureCollection) return null
    return featureCollection.features.find((f) => f.properties.geometry_id === selectedFeatureId)
  }, [selectedFeatureId, featureCollection])

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleFeatureClick = useCallback(
    (featureId: string, isMultiSelect: boolean) => {
      if (isMultiSelect) {
        setSelectedIds((prev) => {
          const newSet = new Set(prev)
          if (newSet.has(featureId)) {
            newSet.delete(featureId)
          } else {
            newSet.add(featureId)
          }
          if (newSet.size > 0 && isPanelCollapsed) setIsPanelCollapsed(false)
          if (newSet.size > 0 && isMobile) setIsMobileSheetOpen(true)
          return newSet
        })
      } else {
        setSelectedIds(new Set([featureId]))
        setIsPanelCollapsed(false)
        if (isMobile) setIsMobileSheetOpen(true)
      }
    },
    [isPanelCollapsed, isMobile]
  )

  const handleFeatureHover = useCallback((featureId: string | null) => {
    setHoveredFeatureId(featureId)
  }, [])

  const handleClearSelection = () => {
    setSelectedIds(new Set())
    setIsPanelCollapsed(true)
    setIsMobileSheetOpen(false)
  }

  const handleUpdateLot = async (lotId: string, data: LotUpdateInput) => {
    try {
      const response = await fetch(`/api/onboarding/lot/${lotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (response.ok) {
        const responseData = await response.json()
        setLotDetails(responseData.lot)
        const featuresRes = await fetch(`/api/viewer/${projectId}/feature-collection`)
        if (featuresRes.ok) {
          setFeatureCollection(await featuresRes.json())
        }
        return true
      }
      return false
    } catch (err) {
      console.error('Error saving:', err)
      return false
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBulkUpdate = async (ids: string[], data: Partial<any>) => {
    if (!featureCollection) return

    const lotIdsToUpdate: string[] = []
    ids.forEach((geoId) => {
      const feature = featureCollection.features.find((f) => f.properties.geometry_id === geoId)
      if (feature?.properties.lot_id) {
        lotIdsToUpdate.push(feature.properties.lot_id)
      }
    })

    if (lotIdsToUpdate.length === 0) return

    await Promise.all(
      lotIdsToUpdate.map((lotId) =>
        fetch(`/api/onboarding/lot/${lotId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      )
    )

    const featuresRes = await fetch(`/api/viewer/${projectId}/feature-collection`)
    if (featuresRes.ok) {
      setFeatureCollection(await featuresRes.json())
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-160px)] md:h-[calc(100vh-220px)] min-h-96 bg-muted/50 rounded-xl border border-border">
        <div className="flex flex-col items-center gap-3">
          <HugeiconsIcon icon={Loading02Icon} className="w-8 h-8 animate-spin text-primary" />
          <div className="h-3 w-32 rounded bg-muted animate-pulse" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100dvh-160px)] md:h-[calc(100vh-220px)] min-h-96 bg-destructive/10 rounded-xl border border-destructive/30">
        <HugeiconsIcon icon={Alert01Icon} className="w-12 h-12 text-destructive mb-3" />
        <h3 className="text-lg font-semibold text-destructive mb-1">Error al cargar</h3>
        <p className="text-destructive/80 text-sm">{error}</p>
      </div>
    )
  }

  if (!featureCollection || featureCollection.features.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100dvh-160px)] md:h-[calc(100vh-220px)] min-h-96 bg-muted/50 rounded-xl border-2 border-dashed border-border px-6 text-center">
        <HugeiconsIcon icon={Layers01Icon} className="w-16 h-16 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No hay geometrías</h3>
        <p className="text-muted-foreground max-w-md">
          Importa un archivo KMZ/KML y asigna las geometrías para visualizarlas aquí.
        </p>
      </div>
    )
  }

  const renderSidebarContent = () => {
    if (isLoadingLot && selectedIds.size === 1) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <HugeiconsIcon icon={Loading02Icon} className="w-8 h-8 text-primary animate-spin mb-3" />
          <div className="h-3 w-24 rounded bg-sidebar-accent animate-pulse" />
        </div>
      )
    }

    if (selectedIds.size === 1 && selectedFeature) {
      return (
        <ItemDetailPanel
          projectId={projectId}
          selectedFeature={selectedFeature}
          lotDetails={lotDetails}
          allFeatures={featureCollection?.features ?? []}
          onClose={() => {
            setIsPanelCollapsed(true)
            setIsMobileSheetOpen(false)
          }}
          onUpdateLot={handleUpdateLot}
          onLotUpdated={refreshLotDetails}
          isAdmin={isAdmin}
        />
      )
    }

    if (selectedIds.size > 1) {
      return (
        <BulkActionsPanel
          selectedIds={Array.from(selectedIds)}
          allFeatures={featureCollection?.features ?? []}
          onClearSelection={handleClearSelection}
          onRemoveFromSelection={(id) => {
            setSelectedIds((prev) => {
              const newSet = new Set(prev)
              newSet.delete(id)
              return newSet
            })
          }}
          onUpdateState={async (ids, newState) => {
            await handleBulkUpdate(ids, { estado: newState })
          }}
          onUpdatePrice={async (ids, newPrice) => {
            await handleBulkUpdate(ids, { precio: newPrice })
          }}
        />
      )
    }

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <HugeiconsIcon icon={Location01Icon} className="w-7 h-7 text-primary/60" />
        </div>
        <p className="text-sm font-semibold text-foreground">Selecciona un lote</p>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Haz clic en cualquier lote del mapa para ver su información detallada.
        </p>
      </div>
    )
  }

  // ─── TOP BAR ────────────────────────────────────────────────────────────

  const topBar = (
    <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-muted/50 border-b border-border z-10 relative flex-wrap gap-y-1.5">
      {/* Left: Title + Legend */}
      <div className="flex items-center gap-2 md:gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Location01Icon} className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-sm text-foreground">Visor de Lotes</span>
        </div>

        {/* Legend: hidden on very small screens */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-card rounded-md border border-border">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Leyenda:
          </span>
          <div className="flex items-center gap-1">
            {['Disponible', 'Reservado', 'Vendido'].map((status) => (
              <Tooltip key={status}>
                <TooltipTrigger asChild>
                  <div
                    className={`w-2.5 h-2.5 rounded-sm border cursor-help ${
                      status === 'Disponible'
                        ? 'bg-emerald-500 border-emerald-600'
                        : status === 'Reservado'
                          ? 'bg-amber-500 border-amber-600'
                          : 'bg-red-500 border-red-600'
                    }`}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{status}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Stats badges */}
      <div className="flex items-center gap-1 flex-wrap">
        <Badge className="bg-success/10 text-success border-success/25 dark:bg-success/15 dark:border-success/30 text-xs">
          {stats.disponibles} <span className="hidden sm:inline ml-1">disp.</span>
        </Badge>
        <Badge className="bg-warning/10 text-warning border-warning/25 dark:bg-warning/15 dark:border-warning/30 text-xs">
          {stats.reservados} <span className="hidden sm:inline ml-1">res.</span>
        </Badge>
        <Badge className="bg-destructive/10 text-destructive border-destructive/25 dark:bg-destructive/15 dark:border-destructive/30 text-xs">
          {stats.vendidos} <span className="hidden sm:inline ml-1">vend.</span>
        </Badge>
      </div>
    </div>
  )

  // ─── MAP AREA (shared) ───────────────────────────────────────────────────

  const mapArea = (
    <div className="flex-1 relative overflow-hidden">
      <MapPanel featureCollection={featureCollection} className="w-full h-full">
        <MapLotLayers
          featureCollection={featureCollection}
          selectedIds={selectedIds}
          hoveredFeatureId={hoveredFeatureId}
          onFeatureClick={handleFeatureClick}
          onFeatureHover={handleFeatureHover}
        />
        <MapExportButton projectName={projectName} featureCollection={featureCollection} />
        {/* Hover card only on desktop (touch devices have no hover) */}
        {!isMobile && (
          <LotHoverCard
            feature={
              hoveredFeatureId
                ? (featureCollection.features.find(
                    (f) => f.properties.geometry_id === hoveredFeatureId
                  ) ?? null)
                : null
            }
          />
        )}
      </MapPanel>

      {/* Mobile FAB — visible only on mobile when lots are selected */}
      {isMobile && selectedIds.size > 0 && (
        <button
          onClick={() => setIsMobileSheetOpen(true)}
          className={cn(
            'absolute bottom-4 left-1/2 -translate-x-1/2 z-20',
            'flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg',
            'text-sm font-semibold text-white',
            'bg-primary hover:bg-primary/90 active:scale-95 transition-all',
            'ring-4 ring-primary/20'
          )}
        >
          {selectedIds.size > 1 ? (
            <>
              <HugeiconsIcon icon={Layers01Icon} className="w-4 h-4" />
              {selectedIds.size} lotes seleccionados
            </>
          ) : (
            <>
              <HugeiconsIcon icon={Location01Icon} className="w-4 h-4" />
              Ver detalles del lote
            </>
          )}
        </button>
      )}
    </div>
  )

  // ─── MOBILE LAYOUT ───────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <TooltipProvider>
        <div className="flex flex-col h-[calc(100dvh-130px)] min-h-96 bg-muted/20 rounded-xl overflow-hidden text-foreground">
          {/* Top Bar */}
          {topBar}

          {/* Map — full width on mobile */}
          {mapArea}
        </div>

        {/* Bottom Sheet — opens on lot selection */}
        <Sheet
          open={isMobileSheetOpen}
          onOpenChange={(open) => {
            setIsMobileSheetOpen(open)
            if (!open) setSelectedIds(new Set())
          }}
        >
          <SheetContent
            side="bottom"
            className="h-[80dvh] rounded-t-2xl p-0 flex flex-col overflow-hidden"
          >
            <SheetHeader className="flex-row items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  {selectedIds.size > 1 ? (
                    <HugeiconsIcon icon={Layers01Icon} className="w-4 h-4" />
                  ) : (
                    <HugeiconsIcon icon={Location01Icon} className="w-4 h-4" />
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <SheetTitle className="text-sm font-semibold leading-tight">
                    {selectedIds.size > 1 ? 'Acciones Masivas' : 'Detalles del Lote'}
                  </SheetTitle>
                  <span className="text-[10px] text-muted-foreground">
                    {selectedIds.size > 1 ? 'Panel de edición grupal' : 'Información del lote'}
                  </span>
                </div>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-4">{renderSidebarContent()}</div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </TooltipProvider>
    )
  }

  // ─── DESKTOP LAYOUT ──────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-220px)] min-h-125 bg-muted/25 rounded-xl overflow-hidden text-foreground">
        {/* Left Side: Map Card */}
        <div className="flex-1 p-2 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col w-full h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden relative">
            {/* Top Bar */}
            {topBar}
            {/* Map Area */}
            {mapArea}
          </div>
        </div>

        {/* Right Side: Sidebar Card */}
        <div
          className={cn(
            'p-2 transition-all duration-300 ease-in-out shrink-0',
            isPanelCollapsed ? 'w-15' : 'w-96 lg:w-112.5'
          )}
        >
          <div className="h-full bg-card rounded-xl shadow-lg ring-1 ring-border flex flex-col overflow-hidden">
            <div
              className={cn(
                'h-14 flex items-center border-b border-border/70',
                isPanelCollapsed ? 'justify-center px-2' : 'px-4'
              )}
            >
              {!isPanelCollapsed && (
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                    {selectedIds.size > 1 ? (
                      <HugeiconsIcon icon={Layers01Icon} className="w-4 h-4" />
                    ) : (
                      <HugeiconsIcon icon={Location01Icon} className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">
                      {selectedIds.size > 1 ? 'Acciones Masivas' : 'Detalles'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {selectedIds.size > 1 ? 'Panel de edición grupal' : 'Información del lote'}
                    </span>
                  </div>
                </div>
              )}
              <button
                onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors',
                  !isPanelCollapsed && 'ml-auto'
                )}
                title={isPanelCollapsed ? 'Expandir panel' : 'Colapsar panel'}
              >
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className={cn(
                    'w-4 h-4 text-muted-foreground transition-transform duration-300',
                    isPanelCollapsed && 'rotate-180'
                  )}
                />
              </button>
            </div>

            {!isPanelCollapsed ? (
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 space-y-4">{renderSidebarContent()}</div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex flex-col items-center pt-4 gap-2">
                {selectedIds.size > 0 && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    {selectedIds.size > 1 ? (
                      <HugeiconsIcon icon={Layers01Icon} className="w-4 h-4 text-primary" />
                    ) : (
                      <HugeiconsIcon icon={Location01Icon} className="w-4 h-4 text-primary" />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
