import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading02Icon, FloppyDiskIcon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'

import type { GeoJSONGeometry } from '@/types/database.types'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { ESTADO_CONFIG, type EstadoLote, getEstadoBadgeClasses } from '@/lib/models/lot.model'
import type { LotDetails } from '@/types/viewer.types'

const lotFormSchema = z.object({
  numero_lote: z.string().min(1, 'El número es requerido'),
  estado: z.string(),
  m2: z.number().min(0, 'La superficie debe ser positiva'),
  precio: z.number().min(0, 'El precio debe ser positivo'),
  valor_reserva: z.number().min(0, 'El valor de reserva debe ser positivo').optional(),
  observaciones: z.string().optional(),
})

type LotFormValues = z.infer<typeof lotFormSchema>

interface LotEditFormProps {
  lotDetails: LotDetails
  geometry?: GeoJSONGeometry | null
  onSave: (data: LotFormValues) => Promise<void>
  onCancel: () => void
}

export function LotEditForm({ lotDetails, onSave, onCancel }: LotEditFormProps) {
  const [isSaving, setIsSaving] = useState(false)

  // Setup React Hook Form
  const form = useForm<LotFormValues>({
    resolver: zodResolver(lotFormSchema),
    defaultValues: {
      numero_lote: lotDetails.numero_lote,
      estado: lotDetails.estado,
      m2: lotDetails.m2 || 0,
      precio: lotDetails.precio || 0,
      valor_reserva: lotDetails.valor_reserva || 0,
      observaciones: lotDetails.observaciones || '',
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = form

  // Watch state for badge preview
  const currentEstado = useWatch({ control, name: 'estado' }) as EstadoLote

  const onSubmit = async (data: LotFormValues) => {
    setIsSaving(true)
    try {
      await onSave(data)
      // Successful save is handled by parent, form just reports
    } catch {
      toast.error('Error al guardar cambios')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      {/* HERO PREVIEW - Context Preservation */}
      <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-primary/5 via-sidebar-accent/50 to-transparent p-4 text-center border border-sidebar-border/50">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Editando Lote
        </p>

        {/* Visual Context: Lot Number Input as Hero Title */}
        <div className="mt-1 flex justify-center">
          <Input
            {...register('numero_lote')}
            className="text-center font-bold text-xl h-9 w-32 border-dashed focus:border-solid bg-card/50 focus:bg-card transition-all shadow-none focus:shadow-sm"
            placeholder="Nº Lote"
          />
        </div>
        {errors.numero_lote && (
          <p className="text-[10px] text-red-500 mt-1">{errors.numero_lote.message}</p>
        )}

        {/* Visual Context: State Badge Preview */}
        <div className="mt-2 flex justify-center opacity-90">
          <Badge
            variant="outline"
            className={cn(
              'capitalize font-medium border text-[10px] transition-colors duration-300',
              getEstadoBadgeClasses(currentEstado)
            )}
          >
            {ESTADO_CONFIG[currentEstado as keyof typeof ESTADO_CONFIG]?.label || currentEstado}
          </Badge>
        </div>
      </div>

      <Card className="shadow-xs border-sidebar-border/50">
        <CardContent className="p-4 space-y-4">
          {/* Status Select */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-sidebar-foreground/70">Estado</Label>
            <Select value={currentEstado} onValueChange={(value) => setValue('estado', value)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleccionar estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disponible">Disponible</SelectItem>
                <SelectItem value="reservado">Reservado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Price & Reservation Value */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-sidebar-foreground/70">Precio (CLP)</Label>
              <Input
                type="number"
                {...register('precio', { valueAsNumber: true })}
                className="h-9"
              />
              {errors.precio && <p className="text-[10px] text-red-500">{errors.precio.message}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium text-sidebar-foreground/70">
                Valor Reserva ($)
              </Label>
              <Input
                type="number"
                {...register('valor_reserva', { valueAsNumber: true })}
                className="h-9"
                placeholder="Ej: 500000"
              />
              {errors.valor_reserva && (
                <p className="text-[10px] text-red-500">{errors.valor_reserva.message}</p>
              )}
            </div>
          </div>

          {/* Observations */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-sidebar-foreground/70">Observaciones</Label>
            <Textarea
              {...register('observaciones')}
              className="resize-none text-xs"
              rows={3}
              placeholder="Detalles adicionales internos del lote..."
            />
          </div>

          {/* Action Footer */}
          <div className="flex gap-2 pt-2 border-t mt-2">
            <Button type="submit" disabled={isSaving} className="flex-1 h-9" size="sm">
              {isSaving ? (
                <HugeiconsIcon icon={Loading02Icon} className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <HugeiconsIcon icon={FloppyDiskIcon} className="w-4 h-4 mr-2" />
              )}
              Guardar Cambios
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={onCancel}
              className="h-9 w-9 shadow-none"
              disabled={isSaving}
              title="Cancelar Edición"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
