'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Copy01Icon as Copy,
  LegalHammerIcon as Hammer,
  PlusSignIcon as Plus,
  StarIcon as Star,
} from '@hugeicons/core-free-icons'
import { createTemplateAction, duplicateTemplateAction } from '@/actions/documents.action'
import type { DocumentTemplate } from '@/types/v2'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOCUMENT_TYPE_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className: string }
> = {
  escritura: {
    label: 'Escritura',
    variant: 'default',
    className: 'bg-info/15 text-info border-info/30 hover:bg-info/15',
  },
  reserva: {
    label: 'Reserva',
    variant: 'default',
    className: 'bg-success/15 text-success border-success/30 hover:bg-success/15',
  },
  promesa: {
    label: 'Promesa',
    variant: 'default',
    className: 'bg-warning/15 text-warning border-warning/30 hover:bg-warning/15',
  },
  deslinde: {
    label: 'Deslinde',
    variant: 'default',
    className: 'bg-common-area/15 text-common-area border-common-area/30 hover:bg-common-area/15',
  },
}

function DocumentTypeBadge({ type }: { type: string }) {
  const config = DOCUMENT_TYPE_CONFIG[type] ?? {
    label: type,
    className: 'bg-muted text-muted-foreground border-border hover:bg-muted',
  }
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(dateStr))
}

// ─── Schema formulario nueva plantilla ────────────────────────────────────────

const NewTemplateSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  document_type: z.string().min(1, 'Selecciona un tipo'),
  description: z.string().max(300).optional(),
})

type NewTemplateValues = z.infer<typeof NewTemplateSchema>

// ─── Dialog Nueva Plantilla ───────────────────────────────────────────────────

interface NewTemplateDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  organizationId: string
  onCreated: (template: DocumentTemplate) => void
}

function NewTemplateDialog({
  open,
  onOpenChange,
  organizationId,
  onCreated,
}: NewTemplateDialogProps) {
  const [isPending, startTransition] = useTransition()
  const form = useForm<NewTemplateValues>({
    resolver: zodResolver(NewTemplateSchema),
    defaultValues: { name: '', document_type: '', description: '' },
  })

  const handleSubmit = (values: NewTemplateValues) => {
    startTransition(async () => {
      const result = await createTemplateAction({
        organization_id: organizationId,
        name: values.name,
        document_type: values.document_type,
        description: values.description ?? null,
      })
      if (result.success) {
        onCreated(result.data)
        form.reset()
        onOpenChange(false)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Plantilla</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Escritura Compraventa 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="document_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de documento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="escritura">Escritura</SelectItem>
                      <SelectItem value="reserva">Reserva</SelectItem>
                      <SelectItem value="promesa">Promesa</SelectItem>
                      <SelectItem value="deslinde">Deslinde</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe el propósito de esta plantilla..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Creando...' : 'Crear plantilla'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Card de plantilla ────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: DocumentTemplate
  onDuplicated: (copy: DocumentTemplate) => void
}

function TemplateCard({ template, onDuplicated }: TemplateCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleDuplicate = () => {
    startTransition(async () => {
      const result = await duplicateTemplateAction(template.id)
      if (result.success) {
        onDuplicated(result.data)
      }
    })
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {template.is_default && (
              <HugeiconsIcon
                icon={Star}
                className="h-4 w-4 shrink-0 fill-warning text-warning"
                aria-label="Plantilla predeterminada"
              />
            )}
            <CardTitle className="text-base leading-tight truncate">{template.name}</CardTitle>
          </div>
          <DocumentTypeBadge type={template.document_type} />
        </div>
        {template.description && (
          <CardDescription className="text-sm line-clamp-2 mt-1">
            {template.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="flex-1 pb-3">
        <p className="text-xs text-muted-foreground">
          Última actualización: {formatDate(template.updated_at)}
        </p>
      </CardContent>

      <CardFooter className="flex gap-2 pt-0">
        <Button
          className="flex-1"
          size="sm"
          onClick={() => router.push(`/documentos/plantillas/${template.id}/builder`)}
        >
          <HugeiconsIcon icon={Hammer} className="h-3.5 w-3.5 mr-1.5" />
          Construir
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={handleDuplicate}
          aria-label="Duplicar plantilla"
        >
          <HugeiconsIcon icon={Copy} className="h-3.5 w-3.5" />
        </Button>
      </CardFooter>
    </Card>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

interface TemplatesListProps {
  initialTemplates: DocumentTemplate[]
  organizationId: string
}

export function TemplatesList({ initialTemplates, organizationId }: TemplatesListProps) {
  const [templates, setTemplates] = useState<DocumentTemplate[]>(initialTemplates)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleCreated = (template: DocumentTemplate) => {
    setTemplates((prev) => [template, ...prev])
  }

  const handleDuplicated = (copy: DocumentTemplate) => {
    setTemplates((prev) => [...prev, copy])
  }

  return (
    <div className="relative">
      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground text-sm mb-4">
            Todavía no hay plantillas. Crea una para comenzar.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            <HugeiconsIcon icon={Plus} className="h-4 w-4 mr-2" />
            Nueva Plantilla
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <TemplateCard key={template.id} template={template} onDuplicated={handleDuplicated} />
            ))}
          </div>

          {/* Botón flotante */}
          <Button
            className="fixed bottom-8 right-8 shadow-lg"
            size="lg"
            onClick={() => setDialogOpen(true)}
          >
            <HugeiconsIcon icon={Plus} className="h-5 w-5 mr-2" />
            Nueva Plantilla
          </Button>
        </>
      )}

      <NewTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        organizationId={organizationId}
        onCreated={handleCreated}
      />
    </div>
  )
}
