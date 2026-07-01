import type {
  ApprovalBlocker,
  BlockResolution,
  ClauseContentJson,
  MatrizClauseView,
  MatrizScope,
  MatrizView,
  ResolutionManifest,
  TokenResolution,
  TokenResolutionProducer,
} from './matriz-types'

export type MesaDatoBucket = 'por_revisar' | 'venta' | 'firma' | 'listas'

export interface MesaProgress {
  listas: number
  total: number
  porRevisar: number
  venta: number
  firma: number
  aprobable: boolean
}

export interface ClauseSdd13Summary {
  porRevisar: number
  venta: number
  firma: number
  listas: number
}

export interface MesaDatosGrupo {
  bucket: MesaDatoBucket
  label: string
  description: string
  datos: TokenResolution[]
}

const PRODUCER_FALLBACK_PREFIXES: ReadonlyArray<[string, TokenResolutionProducer]> = [
  ['comprador.', 'sale_gap'],
  ['transaccion.', 'sale_gap'],
  ['lote.', 'sale_gap'],
  ['servidumbre.', 'sale_gap'],
  ['documento.', 'signing'],
]

const GROUP_META = {
  por_revisar: {
    label: 'Por revisar',
    description: 'Bloquean la aprobación del molde.',
  },
  venta: {
    label: 'Se completa en la venta',
    description: 'Comprador, precio, lote y servidumbre no bloquean este molde.',
  },
  firma: {
    label: 'Firma/notaría',
    description: 'Se completa al firmar; no bloquea este molde.',
  },
  listas: {
    label: 'Listas',
    description: 'Datos ya resueltos.',
  },
} as const satisfies Record<MesaDatoBucket, { label: string; description: string }>

const BUCKET_ORDER: readonly MesaDatoBucket[] = ['por_revisar', 'venta', 'firma', 'listas']

function normalizedKey(key: string): string {
  return key.replace(/\[\d+\]/g, '[]').replace(/\[\]$/, '')
}

export function producerOfToken(dato: TokenResolution): TokenResolutionProducer {
  if (dato.producer) return dato.producer
  const key = normalizedKey(dato.variableKey)
  const fallback = PRODUCER_FALLBACK_PREFIXES.find(([prefix]) => key.startsWith(prefix))
  return fallback?.[1] ?? 'extracted'
}

export function bucketDeDato(dato: TokenResolution, scope: MatrizScope): MesaDatoBucket {
  if (dato.status === 'resolved') return 'listas'
  if (scope === 'project') {
    const producer = producerOfToken(dato)
    if (producer === 'sale_gap') return 'venta'
    if (producer === 'signing') return 'firma'
  }
  return 'por_revisar'
}

function blockerIsExtra(blocker: ApprovalBlocker): boolean {
  return blocker.kind === 'snapshot_stale' || blocker.kind === 'alert_clause_missing'
}

export function matrizEscrituraProgress(
  matriz: Pick<MatrizView, 'scope' | 'resolution' | 'approval_blockers'>
): MesaProgress {
  const { scope, resolution } = matriz
  const actionable = resolution.tokens.filter((dato) => {
    const bucket = bucketDeDato(dato, scope)
    return bucket !== 'venta' && bucket !== 'firma'
  })
  const resolvedTokens = actionable.filter((dato) => dato.status === 'resolved').length
  const resolvedBlocks = resolution.blocks.filter((block) => block.status === 'resolved').length
  const extraBlockers = matriz.approval_blockers.filter(blockerIsExtra).length
  const total = actionable.length + resolution.blocks.length + extraBlockers
  const venta = resolution.tokens.filter((dato) => bucketDeDato(dato, scope) === 'venta').length
  const firma = resolution.tokens.filter((dato) => bucketDeDato(dato, scope) === 'firma').length

  return {
    listas: resolvedTokens + resolvedBlocks,
    total,
    porRevisar: matriz.approval_blockers.length,
    venta,
    firma,
    aprobable: matriz.approval_blockers.length === 0,
  }
}

export function clavesDeClausula(content: ClauseContentJson | null): {
  datos: Set<string>
  bloques: Set<string>
} {
  const datos = new Set<string>()
  const bloques = new Set<string>()
  const recorrer = (nodes: unknown[]) => {
    for (const value of nodes) {
      if (!value || typeof value !== 'object') continue
      const node = value as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
      if (node.type === 'variable_token') {
        const key = String(node.attrs?.variableKey ?? '')
        if (key) datos.add(key)
      } else if (node.type === 'block_token') {
        const key = String(node.attrs?.blockKey ?? '')
        if (key) bloques.add(key)
      }
      if (node.content) recorrer(node.content)
    }
  }
  if (content) recorrer(content.content)
  return { datos, bloques }
}

function resolvedBlockCount(blocks: BlockResolution[], keys: Set<string>): number {
  return blocks.filter((block) => keys.has(block.blockKey) && block.status === 'resolved').length
}

export function resumenSdd13DeClausula(
  clause: MatrizClauseView,
  resolucion: ResolutionManifest,
  scope: MatrizScope
): ClauseSdd13Summary {
  const keys = clavesDeClausula(clause.content_json)
  const summary: ClauseSdd13Summary = {
    porRevisar: 0,
    venta: 0,
    firma: 0,
    listas: resolvedBlockCount(resolucion.blocks, keys.bloques),
  }

  for (const dato of resolucion.tokens) {
    if (!keys.datos.has(dato.variableKey)) continue
    const bucket = bucketDeDato(dato, scope)
    if (bucket === 'por_revisar') summary.porRevisar += 1
    if (bucket === 'venta') summary.venta += 1
    if (bucket === 'firma') summary.firma += 1
    if (bucket === 'listas') summary.listas += 1
  }

  for (const block of resolucion.blocks) {
    if (keys.bloques.has(block.blockKey) && block.status !== 'resolved') {
      summary.porRevisar += 1
    }
  }

  return summary
}

export function datosAgrupadosSdd13(
  datos: TokenResolution[],
  scope: MatrizScope,
  onlyPending = false
): MesaDatosGrupo[] {
  const byBucket = new Map<MesaDatoBucket, TokenResolution[]>()
  for (const dato of datos) {
    const bucket = bucketDeDato(dato, scope)
    const list = byBucket.get(bucket) ?? []
    list.push(dato)
    byBucket.set(bucket, list)
  }

  return BUCKET_ORDER.flatMap((bucket) => {
    if (onlyPending && bucket !== 'por_revisar') return []
    const datosDelGrupo = byBucket.get(bucket) ?? []
    if (datosDelGrupo.length === 0) return []
    return [
      {
        bucket,
        label: GROUP_META[bucket].label,
        description: GROUP_META[bucket].description,
        datos: datosDelGrupo,
      },
    ]
  })
}
