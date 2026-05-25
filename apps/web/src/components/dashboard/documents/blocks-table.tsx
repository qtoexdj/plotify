'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { VariableChips } from './variable-chips'
import { BlockEditorDialog } from './block-editor-dialog'
import { deleteBlockAction } from '@/actions/documents.action'
import { createClient } from '@/lib/supabase/client'
import type { DocumentBlock } from '@/types/v2'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type BlockCategory = 'todos' | 'encabezado' | 'articulo' | 'precio' | 'clausula' | 'firma' | 'anexo'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  encabezado: 'Encabezado',
  articulo: 'Artículo',
  precio: 'Precio',
  clausula: 'Cláusula',
  firma: 'Firma',
  anexo: 'Anexo',
}

const CATEGORY_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  encabezado: 'secondary',
  articulo: 'default',
  precio: 'outline',
  clausula: 'secondary',
  firma: 'outline',
  anexo: 'secondary',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface BlocksTableProps {
  initialBlocks: DocumentBlock[]
  organizationId: string
  userId: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BlocksTable({ initialBlocks, organizationId, userId }: BlocksTableProps) {
  const [blocks, setBlocks] = useState<DocumentBlock[]>(initialBlocks)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<BlockCategory>('todos')

  // Dialog crear/editar
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingBlock, setEditingBlock] = useState<DocumentBlock | null>(null)

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<DocumentBlock | null>(null)
  const [deleting, startDelete] = useTransition()

  // Seed Escritura
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)

  // ── Filtrado ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return blocks.filter((b) => {
      const matchesCategory = categoryFilter === 'todos' || b.category === categoryFilter
      const matchesSearch =
        !search ||
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        (b.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
      return matchesCategory && matchesSearch
    })
  }, [blocks, search, categoryFilter])

  // ── Acciones ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingBlock(null)
    setEditorOpen(true)
  }

  function openEdit(block: DocumentBlock) {
    setEditingBlock(block)
    setEditorOpen(true)
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return
    startDelete(async () => {
      await deleteBlockAction(deleteTarget.id)
      setBlocks((prev) => prev.filter((b) => b.id !== deleteTarget.id))
      setDeleteTarget(null)
    })
  }

  function handleEditorSuccess() {
    // Recargar bloques llamando al servidor
    // Next.js revalidatePath en la acción se encarga de invalidar el cache;
    // aquí forzamos un reload suave del estado local via router refresh o
    // simplemente recargamos la página para que el Server Component re-fetche.
    window.location.reload()
  }

  async function handleSeedEscritura() {
    setSeeding(true)
    setSeedError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('seed_escritura_blocks', {
        p_org_id: organizationId,
        p_user_id: userId,
      })
      if (error) throw error
      window.location.reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al ejecutar seed'
      setSeedError(msg)
    } finally {
      setSeeding(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Buscar por nombre o tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as BlockCategory)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="articulo">Artículo</SelectItem>
              <SelectItem value="encabezado">Encabezado</SelectItem>
              <SelectItem value="precio">Precio</SelectItem>
              <SelectItem value="clausula">Cláusula</SelectItem>
              <SelectItem value="firma">Firma</SelectItem>
              <SelectItem value="anexo">Anexo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 items-center">
          {blocks.length === 0 && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSeedEscritura}
                disabled={seeding}
              >
                {seeding ? 'Cargando...' : 'Cargar plantilla Escritura'}
              </Button>
              {seedError && <p className="text-xs text-destructive">{seedError}</p>}
            </>
          )}
          <Button size="sm" onClick={openCreate}>
            + Nuevo bloque
          </Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">Nombre</TableHead>
              <TableHead className="w-[110px]">Categoría</TableHead>
              <TableHead>Variables</TableHead>
              <TableHead className="hidden md:table-cell">Tags</TableHead>
              <TableHead className="hidden lg:table-cell w-[120px]">Actualizado</TableHead>
              <TableHead className="w-[100px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {blocks.length === 0
                    ? 'No hay bloques. Usa "Cargar plantilla Escritura" para comenzar.'
                    : 'No hay bloques que coincidan con los filtros.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((block) => (
                <TableRow key={block.id}>
                  <TableCell className="font-medium text-sm">{block.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={CATEGORY_VARIANTS[block.category ?? ''] ?? 'secondary'}
                      className="capitalize text-xs"
                    >
                      {CATEGORY_LABELS[block.category ?? ''] ?? block.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <VariableChips content={block.content ?? ''} maxVisible={3} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(block.tags ?? []).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {formatDate(block.updated_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(block)}
                        className="h-7 px-2 text-xs"
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(block)}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      >
                        Eliminar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Contador */}
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {filtered.length} de {blocks.length} bloque
          {blocks.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Dialog crear/editar */}
      <BlockEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        block={editingBlock}
        organizationId={organizationId}
        onSuccess={handleEditorSuccess}
      />

      {/* Confirm delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar bloque?</AlertDialogTitle>
            <AlertDialogDescription>
              Se desactivará el bloque <strong>{deleteTarget?.name}</strong>. Los templates que lo
              usen dejarán de incluirlo. Esta acción es reversible desde la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
