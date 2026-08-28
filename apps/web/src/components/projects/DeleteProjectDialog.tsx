'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert01Icon } from '@hugeicons/core-free-icons'
import type { ProjectWithMetrics } from '@/types/database.types'

export interface DeleteProjectConfirmation {
  confirmedName: string
  acknowledgedExport: boolean
}

interface DeleteProjectDialogProps {
  project: Pick<ProjectWithMetrics, 'id' | 'name' | 'estado' | 'total_lotes'>
  isDeleting: boolean
  onConfirm: (projectId: string, confirmation: DeleteProjectConfirmation) => void
  children: React.ReactNode
}

/**
 * Borrado en tres capas deliberadas: entender qué se pierde, declarar que ya se
 * respaldó, y escribir el nombre exacto. Cada capa existe para frenar un borrado
 * por inercia; ninguna es reversible después.
 */
export function DeleteProjectDialog({
  project,
  isDeleting,
  onConfirm,
  children,
}: DeleteProjectDialogProps) {
  const [open, setOpen] = useState(false)
  const [acknowledgedExport, setAcknowledgedExport] = useState(false)
  const [typedName, setTypedName] = useState('')

  const nameMatches = typedName.trim() === project.name
  const canDelete = acknowledgedExport && nameMatches && !isDeleting

  const reset = () => {
    setAcknowledgedExport(false)
    setTypedName('')
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Alert01Icon} className="h-5 w-5 text-destructive" />
            Eliminar &quot;{project.name}&quot;
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Esta acción es permanente y no se puede deshacer. Se eliminarán los{' '}
                {project.total_lotes} lotes del proyecto junto con su geometría importada, archivos
                fuente, documentos legales, análisis de títulos y escrituras asociadas.
              </p>
              <p className="rounded border border-destructive/20 bg-destructive/10 p-3 text-destructive">
                Descarga todo lo que necesites conservar <strong>antes</strong> de continuar:
                después del borrado no queda copia recuperable.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="acknowledge-export"
              checked={acknowledgedExport}
              onCheckedChange={(checked) => setAcknowledgedExport(checked === true)}
              disabled={isDeleting}
            />
            <Label
              htmlFor="acknowledge-export"
              className="text-sm font-normal leading-snug cursor-pointer"
            >
              Confirmo que ya descargué la documentación y escrituras que necesito conservar de este
              proyecto.
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-project-name" className="text-sm">
              Escribe <span className="font-semibold">{project.name}</span> para confirmar
            </Label>
            <Input
              id="confirm-project-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={project.name}
              autoComplete="off"
              disabled={isDeleting || !acknowledgedExport}
              aria-invalid={typedName.length > 0 && !nameMatches}
            />
            {typedName.length > 0 && !nameMatches && (
              <p className="text-xs text-destructive">El nombre no coincide todavía.</p>
            )}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!canDelete}
            onClick={() => {
              onConfirm(project.id, { confirmedName: typedName.trim(), acknowledgedExport })
              handleOpenChange(false)
            }}
          >
            {isDeleting ? 'Eliminando…' : 'Eliminar definitivamente'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
