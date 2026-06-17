'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { AlertTipo, ConditionMode } from '@/lib/documents/matriz-types'

export const SIN_SELECCION = 'sin-seleccion'

export type CondicionDeclarativa = {
  id: string
  label: string
  condition_key: string | null
  condition_mode: ConditionMode | null
}

export const CONDICIONES_DECLARATIVAS = [
  {
    id: SIN_SELECCION,
    label: MESA_TEXT.condicionSinSeleccion,
    condition_key: null,
    condition_mode: null,
  },
  {
    id: 'servidumbre',
    label: 'Aparece solo si el lote tiene servidumbre',
    condition_key: 'servidumbre.aplica',
    condition_mode: 'omit',
  },
  {
    id: 'personeria',
    label: 'Aparece solo si hay personería',
    condition_key: 'personeria.aplica',
    condition_mode: 'omit',
  },
  {
    id: 'alertas-titulo',
    label: 'Bloquea si el estudio de título tiene alertas',
    condition_key: 'titulo.alertas[]',
    condition_mode: 'block',
  },
] as const satisfies readonly CondicionDeclarativa[]

export type AlertaDeclarativa = {
  tipo: AlertTipo
  label: string
}

export const ALERTAS_DECLARATIVAS = [
  { tipo: 'dl_3516', label: 'Decreto Ley sobre subdivisión' },
  { tipo: 'derechos_aguas', label: 'Derechos de aguas' },
  { tipo: 'vigente_en_el_resto', label: 'Vigente en el resto' },
  { tipo: 'multi_inmueble', label: 'Más de un inmueble' },
  { tipo: 'gravamen', label: 'Gravamen o prohibición' },
  { tipo: 'personeria_requerida', label: 'Personería requerida' },
  { tipo: 'discrepancia_declaracion', label: 'Diferencia en declaración' },
  { tipo: 'otro', label: 'Otra alerta legal' },
] as const satisfies readonly AlertaDeclarativa[]

export function condicionDesdeCampos(
  conditionKey: string | null,
  conditionMode: ConditionMode | null
): string {
  return (
    CONDICIONES_DECLARATIVAS.find(
      (option) => option.condition_key === conditionKey && option.condition_mode === conditionMode
    )?.id ?? SIN_SELECCION
  )
}

export function condicionPorId(id: string): CondicionDeclarativa {
  return CONDICIONES_DECLARATIVAS.find((option) => option.id === id) ?? CONDICIONES_DECLARATIVAS[0]
}

type CondicionClausulaFormProps = {
  condicionId: string
  alertaTipo: AlertTipo | null
  editable: boolean
  onCondicionChange: (id: string) => void
  onAlertaChange: (tipo: AlertTipo | null) => void
}

export function CondicionClausulaForm({
  condicionId,
  alertaTipo,
  editable,
  onCondicionChange,
  onAlertaChange,
}: CondicionClausulaFormProps) {
  return (
    <div data-testid="condicion-clausula-form" className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{MESA_TEXT.condicionTitle}</Label>
        <Select value={condicionId} onValueChange={onCondicionChange} disabled={!editable}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDICIONES_DECLARATIVAS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{MESA_TEXT.alertaTitle}</Label>
        <Select
          value={alertaTipo ?? SIN_SELECCION}
          onValueChange={(value) =>
            onAlertaChange(value === SIN_SELECCION ? null : (value as AlertTipo))
          }
          disabled={!editable}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_SELECCION}>{MESA_TEXT.alertaSinSeleccion}</SelectItem>
            {ALERTAS_DECLARATIVAS.map((option) => (
              <SelectItem key={option.tipo} value={option.tipo}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
