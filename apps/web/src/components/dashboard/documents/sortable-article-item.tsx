'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Campos condicionales disponibles para templates de escritura
export const CONDITION_FIELDS: Record<string, string> = {
  'servidumbre.aplica': 'Aplica servidumbre',
  'personeria.aplica': 'Aplica personería/representación',
}

export interface ArticleItem {
  /** ID único del item en la secuencia (puede ser el block_id o un uuid generado) */
  id: string
  block_id: string
  block_name: string
  block_category: string
  position: number
  is_optional: boolean
  condition_field: string | null
}

interface SortableArticleItemProps {
  item: ArticleItem
  onRemove: (id: string) => void
  onEdit: (blockId: string) => void
  onToggleOptional: (id: string, value: boolean) => void
  onChangeCondition: (id: string, field: string | null) => void
}

function ConditionBadge({ item }: { item: ArticleItem }) {
  if (item.condition_field) {
    return (
      <Badge variant="secondary" className="text-xs shrink-0 bg-blue-100 text-blue-800 border-blue-200">
        Condicional
      </Badge>
    )
  }
  if (item.is_optional) {
    return (
      <Badge variant="outline" className="text-xs shrink-0 bg-yellow-50 text-yellow-800 border-yellow-300">
        Opcional
      </Badge>
    )
  }
  return (
    <Badge className="text-xs shrink-0 bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100" variant="outline">
      Fijo
    </Badge>
  )
}

export function SortableArticleItem({
  item,
  onRemove,
  onEdit,
  onToggleOptional,
  onChangeCondition,
}: SortableArticleItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isFlexible = item.is_optional || item.condition_field !== null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border rounded-lg bg-card p-3 space-y-2 hover:border-border/80 transition-colors"
    >
      {/* Fila principal */}
      <div className="flex items-center gap-2">
        {/* Handle drag */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
          aria-label="Arrastrar para reordenar"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Posición */}
        <span className="text-muted-foreground text-xs w-6 text-center font-mono shrink-0">
          {item.position}
        </span>

        {/* Nombre del bloque */}
        <span className="flex-1 text-sm font-medium truncate min-w-0">
          {item.block_name}
        </span>

        {/* Badge de condición */}
        <ConditionBadge item={item} />

        {/* Acciones */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => onEdit(item.block_id)}
          aria-label="Editar contenido del bloque"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
          onClick={() => onRemove(item.id)}
          aria-label="Quitar de la secuencia"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Fila de controles opcionales/condicionales */}
      {isFlexible && (
        <div className="flex items-center gap-4 pl-9 flex-wrap">
          {/* Toggle opcional */}
          {!item.condition_field && (
            <div className="flex items-center gap-2">
              <Switch
                id={`optional-${item.id}`}
                checked={item.is_optional}
                onCheckedChange={(v) => onToggleOptional(item.id, v)}
                className="h-4 w-7"
              />
              <Label htmlFor={`optional-${item.id}`} className="text-xs text-muted-foreground cursor-pointer">
                Habilitado por defecto
              </Label>
            </div>
          )}

          {/* Selector de campo de condición */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Condición:</span>
            <Select
              value={item.condition_field ?? '__none__'}
              onValueChange={(v) => onChangeCondition(item.id, v === '__none__' ? null : v)}
            >
              <SelectTrigger className="h-7 text-xs w-52">
                <SelectValue placeholder="Sin condición" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin condición</SelectItem>
                {Object.entries(CONDITION_FIELDS).map(([field, label]) => (
                  <SelectItem key={field} value={field}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}
