import {
  LEGAL_VARIABLE_PRODUCER_LABELS,
  type LegalVariableProducer,
  type LegalVariableState,
  type VariableInventoryItem,
} from './variable-resolution-types'

/**
 * SDD 013 — modelo de presentacion de la matriz de variables por productor.
 *
 * Funciones puras: agrupan el inventario por quien llena cada variable,
 * colapsan las repeticiones por lote (roles SII) en una sola entrada y
 * derivan el progreso hacia "molde aprobable". No tocan el motor; el
 * `producer` lo provee el inventario (contrato generado).
 */

/** Productores que el operador del molde acciona (revisar / ingresar). */
export const ACTIONABLE_PRODUCERS: readonly LegalVariableProducer[] = ['extracted', 'manual']

/** Productores informativos en el molde — no se editan aqui. */
export const NON_EDITABLE_PRODUCERS: readonly LegalVariableProducer[] = ['sale_gap', 'signing']

/** Orden de presentacion de las secciones por productor. */
export const PRODUCER_ORDER: readonly LegalVariableProducer[] = [
  'extracted',
  'manual',
  'authored',
  'sale_gap',
  'signing',
]

/** Claves SII que se repiten una vez por lote → colapsan en una entrada. */
export const SII_PER_LOT_KEYS = ['sii.unidad_nombre', 'sii.pre_rol_lote'] as const
export const SII_ROLES_ENTRY_KEY = 'sii.roles_por_lote'

/** Estados que cuentan como resueltos (no requieren accion del operador). */
const RESOLVED_STATES: ReadonlySet<LegalVariableState> = new Set<LegalVariableState>([
  'approved',
  'derived',
  'not_applicable',
])

export type ReviewBucket = 'listo' | 'por_revisar' | 'no_editable'

export function producerOf(item: VariableInventoryItem): LegalVariableProducer {
  return item.producer ?? 'extracted'
}

export function reviewBucket(item: VariableInventoryItem): ReviewBucket {
  if (NON_EDITABLE_PRODUCERS.includes(producerOf(item))) return 'no_editable'
  return RESOLVED_STATES.has(item.state) ? 'listo' : 'por_revisar'
}

export interface SingleEntry {
  kind: 'single'
  id: string
  producer: LegalVariableProducer
  bucket: ReviewBucket
  item: VariableInventoryItem
}

export interface CollapsedEntry {
  kind: 'collapsed'
  id: string
  producer: LegalVariableProducer
  bucket: ReviewBucket
  variableKey: string
  variableKeys: string[]
  lotCount: number
  items: VariableInventoryItem[]
}

export type MatrixEntry = SingleEntry | CollapsedEntry

function isPerLotKey(key: string): boolean {
  return (SII_PER_LOT_KEYS as readonly string[]).includes(key)
}

function worstBucket(items: VariableInventoryItem[]): ReviewBucket {
  if (items.some((item) => reviewBucket(item) === 'por_revisar')) return 'por_revisar'
  if (items.every((item) => reviewBucket(item) === 'no_editable')) return 'no_editable'
  return 'listo'
}

function sourceRefText(item: VariableInventoryItem, key: string): string | null {
  const value = item.source_ref?.[key]
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return null
}

/** Lotes representados por las filas colapsadas (por `lot_id` o unidad SII). */
function distinctLotCount(rows: VariableInventoryItem[]): number {
  const lots = new Set<string>()
  for (const row of rows) {
    const lotId = row.lot_id ?? sourceRefText(row, 'lot_id')
    const unitIndex = sourceRefText(row, 'unit_index')
    const rowIndex = sourceRefText(row, 'row_index')
    if (lotId) {
      lots.add(`lot:${lotId}`)
    } else if (unitIndex) {
      lots.add(`unit:${unitIndex}`)
    } else if (rowIndex) {
      lots.add(`row:${rowIndex}`)
    }
  }
  return lots.size > 0 ? lots.size : rows.length
}

function singleEntry(item: VariableInventoryItem): SingleEntry {
  return {
    kind: 'single',
    id: item.id,
    producer: producerOf(item),
    bucket: reviewBucket(item),
    item,
  }
}

/**
 * Convierte el inventario en entradas de matriz. Cada clave SII que se repite
 * por lote (`SII_PER_LOT_KEYS`) con mas de una fila colapsa en una entrada
 * "N lotes"; el resto queda como entrada individual. Conserva el orden de
 * aparicion para las individuales; las colapsadas se emiten al final.
 */
export function toMatrixEntries(items: VariableInventoryItem[]): MatrixEntry[] {
  const siiRows: VariableInventoryItem[] = []
  const entries: MatrixEntry[] = []

  for (const item of items) {
    if (isPerLotKey(item.variable_key)) {
      siiRows.push(item)
      continue
    }
    entries.push(singleEntry(item))
  }

  if (siiRows.length === 1) {
    entries.push(singleEntry(siiRows[0]))
  } else if (siiRows.length > 1) {
    const variableKeys = Array.from(new Set(siiRows.map((row) => row.variable_key))).sort()
    entries.push({
      kind: 'collapsed',
      id: `collapsed:${SII_ROLES_ENTRY_KEY}`,
      producer: producerOf(siiRows[0]),
      bucket: worstBucket(siiRows),
      variableKey: SII_ROLES_ENTRY_KEY,
      variableKeys,
      lotCount: distinctLotCount(siiRows),
      items: siiRows,
    })
  }

  return entries
}

/** Una entrada cuenta como pendiente del molde si es accionable y por revisar. */
export function isPorRevisar(entry: MatrixEntry): boolean {
  return ACTIONABLE_PRODUCERS.includes(entry.producer) && entry.bucket === 'por_revisar'
}

function decisionCount(entry: MatrixEntry): number {
  return entry.kind === 'collapsed' ? entry.variableKeys.length : 1
}

export interface ProducerSection {
  producer: LegalVariableProducer
  label: string
  entries: MatrixEntry[]
  porRevisar: number
  total: number
}

/** Agrupa el inventario en secciones por productor, en `PRODUCER_ORDER`. */
export function groupByProducer(items: VariableInventoryItem[]): ProducerSection[] {
  const entries = toMatrixEntries(items)
  const byProducer = new Map<LegalVariableProducer, MatrixEntry[]>()
  for (const entry of entries) {
    const list = byProducer.get(entry.producer) ?? []
    list.push(entry)
    byProducer.set(entry.producer, list)
  }
  return PRODUCER_ORDER.filter((producer) => byProducer.has(producer)).map((producer) => {
    const list = byProducer.get(producer) ?? []
    return {
      producer,
      label: LEGAL_VARIABLE_PRODUCER_LABELS[producer],
      entries: list,
      porRevisar: list.filter(isPorRevisar).reduce((sum, entry) => sum + decisionCount(entry), 0),
      total: list.reduce((sum, entry) => sum + decisionCount(entry), 0),
    }
  })
}

/** Clave de una entrada (la de la variable, o la clave SII por-lote colapsada). */
export function entryKey(entry: MatrixEntry): string {
  return entry.kind === 'collapsed' ? entry.variableKey : entry.item.variable_key
}

/** Claves accionables por revisar de una seccion, para aprobar en bloque. */
export function porRevisarKeys(section: ProducerSection): string[] {
  return Array.from(
    new Set(
      section.entries
        .filter(isPorRevisar)
        .flatMap((entry) => (entry.kind === 'collapsed' ? entry.variableKeys : [entryKey(entry)]))
    )
  )
}

export interface MoldeProgress {
  /** Decisiones accionables pendientes (SII colapsado). */
  porRevisar: number
  /** Decisiones accionables resueltas. */
  listas: number
  /** Decisiones accionables totales (revisables). */
  total: number
  /** El molde se puede aprobar cuando no quedan accionables por revisar. */
  moldeAprobable: boolean
}

/**
 * Progreso del molde: solo cuenta productores accionables (extracted/manual);
 * huecos de venta y firma quedan fuera del conteo (son informativos).
 */
export function computeMoldeProgress(items: VariableInventoryItem[]): MoldeProgress {
  const actionable = toMatrixEntries(items).filter((entry) =>
    ACTIONABLE_PRODUCERS.includes(entry.producer)
  )
  const porRevisar = actionable
    .filter((entry) => entry.bucket === 'por_revisar')
    .reduce((sum, entry) => sum + decisionCount(entry), 0)
  const listas = actionable
    .filter((entry) => entry.bucket === 'listo')
    .reduce((sum, entry) => sum + decisionCount(entry), 0)
  return {
    porRevisar,
    listas,
    total: actionable.reduce((sum, entry) => sum + decisionCount(entry), 0),
    moldeAprobable: porRevisar === 0,
  }
}
