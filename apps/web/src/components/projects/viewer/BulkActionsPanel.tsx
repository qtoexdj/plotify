import { useState, useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading02Icon,
  Tick02Icon,
  Cancel01Icon,
  Money01Icon,
  Layers01Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

import type { ViewerFeature } from '@/types/viewer.types'
import type { EstadoLote } from '@/lib/models/lot.model'
import { cn } from '@/lib/utils'

interface BulkActionsPanelProps {
  selectedIds: string[]
  allFeatures: ViewerFeature[]
  onUpdateState: (ids: string[], newState: EstadoLote) => Promise<void>
  onUpdatePrice: (ids: string[], newPrice: number) => Promise<void>
  onClearSelection: () => void
  onRemoveFromSelection: (id: string) => void
}

export function BulkActionsPanel({
  selectedIds,
  allFeatures,
  onUpdateState,
  onUpdatePrice,
  onClearSelection,
  onRemoveFromSelection,
}: BulkActionsPanelProps) {
  const [isUpdatingState, setIsUpdatingState] = useState(false)
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false)

  const [targetState, setTargetState] = useState<EstadoLote | ''>('')
  const [targetPrice, setTargetPrice] = useState<string>('')

  // Computed Metrics
  const selectedFeatures = useMemo(() => {
    return allFeatures.filter((f) => selectedIds.includes(f.properties.geometry_id))
  }, [selectedIds, allFeatures])

  const totalArea = useMemo(() => {
    return selectedFeatures.reduce((acc, f) => acc + (f.properties?.m2 || 0), 0)
  }, [selectedFeatures])

  const totalPrice = useMemo(() => {
    return selectedFeatures.reduce((acc, f) => acc + (f.properties?.precio || 0), 0)
  }, [selectedFeatures])

  // Handlers
  const handleStateUpdate = async () => {
    if (!targetState) return
    setIsUpdatingState(true)
    try {
      await onUpdateState(selectedIds, targetState)
      toast.success(`Estado actualizado para ${selectedIds.length} lotes`)
      setTargetState('')
    } catch (error) {
      console.error(error)
      toast.error('Error al actualizar estados')
    } finally {
      setIsUpdatingState(false)
    }
  }

  const handlePriceUpdate = async () => {
    const price = parseInt(targetPrice)
    if (isNaN(price) || price < 0) return

    setIsUpdatingPrice(true)
    try {
      await onUpdatePrice(selectedIds, price)
      toast.success(`Precio actualizado para ${selectedIds.length} lotes`)
      setTargetPrice('')
    } catch (error) {
      console.error(error)
      toast.error('Error al actualizar precios')
    } finally {
      setIsUpdatingPrice(false)
    }
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header / Summary */}
      <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <HugeiconsIcon icon={Layers01Icon} className="w-5 h-5" />
              Selección Múltiple
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedIds.length} Lotes seleccionados
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 -mr-2 -mt-2 text-muted-foreground hover:text-foreground"
            onClick={onClearSelection}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-card/50 rounded-lg p-2 text-center border shadow-xs">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground/70">
              Sup. Total
            </p>
            <p className="font-mono text-sm font-bold text-foreground">
              {new Intl.NumberFormat('es-CL').format(totalArea)} m²
            </p>
          </div>
          <div className="bg-card/50 rounded-lg p-2 text-center border shadow-xs">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground/70">
              Valor Total
            </p>
            <p className="font-mono text-sm font-bold text-foreground">
              {totalPrice > 0
                ? new Intl.NumberFormat('es-CL', {
                    notation: 'compact',
                    compactDisplay: 'short',
                  }).format(totalPrice)
                : '--'}
            </p>
          </div>
        </div>
      </div>

      {/* Actions Section */}
      <div className="space-y-4 shrink-0">
        {/* 1. Bulk State Change */}
        <Card className="shadow-none border-dashed bg-muted/20">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <HugeiconsIcon icon={Tick02Icon} className="w-3.5 h-3.5" />
              Cambiar Estado Masivo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-2 flex gap-2">
            <Select value={targetState} onValueChange={(v) => setTargetState(v as EstadoLote)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Nuevo estado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disponible">Disponible</SelectItem>
                <SelectItem value="reservado">Reservado</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 px-3"
              disabled={!targetState || isUpdatingState}
              onClick={handleStateUpdate}
            >
              {isUpdatingState ? (
                <HugeiconsIcon icon={Loading02Icon} className="w-3 h-3 animate-spin" />
              ) : (
                'Aplicar'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 2. Bulk Price Change */}
        <Card className="shadow-none border-dashed bg-muted/20">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <HugeiconsIcon icon={Money01Icon} className="w-3.5 h-3.5" />
              Fijar Precio Masivo
            </CardTitle>
            <CardDescription className="text-[10px]">
              Asigna el mismo precio a todos
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-2 flex gap-2">
            <Input
              type="number"
              placeholder="Ej: 25000000"
              className="h-8 text-xs"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
            />
            <Button
              size="sm"
              className="h-8 px-3"
              disabled={!targetPrice || isUpdatingPrice}
              onClick={handlePriceUpdate}
            >
              {isUpdatingPrice ? (
                <HugeiconsIcon icon={Loading02Icon} className="w-3 h-3 animate-spin" />
              ) : (
                'Aplicar'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-1" />

      {/* List of Selected Items */}
      <div className="grow overflow-hidden flex flex-col">
        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Lotes en selección:</p>
        <ScrollArea className="h-full pr-3">
          <div className="space-y-1.5">
            {selectedFeatures.map((f) => (
              <div
                key={f.properties.geometry_id}
                className="flex items-center justify-between p-2 rounded-md bg-card border shadow-xs group hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] h-5 min-w-12 justify-center"
                  >
                    {f.properties?.numero_lote || '??'}
                  </Badge>
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      f.properties?.estado === 'disponible' && 'bg-emerald-500',
                      f.properties?.estado === 'reservado' && 'bg-amber-500',
                      f.properties?.estado === 'vendido' && 'bg-red-500'
                    )}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {new Intl.NumberFormat('es-CL').format(f.properties?.m2 || 0)} m²
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onRemoveFromSelection(f.properties.geometry_id)}
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      className="w-3 h-3 text-muted-foreground hover:text-destructive"
                    />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
