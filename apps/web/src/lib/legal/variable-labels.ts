import type { VariableInventoryItem } from './variable-resolution-types'

const VARIABLE_LABELS: Record<string, string> = {
  'evidencia.certificado_gp_referencia': 'Referencia del certificado de hipotecas y gravamenes',
  'mandato.rectificacion_nombre': 'Nombre para rectificacion',
  'mandato.rectificacion_rut': 'RUT para rectificacion',
  'matriz.comuna': 'Comuna del predio',
  'matriz.deslindes.norte': 'Deslinde norte',
  'matriz.deslindes.oriente': 'Deslinde oriente',
  'matriz.deslindes.poniente': 'Deslinde poniente',
  'matriz.deslindes.sur': 'Deslinde sur',
  'matriz.nombre_predio': 'Nombre del predio',
  'matriz.provincia': 'Provincia del predio',
  'sag.oficina_sectorial': 'Oficina sectorial SAG',
  'sag.plano_cbr_anio': 'Ano de inscripcion del plano',
  'sag.plano_cbr_numero': 'Numero de inscripcion del plano',
  'sag.plano_cbr_registro': 'Conservador del plano',
  'sii.pre_rol_lote': 'Rol SII del lote',
  'sii.unidad_nombre': 'Unidad SII',
  'titulo.propietarios': 'Propietarios del titulo',
  'vendedor.domicilio': 'Domicilio del vendedor',
  'vendedor.estado_civil': 'Estado civil del vendedor',
  'vendedor.nacionalidad': 'Nacionalidad del vendedor',
  'vendedor.nombre': 'Nombre del vendedor',
  'vendedor.profesion_giro': 'Profesion o giro del vendedor',
  'vendedor.rut': 'RUT del vendedor',
}

const GROUP_PREFIX_LABELS: Record<string, string> = {
  comprador: 'comprador',
  documento: 'documento',
  evidencia: 'evidencia',
  lote: 'lote',
  mandato: 'mandato',
  matriz: 'predio',
  personeria: 'personeria',
  sag: 'plano',
  servidumbre: 'servidumbre',
  sii: 'SII',
  titulo: 'titulo',
  transaccion: 'transaccion',
  vendedor: 'vendedor',
}

function titleCase(value: string): string {
  return value
    .replace(/\[\]/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function formatLegalVariableLabel(variableKey: string): string {
  const knownLabel = VARIABLE_LABELS[variableKey]
  if (knownLabel) return knownLabel

  const [group, ...parts] = variableKey.split('.')
  const fieldLabel = titleCase(parts.join(' '))
  const groupLabel = GROUP_PREFIX_LABELS[group] ?? group

  if (!fieldLabel) return titleCase(variableKey)
  return `${fieldLabel} (${groupLabel})`
}

export function legalVariableDisplayLabel(item: VariableInventoryItem): string {
  return item.label?.trim() || formatLegalVariableLabel(item.variable_key)
}

export function legalVariableDescription(item: VariableInventoryItem): string {
  return item.description?.trim() || item.variable_key
}
