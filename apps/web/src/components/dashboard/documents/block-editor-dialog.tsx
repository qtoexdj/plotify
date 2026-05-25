'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { VariableChips } from './variable-chips'
import { ProseKitEditor } from './prosekit-editor'
import { createBlockAction, updateBlockAction } from '@/actions/documents.action'
import type { DocumentBlock } from '@/types/v2'

// ─── Schema ──────────────────────────────────────────────────────────────────

const BLOCK_CATEGORIES = ['encabezado', 'articulo', 'precio', 'clausula', 'firma', 'anexo'] as const

const BlockFormSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100, 'Máximo 100 caracteres'),
  category: z.enum(BLOCK_CATEGORIES),
  tags: z.string(),
})

type BlockFormValues = z.infer<typeof BlockFormSchema>

// ─── Props ───────────────────────────────────────────────────────────────────

interface BlockEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  block?: DocumentBlock | null
  organizationId: string
  onSuccess?: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BlockEditorDialog({
  open,
  onOpenChange,
  block,
  organizationId,
  onSuccess,
}: BlockEditorDialogProps) {
  const isEditing = !!block
  const [content, setContent] = useState(block?.content ?? '')
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<BlockFormValues>({
    resolver: zodResolver(BlockFormSchema),
    defaultValues: {
      name: block?.name ?? '',
      category: (block?.category as (typeof BLOCK_CATEGORIES)[number]) ?? 'articulo',
      tags: (block?.tags ?? []).join(', '),
    },
  })

  const handleSave = async (values: BlockFormValues) => {
    setServerError(null)
    setSaving(true)

    try {
      const tags = values.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const payload = {
        name: values.name,
        category: values.category,
        tags,
        content,
        organization_id: organizationId,
      }

      const result = isEditing
        ? await updateBlockAction(block.id, payload)
        : await createBlockAction(payload)

      if (result.success) {
        onOpenChange(false)
        onSuccess?.()
      } else {
        setServerError(result.error ?? 'Error desconocido')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>{isEditing ? `Editar: ${block.name}` : 'Nuevo Bloque'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-3 gap-0 border-t">
          {/* ── Columna izquierda: metadatos ── */}
          <div className="col-span-1 overflow-auto border-r px-4 py-4 space-y-4">
            <Form {...form}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del artículo</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="PRIMERO — Antecedentes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="articulo">Artículo</SelectItem>
                        <SelectItem value="encabezado">Encabezado</SelectItem>
                        <SelectItem value="precio">Precio / Pago</SelectItem>
                        <SelectItem value="clausula">Cláusula</SelectItem>
                        <SelectItem value="firma">Firma</SelectItem>
                        <SelectItem value="anexo">Anexo</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="escritura, art-02, lote" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Separados por coma</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Form>

            {/* Variables detectadas en tiempo real */}
            <div>
              <p className="text-sm font-medium mb-2">Variables detectadas</p>
              <VariableChips content={content} maxVisible={20} />
            </div>
          </div>

          {/* ── Columna derecha: editor ProseKit ── */}
          <div className="col-span-2 overflow-hidden flex flex-col">
            <ProseKitEditor
              initialContent={content}
              onChange={setContent}
              placeholder="Escribe el contenido del artículo. Usa {{ variable.campo }} para insertar variables Jinja2..."
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          {serverError && <p className="text-sm text-destructive mr-auto">{serverError}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={form.handleSubmit(handleSave)} disabled={saving}>
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear bloque'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
