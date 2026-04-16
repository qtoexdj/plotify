'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Plus, Save, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { BlockEditorDialog } from './block-editor-dialog'
import { SortableArticleItem, type ArticleItem } from './sortable-article-item'
import { saveTemplateBlocksAction } from '@/actions/documents.action'
import type { DocumentBlock, TemplateWithBlocks } from '@/types/v2'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  encabezado: 'Encabezados',
  articulo: 'Artículos',
  precio: 'Precio / Pago',
  clausula: 'Cláusulas',
  firma: 'Firmas',
  anexo: 'Anexos',
}

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  encabezado: 'bg-green-100 text-green-800 border-green-200',
  articulo: 'bg-blue-100 text-blue-800 border-blue-200',
  precio: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  clausula: 'bg-purple-100 text-purple-800 border-purple-200',
  firma: 'bg-gray-100 text-gray-700 border-gray-200',
  anexo: 'bg-orange-100 text-orange-800 border-orange-200',
}

function initItems(template: TemplateWithBlocks): ArticleItem[] {
  return (template.blocks ?? []).map((item, idx) => ({
    id: item.id,
    block_id: item.block_id,
    block_name: (item.block as DocumentBlock).name,
    block_category: (item.block as DocumentBlock).category,
    position: item.position ?? idx + 1,
    is_optional: item.is_optional ?? false,
    condition_field: item.condition_field ?? null,
  }))
}

// ─── Panel izquierdo: biblioteca de bloques ──────────────────────────────────

interface BlockLibraryProps {
  blocks: DocumentBlock[]
  onAdd: (block: DocumentBlock) => void
  organizationId: string
}

function BlockLibrary({ blocks, onAdd, organizationId }: BlockLibraryProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('todos')

  const filtered = useMemo(() => {
    return blocks.filter((b) => {
      const matchCat = categoryFilter === 'todos' || b.category === categoryFilter
      const matchSearch =
        !search ||
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        (b.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
      return matchCat && matchSearch
    })
  }, [blocks, search, categoryFilter])

  // Agrupar por categoría
  const grouped = useMemo(() => {
    const groups: Record<string, DocumentBlock[]> = {}
    for (const b of filtered) {
      if (!groups[b.category]) groups[b.category] = []
      groups[b.category].push(b)
    }
    return groups
  }, [filtered])

  return (
    <div className="flex flex-col h-full gap-3">
      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Biblioteca de bloques
      </p>

      {/* Barra de búsqueda */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder="Buscar bloque..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filtro de categoría */}
      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todas las categorías</SelectItem>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Lista agrupada */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 pr-2">
          {Object.entries(grouped).map(([category, items]) => (
            <Collapsible key={category} defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                <Badge
                  variant="outline"
                  className={`text-xs ${CATEGORY_BADGE_CLASS[category] ?? ''}`}
                >
                  {CATEGORY_LABELS[category] ?? category}
                </Badge>
                <span className="text-xs text-muted-foreground">({items.length})</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-1">
                  {items.map((block) => (
                    <div
                      key={block.id}
                      className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent/40 transition-colors text-sm"
                    >
                      <span className="flex-1 text-xs leading-tight truncate">
                        {block.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => onAdd(block)}
                        aria-label={`Agregar ${block.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Sin resultados
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface TemplateBuilderProps {
  template: TemplateWithBlocks
  availableBlocks: DocumentBlock[]
}

export function TemplateBuilder({ template, availableBlocks }: TemplateBuilderProps) {
  const [items, setItems] = useState<ArticleItem[]>(() => initItems(template))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  // Dialog de edición de bloque
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const editingBlock = availableBlocks.find((b) => b.id === editingBlockId) ?? null

  const orgId = template.organization_id

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setItems((prev) => {
      const oldIdx = prev.findIndex((i) => i.id === active.id)
      const newIdx = prev.findIndex((i) => i.id === over.id)
      const reordered = arrayMove(prev, oldIdx, newIdx)
      return reordered.map((item, idx) => ({ ...item, position: idx + 1 }))
    })
  }, [])

  const handleAdd = useCallback((block: DocumentBlock) => {
    setItems((prev) => {
      const nextPos = prev.length + 1
      const newItem: ArticleItem = {
        id: `${block.id}-${Date.now()}`,
        block_id: block.id,
        block_name: block.name,
        block_category: block.category,
        position: nextPos,
        is_optional: false,
        condition_field: null,
      }
      return [...prev, newItem]
    })
  }, [])

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id)
      return next.map((item, idx) => ({ ...item, position: idx + 1 }))
    })
  }, [])

  const handleToggleOptional = useCallback((id: string, value: boolean) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, is_optional: value } : i))
    )
  }, [])

  const handleChangeCondition = useCallback((id: string, field: string | null) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, condition_field: field, is_optional: field !== null ? true : i.is_optional }
          : i
      )
    )
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    setSavedOk(false)

    const result = await saveTemplateBlocksAction(
      template.id,
      items.map((i) => ({
        block_id: i.block_id,
        position: i.position,
        is_optional: i.is_optional,
        condition_field: i.condition_field,
      }))
    )

    setIsSaving(false)
    if (result.success) {
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 3000)
    } else {
      setSaveError(result.error)
    }
  }

  const sortableIds = items.map((i) => i.id)

  return (
    <div className="grid grid-cols-3 gap-4 flex-1 overflow-hidden min-h-0">
      {/* ── Panel izquierdo: biblioteca ─────────────────────────────────── */}
      <div className="col-span-1 border rounded-lg p-4 flex flex-col overflow-hidden">
        <BlockLibrary
          blocks={availableBlocks}
          onAdd={handleAdd}
          organizationId={orgId}
        />
      </div>

      {/* ── Panel derecho: secuencia ─────────────────────────────────────── */}
      <div className="col-span-2 border rounded-lg p-4 flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Secuencia del documento
          </p>
          <span className="text-xs text-muted-foreground">
            {items.length} artículo{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        <ScrollArea className="flex-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 pr-2">
                {items.map((item) => (
                  <SortableArticleItem
                    key={item.id}
                    item={item}
                    onRemove={handleRemove}
                    onEdit={setEditingBlockId}
                    onToggleOptional={handleToggleOptional}
                    onChangeCondition={handleChangeCondition}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-lg mt-2">
              <p className="text-muted-foreground text-sm">
                Agrega bloques desde la biblioteca para construir la secuencia.
              </p>
            </div>
          )}
        </ScrollArea>

        {/* ── Barra de guardado ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 shrink-0 pt-2 border-t">
          {saveError && (
            <p className="text-xs text-destructive flex-1">{saveError}</p>
          )}
          {savedOk && (
            <p className="text-xs text-green-600 flex-1">Estructura guardada correctamente.</p>
          )}
          {!saveError && !savedOk && <span className="flex-1" />}

          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar estructura'}
          </Button>
        </div>
      </div>

      {/* ── Dialog de edición de bloque ───────────────────────────────── */}
      {editingBlock && (
        <BlockEditorDialog
          open={!!editingBlockId}
          onOpenChange={(open) => { if (!open) setEditingBlockId(null) }}
          block={editingBlock}
          organizationId={orgId}
        />
      )}
    </div>
  )
}
