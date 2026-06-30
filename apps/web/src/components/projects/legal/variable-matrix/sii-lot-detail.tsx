'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  ROLE_STATUS_LABELS,
  deriveRoleInProcessText,
  type LegalRoleMatchesResponse,
  type LegalRoleMatchUpdatePayload,
  type LotRoleMatch,
  type LotRoleStatus,
} from '@/lib/legal/variable-resolution-types'

/**
 * SDD 013 T017 (FR-013) — detalle por lote de los roles SII con ajuste manual.
 * Preserva la capacidad del antiguo panel a medida: lista los lotes del
 * certificado y permite un override por lote via `legal-roles/[lotId]`. Solo
 * presentacion; reusa los endpoints existentes (el motor no cambia).
 */

const ROLE_STATUS_OPTIONS: LotRoleStatus[] = [
  'rol_en_tramite',
  'definitive',
  'not_applicable',
  'missing',
]

interface OverrideDraft {
  sii_unit_name: string
  sii_comuna: string
  sii_role_matrix: string
  sii_pre_role: string
  sii_definitive_role: string
  role_status: LotRoleStatus
  reason: string
}

function draftFromLot(lot: LotRoleMatch): OverrideDraft {
  return {
    sii_unit_name: lot.sii_unit_name ?? '',
    sii_comuna: lot.sii_comuna ?? '',
    sii_role_matrix: lot.sii_role_matrix ?? '',
    sii_pre_role: lot.sii_pre_role ?? '',
    sii_definitive_role: lot.sii_definitive_role ?? '',
    role_status: lot.role_status,
    reason: '',
  }
}

function sortLots(lots: LotRoleMatch[]): LotRoleMatch[] {
  return [...lots].sort((a, b) => {
    const na = parseInt((a.lot_number || '').replace(/\D/g, ''), 10) || 0
    const nb = parseInt((b.lot_number || '').replace(/\D/g, ''), 10) || 0
    return na - nb
  })
}

interface SiiLotDetailProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function SiiLotDetail({ projectId, open, onOpenChange, onSaved }: SiiLotDetailProps) {
  const [lots, setLots] = useState<LotRoleMatch[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null)
  const [draft, setDraft] = useState<OverrideDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/legal-roles`)
      const payload = (await response.json()) as LegalRoleMatchesResponse & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Error al cargar roles SII')
      setLots(sortLots(payload.lots ?? []))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar roles SII')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const selectedLot = useMemo(
    () => lots.find((lot) => lot.lot_id === selectedLotId) ?? null,
    [lots, selectedLotId]
  )

  function selectLot(lot: LotRoleMatch) {
    setSelectedLotId(lot.lot_id)
    setDraft(draftFromLot(lot))
  }

  function patchDraft(patch: Partial<OverrideDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  async function save() {
    if (!selectedLot || !draft) return
    const reason = draft.reason.trim()
    if (!reason) {
      toast.error('El ajuste manual requiere una razón')
      return
    }
    const comuna = draft.sii_comuna.trim() || null
    const preRole = draft.sii_pre_role.trim() || null
    const derived =
      draft.role_status === 'rol_en_tramite' && preRole && comuna
        ? deriveRoleInProcessText(preRole, comuna)
        : null
    const payload: LegalRoleMatchUpdatePayload = {
      sii_unit_name: draft.sii_unit_name.trim() || null,
      sii_lot_number_normalized: selectedLot.sii_lot_number_normalized ?? null,
      sii_comuna: comuna,
      sii_role_matrix: draft.sii_role_matrix.trim() || null,
      sii_pre_role: preRole,
      sii_role_in_process_text: derived,
      sii_definitive_role: draft.sii_definitive_role.trim() || null,
      role_status: draft.role_status,
      matching_status: 'manual_override',
      reason,
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/legal-roles/${selectedLot.lot_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Error al ajustar rol SII')
      toast.success('Rol SII ajustado manualmente')
      await load()
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al ajustar rol SII')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Roles SII por lote</DialogTitle>
          <DialogDescription>
            Detalle del certificado SII por lote. Ajusta un rol manualmente si la asociación
            automática no es correcta.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando roles…</p>
        ) : error ? (
          <p className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : lots.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay roles SII asociados.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
            <ScrollArea className="max-h-[50vh] rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Lote</th>
                    <th className="px-3 py-2 font-medium">Unidad SII</th>
                    <th className="px-3 py-2 font-medium">Rol</th>
                    <th className="px-3 py-2 text-right font-medium">Matching</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {lots.map((lot) => (
                    <tr
                      key={lot.lot_id}
                      onClick={() => selectLot(lot)}
                      className={cn(
                        'cursor-pointer hover:bg-muted/40',
                        selectedLotId === lot.lot_id && 'bg-primary/5'
                      )}
                    >
                      <td className="px-3 py-2 font-medium text-foreground">
                        {lot.lot_number ?? lot.lot_id}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {lot.sii_unit_name ?? 'Sin unidad'}
                      </td>
                      <td className="px-3 py-2 font-mono text-foreground">
                        {lot.sii_definitive_role ?? lot.sii_pre_role ?? 'Sin rol'}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {lot.matching_status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            {draft && selectedLot ? (
              <div className="space-y-3">
                <div className="text-xs font-medium text-foreground">
                  Ajustar lote {selectedLot.lot_number ?? selectedLot.lot_id}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sii-unidad">Unidad SII</Label>
                  <Input
                    id="sii-unidad"
                    value={draft.sii_unit_name}
                    onChange={(event) => patchDraft({ sii_unit_name: event.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="sii-comuna">Comuna</Label>
                    <Input
                      id="sii-comuna"
                      value={draft.sii_comuna}
                      onChange={(event) => patchDraft({ sii_comuna: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sii-rolmatriz">Rol matriz</Label>
                    <Input
                      id="sii-rolmatriz"
                      value={draft.sii_role_matrix}
                      onChange={(event) => patchDraft({ sii_role_matrix: event.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="sii-prerol">Pre-rol</Label>
                    <Input
                      id="sii-prerol"
                      value={draft.sii_pre_role}
                      onChange={(event) => patchDraft({ sii_pre_role: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sii-roldef">Rol definitivo</Label>
                    <Input
                      id="sii-roldef"
                      value={draft.sii_definitive_role}
                      onChange={(event) => patchDraft({ sii_definitive_role: event.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Estado del rol</Label>
                  <Select
                    value={draft.role_status}
                    onValueChange={(value) => patchDraft({ role_status: value as LotRoleStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {ROLE_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sii-reason">Razón del ajuste</Label>
                  <Textarea
                    id="sii-reason"
                    rows={2}
                    value={draft.reason}
                    onChange={(event) => patchDraft({ reason: event.target.value })}
                    placeholder="Validado por certificado SII y revisión legal"
                  />
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={saving || !draft.reason.trim()}
                  onClick={save}
                >
                  Guardar ajuste
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Selecciona un lote de la tabla para ajustarlo.
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
