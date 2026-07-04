'use client'

import { useMemo, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon,
  Cancel01Icon,
  Settings02Icon,
  ListViewIcon,
  Location01Icon,
  Road02Icon,
  Tree02Icon,
  InformationSquareIcon,
  SparklesIcon,
  ViewIcon,
  ViewOffIcon,
  ArrowUp02Icon,
} from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'
import type { Lot, FilterType, AssignAsType } from './types'

// ─────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────

interface FeatureItem {
  tempId: string
  geometryType: string
  properties: Record<string, unknown>
}

interface AssignmentSidePanelProps {
  lots: Lot[]
  features: FeatureItem[]
  assignedLotIds: Set<string>
  assignedShapeTempIds: Set<string>
  selectedIds: Set<string>
  selectedLotId: string | null
  filterType: FilterType
  assignAsType: AssignAsType
  infraName: string
  isAssigning: boolean
  multiSelectMode: boolean
  hiddenShapeIds: Set<string>
  assignedCount: number
  totalCount: number

  onFilterTypeChange: (t: FilterType) => void
  onAssignAsTypeChange: (t: AssignAsType) => void
  onInfraNameChange: (name: string) => void
  onSelectedLotIdChange: (id: string | null) => void
  onMultiSelectModeChange: (on: boolean) => void
  onAssignToLot: () => void
  onSaveInfrastructure: () => void
  onUnassignLot: (lotId: string) => void
  onFeatureClick: (tempId: string) => void
  onToggleVisibility: (tempId: string) => void
  onToggleTypeVisibility: (type: FilterType, show: boolean) => void
  onShowAll: () => void
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export function AssignmentSidePanel({
  lots,
  features,
  assignedLotIds,
  assignedShapeTempIds,
  selectedIds,
  selectedLotId,
  filterType,
  assignAsType,
  infraName,
  isAssigning,
  multiSelectMode,
  hiddenShapeIds,
  assignedCount,
  totalCount,
  onAssignAsTypeChange,
  onInfraNameChange,
  onSelectedLotIdChange,
  onMultiSelectModeChange,
  onAssignToLot,
  onSaveInfrastructure,
  onUnassignLot,
  onFeatureClick,
  onToggleVisibility,
  onToggleTypeVisibility,
  onShowAll,
}: AssignmentSidePanelProps) {
  const [activeTab, setActiveTab] = useState('assign')
  const [lotComboOpen, setLotComboOpen] = useState(false)

  const selectedLot = lots.find((l) => l.id === selectedLotId)
  const availableLots = useMemo(
    () => lots.filter((l) => !assignedLotIds.has(l.id)),
    [lots, assignedLotIds]
  )

  // Selected feature for detail
  const selectedFeature = useMemo(() => {
    if (selectedIds.size === 0) return null
    const firstId = selectedIds.values().next().value
    return features.find((f) => f.tempId === firstId) ?? null
  }, [features, selectedIds])

  // Filtered features (exclude assigned)
  const filteredFeatures = useMemo(
    () =>
      features.filter((f) => {
        if (assignedShapeTempIds.has(f.tempId)) return false
        if (filterType === 'all') return true
        return f.geometryType === filterType
      }),
    [features, assignedShapeTempIds, filterType]
  )

  // Counts
  const { lotCount, roadCount, commonAreaCount } = useMemo(() => {
    let lots = 0,
      roads = 0,
      areas = 0
    features.forEach((s) => {
      if (assignedShapeTempIds.has(s.tempId)) return
      if (s.geometryType === 'lot') lots++
      else if (s.geometryType === 'road') roads++
      else if (s.geometryType === 'common_area') areas++
    })
    return { lotCount: lots, roadCount: roads, commonAreaCount: areas }
  }, [features, assignedShapeTempIds])

  const { hiddenLotCount, hiddenRoadCount, hiddenAreaCount } = useMemo(() => {
    let lots = 0,
      roads = 0,
      areas = 0
    features.forEach((s) => {
      if (hiddenShapeIds.has(s.tempId)) {
        if (s.geometryType === 'lot') lots++
        else if (s.geometryType === 'road') roads++
        else if (s.geometryType === 'common_area') areas++
      }
    })
    return { hiddenLotCount: lots, hiddenRoadCount: roads, hiddenAreaCount: areas }
  }, [features, hiddenShapeIds])

  return (
    <div className="w-80 border-l border-border flex flex-col bg-card">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <TabsList className="grid w-full grid-cols-3 rounded-none border-b bg-muted/50 p-1">
          <TabsTrigger value="assign" className="text-xs">
            <HugeiconsIcon icon={Settings02Icon} className="w-3.5 h-3.5 mr-1.5" />
            Asignar
          </TabsTrigger>
          <TabsTrigger value="lots" className="text-xs">
            <HugeiconsIcon icon={ListViewIcon} className="w-3.5 h-3.5 mr-1.5" />
            Lotes
          </TabsTrigger>
          <TabsTrigger value="visibility" className="text-xs">
            <HugeiconsIcon icon={ViewIcon} className="w-3.5 h-3.5 mr-1.5" />
            Ver
          </TabsTrigger>
        </TabsList>

        {/* ─── Tab: Asignar ─────────────────────────────────────── */}
        <TabsContent value="assign" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Selected Element Info */}
              <div className="bg-muted/50 rounded-lg p-3 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <HugeiconsIcon icon={Location01Icon} className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Elemento Seleccionado</span>
                </div>
                {selectedFeature ? (
                  <div className="space-y-2">
                    <Badge
                      className={`${
                        selectedFeature.geometryType === 'lot'
                          ? 'bg-success/15 text-success hover:bg-success/15'
                          : selectedFeature.geometryType === 'road'
                            ? 'bg-warning/15 text-warning hover:bg-warning/15'
                            : 'bg-common-area/15 text-common-area hover:bg-common-area/15'
                      }`}
                    >
                      {selectedFeature.geometryType === 'lot' && (
                        <HugeiconsIcon icon={Location01Icon} className="w-3 h-3 mr-1" />
                      )}
                      {selectedFeature.geometryType === 'road' && (
                        <HugeiconsIcon icon={Road02Icon} className="w-3 h-3 mr-1" />
                      )}
                      {selectedFeature.geometryType === 'common_area' && (
                        <HugeiconsIcon icon={Tree02Icon} className="w-3 h-3 mr-1" />
                      )}
                      {selectedFeature.geometryType === 'lot'
                        ? 'Lote'
                        : selectedFeature.geometryType === 'road'
                          ? 'Camino'
                          : 'Área Común'}
                    </Badge>
                    {Object.keys(selectedFeature.properties).length > 0 && (
                      <div className="bg-card rounded border border-border p-2 max-h-24 overflow-auto">
                        <dl className="space-y-1 text-xs">
                          {Object.entries(selectedFeature.properties)
                            .filter(
                              ([k]) =>
                                ![
                                  'tempId',
                                  'geometryType',
                                  '_fill_color',
                                  '_stroke_color',
                                ].includes(k)
                            )
                            .slice(0, 4)
                            .map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <dt className="text-muted-foreground">{key}:</dt>
                                <dd className="text-foreground font-medium truncate max-w-30">
                                  {String(value ?? '-')}
                                </dd>
                              </div>
                            ))}
                        </dl>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-3 text-center">
                    <HugeiconsIcon
                      icon={InformationSquareIcon}
                      className="w-8 h-8 text-muted-foreground/30 mb-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      Haz clic en una geometría del mapa
                    </p>
                  </div>
                )}
              </div>

              {/* Multi-select toggle */}
              <button
                onClick={() => onMultiSelectModeChange(!multiSelectMode)}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  multiSelectMode
                    ? 'bg-info/15 text-info border-2 border-info/30'
                    : 'bg-card text-muted-foreground border border-border hover:border-muted-foreground/30'
                }`}
              >
                <HugeiconsIcon icon={SparklesIcon} className="w-4 h-4" />
                {multiSelectMode ? 'Modo multi-selección activo' : 'Activar multi-selección'}
              </button>

              {selectedIds.size > 0 && (
                <>
                  {/* Assignment Type */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">Guardar como:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['lot', 'road', 'common_area'] as const).map((type) => {
                        const cfg =
                          type === 'lot'
                            ? {
                                icon: Location01Icon,
                                label: 'Lote',
                                active: 'bg-success/10 border-success/40 text-success',
                                hover: 'hover:border-success/50',
                              }
                            : type === 'road'
                              ? {
                                  icon: Road02Icon,
                                  label: 'Camino',
                                  active: 'bg-warning/10 border-warning/40 text-warning',
                                  hover: 'hover:border-warning/50',
                                }
                              : {
                                  icon: Tree02Icon,
                                  label: 'Área',
                                  active:
                                    'bg-common-area/10 border-common-area/40 text-common-area',
                                  hover: 'hover:border-common-area/50',
                                }
                        return (
                          <button
                            key={type}
                            onClick={() => onAssignAsTypeChange(type)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
                              assignAsType === type
                                ? cfg.active
                                : `bg-card border-border ${cfg.hover} text-muted-foreground`
                            }`}
                          >
                            <HugeiconsIcon icon={cfg.icon} className="w-4 h-4" />
                            <span className="text-xs font-medium">{cfg.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Assignment Form: Lot */}
                  {assignAsType === 'lot' ? (
                    <div className="bg-success/10 rounded-lg p-3 border border-success/20 space-y-3">
                      <p className="text-xs text-success font-medium">Asignar al lote:</p>
                      <Popover open={lotComboOpen} onOpenChange={setLotComboOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={lotComboOpen}
                            className="w-full justify-between h-8 text-xs border-success/20 hover:border-success/50 bg-card"
                          >
                            {selectedLot ? selectedLot.numero_lote : 'Seleccionar lote...'}
                            <HugeiconsIcon
                              icon={ArrowUp02Icon}
                              className="w-3 h-3 opacity-50 shrink-0"
                            />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start" side="bottom">
                          <Command>
                            <CommandInput placeholder="Buscar lote..." className="h-8 text-xs" />
                            <CommandList>
                              <CommandEmpty className="py-4 text-xs text-center text-muted-foreground">
                                Sin resultados
                              </CommandEmpty>
                              <CommandGroup>
                                {availableLots.map((lot) => (
                                  <CommandItem
                                    key={lot.id}
                                    value={lot.numero_lote}
                                    onSelect={() => {
                                      onSelectedLotIdChange(
                                        selectedLotId === lot.id ? null : lot.id
                                      )
                                      setLotComboOpen(false)
                                    }}
                                    className="text-xs"
                                  >
                                    <HugeiconsIcon
                                      icon={Location01Icon}
                                      className="w-3 h-3 mr-2 text-success"
                                    />
                                    {lot.numero_lote}
                                    <HugeiconsIcon
                                      icon={Tick02Icon}
                                      className={`ml-auto w-3 h-3 ${
                                        selectedLotId === lot.id
                                          ? 'opacity-100 text-success'
                                          : 'opacity-0'
                                      }`}
                                    />
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Button
                        onClick={onAssignToLot}
                        disabled={!selectedLotId || isAssigning}
                        className="w-full bg-success text-success-foreground hover:bg-success/90"
                        size="sm"
                      >
                        {isAssigning ? (
                          <Spinner className="w-4 h-4 mr-2" />
                        ) : (
                          <HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 mr-2" />
                        )}
                        Asignar a lote
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={`rounded-lg p-3 border space-y-3 ${
                        assignAsType === 'road'
                          ? 'bg-warning/10 border-warning/20'
                          : 'bg-common-area/10 border-common-area/20'
                      }`}
                    >
                      <div>
                        <label
                          className={`text-xs font-medium ${
                            assignAsType === 'road' ? 'text-warning' : 'text-common-area'
                          }`}
                        >
                          Nombre (opcional):
                        </label>
                        <Input
                          value={infraName}
                          onChange={(e) => onInfraNameChange(e.target.value)}
                          placeholder={
                            assignAsType === 'road' ? 'Ej: Camino principal' : 'Ej: Plaza central'
                          }
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <Button
                        onClick={onSaveInfrastructure}
                        disabled={isAssigning}
                        className={`w-full ${
                          assignAsType === 'road'
                            ? 'bg-warning text-warning-foreground hover:bg-warning/90'
                            : 'bg-common-area text-common-area-foreground hover:bg-common-area/90'
                        }`}
                        size="sm"
                      >
                        {isAssigning ? (
                          <Spinner className="w-4 h-4 mr-2" />
                        ) : (
                          <HugeiconsIcon icon={Tick02Icon} className="w-4 h-4 mr-2" />
                        )}
                        Guardar {assignAsType === 'road' ? 'camino' : 'área común'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ─── Tab: Lotes ───────────────────────────────────────── */}
        <TabsContent value="lots" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2">
              <div className="grid grid-cols-4 gap-1">
                {lots.map((lot) => {
                  const isAssigned = assignedLotIds.has(lot.id)
                  const isSelected = selectedLotId === lot.id

                  return (
                    <div key={lot.id} className="relative group">
                      <button
                        onClick={() => !isAssigned && onSelectedLotIdChange(lot.id)}
                        disabled={isAssigned}
                        className={`relative w-full h-10 p-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center ${
                          isAssigned
                            ? 'bg-success/15 text-success cursor-default'
                            : isSelected
                              ? 'bg-info/15 text-info ring-2 ring-info/40'
                              : 'bg-muted text-foreground hover:bg-muted/80'
                        }`}
                      >
                        <span>{lot.numero_lote.replace('Lote ', '')}</span>
                        {isAssigned && (
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            className="w-3 h-3 absolute top-1 left-1 text-success"
                          />
                        )}
                      </button>
                      {isAssigned && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (
                              window.confirm(
                                `¿Estás seguro de deshacer la asignación del Lote ${lot.numero_lote}?`
                              )
                            ) {
                              onUnassignLot(lot.id)
                            }
                          }}
                          className="absolute top-1 right-1 bg-destructive/15 text-destructive hover:bg-destructive hover:text-destructive-foreground p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity border border-destructive/20 hover:border-destructive z-10 flex items-center justify-center"
                          title="Revertir asignación"
                        >
                          <HugeiconsIcon
                            icon={Cancel01Icon}
                            className="w-3 h-3"
                            strokeWidth={2.5}
                          />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              {lots.length === 0 && (
                <div className="flex flex-col items-center py-8 text-center">
                  <HugeiconsIcon
                    icon={Location01Icon}
                    className="w-4 h-4 text-muted-foreground mb-2"
                  />
                  <p className="text-xs text-muted-foreground">No hay lotes disponibles</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ─── Tab: Visibilidad ─────────────────────────────────── */}
        <TabsContent value="visibility" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-4">
              {/* Quick actions */}
              <div className="bg-muted/50 rounded-lg p-3 border border-border">
                <p className="text-xs font-medium text-foreground mb-3">Acciones rápidas</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-success/40 border border-success" />
                      <span className="text-xs text-muted-foreground">
                        Lotes ({lotCount - hiddenLotCount}/{lotCount})
                      </span>
                    </div>
                    <Switch
                      checked={hiddenLotCount === 0}
                      onCheckedChange={(checked) => onToggleTypeVisibility('lot', checked)}
                      className="scale-75"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-0.5 bg-warning" />
                      <span className="text-xs text-muted-foreground">
                        Caminos ({roadCount - hiddenRoadCount}/{roadCount})
                      </span>
                    </div>
                    <Switch
                      checked={hiddenRoadCount === 0}
                      onCheckedChange={(checked) => onToggleTypeVisibility('road', checked)}
                      className="scale-75"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-common-area/40 border border-common-area" />
                      <span className="text-xs text-muted-foreground">
                        Áreas ({commonAreaCount - hiddenAreaCount}/{commonAreaCount})
                      </span>
                    </div>
                    <Switch
                      checked={hiddenAreaCount === 0}
                      onCheckedChange={(checked) => onToggleTypeVisibility('common_area', checked)}
                      className="scale-75"
                    />
                  </div>
                </div>
                {hiddenShapeIds.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onShowAll}
                    className="w-full mt-3 text-xs"
                  >
                    <HugeiconsIcon icon={ViewIcon} className="w-3.5 h-3.5 mr-1.5" />
                    Mostrar todos ({hiddenShapeIds.size} ocultos)
                  </Button>
                )}
              </div>

              {/* Individual Elements */}
              <div>
                <p className="text-xs font-medium text-foreground mb-2 px-1">
                  Elementos ({features.length})
                </p>
                <div className="space-y-1">
                  {filteredFeatures.map((feature, index) => {
                    const isHidden = hiddenShapeIds.has(feature.tempId)
                    const isSelected = selectedIds.has(feature.tempId)
                    const name =
                      feature.properties?.name ||
                      feature.properties?.Name ||
                      `${
                        feature.geometryType === 'lot'
                          ? 'Lote'
                          : feature.geometryType === 'road'
                            ? 'Camino'
                            : 'Área'
                      } ${index + 1}`

                    return (
                      <div
                        key={feature.tempId}
                        className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-info/10 border-info/20'
                            : isHidden
                              ? 'bg-muted border-border opacity-60'
                              : 'bg-card border-border hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            className={`w-2.5 h-2.5 rounded-sm shrink-0 ${
                              feature.geometryType === 'lot'
                                ? 'bg-success'
                                : feature.geometryType === 'road'
                                  ? 'bg-warning'
                                  : 'bg-common-area'
                            }`}
                          />
                          <span
                            className={`text-xs truncate ${
                              isHidden ? 'text-muted-foreground' : 'text-foreground'
                            }`}
                          >
                            {String(name)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              onFeatureClick(feature.tempId)
                              if (isHidden) onToggleVisibility(feature.tempId)
                            }}
                            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                            title="Seleccionar"
                          >
                            <HugeiconsIcon icon={Location01Icon} className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onToggleVisibility(feature.tempId)}
                            className={`p-1 rounded transition-colors ${
                              isHidden
                                ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                            title={isHidden ? 'Mostrar' : 'Ocultar'}
                          >
                            {isHidden ? (
                              <HugeiconsIcon icon={ViewOffIcon} className="w-3.5 h-3.5" />
                            ) : (
                              <HugeiconsIcon icon={ViewIcon} className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Footer Stats */}
      <div className="px-4 py-3 border-t border-border bg-muted/50">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Progreso:</span>
          <span className="font-medium text-foreground">
            {assignedCount} / {totalCount} asignados
          </span>
        </div>
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all"
            style={{ width: `${totalCount > 0 ? (assignedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  )
}
