'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * SDD 013 T019 — ingreso manual por clave de variables que no vienen en los
 * documentos (las asigna el Conservador al subir el plano). Crea la fila si no
 * existe vía PUT legal-variables/by-key. Solo presentacion.
 */

const MANUAL_VARIABLE_OPTIONS = [
  { key: 'sag.plano_cbr_numero', label: 'N° de plano (CBR)' },
  { key: 'sag.plano_cbr_anio', label: 'Año de plano (CBR)' },
  { key: 'sag.plano_cbr_registro', label: 'Registro CBR' },
  { key: 'sag.oficina_sectorial', label: 'Oficina sectorial SAG' },
] as const

interface ManualInputDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function ManualInputDialog({
  projectId,
  open,
  onOpenChange,
  onSaved,
}: ManualInputDialogProps) {
  const [variableKey, setVariableKey] = useState<string>(MANUAL_VARIABLE_OPTIONS[0].key)
  const [valueText, setValueText] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const value = valueText.trim()
    if (!value) {
      toast.error('Ingresa un valor')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/legal-variables/by-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variable_key: variableKey, value_text: value, state: 'resolved' }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Error al guardar el dato')
      toast.success('Dato manual guardado')
      setValueText('')
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el dato')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ingresar dato manual</DialogTitle>
          <DialogDescription>
            Para variables que no vienen en los documentos (p. ej. el número de plano que asigna el
            Conservador).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Variable</Label>
            <Select value={variableKey} onValueChange={setVariableKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_VARIABLE_OPTIONS.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-value">Valor</Label>
            <Input
              id="manual-value"
              value={valueText}
              onChange={(event) => setValueText(event.target.value)}
            />
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={saving || !valueText.trim()}
            onClick={save}
          >
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
