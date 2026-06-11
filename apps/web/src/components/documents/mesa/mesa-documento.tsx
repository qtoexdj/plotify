'use client'

import { useMemo, useState } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { MESA_TEXT, datoStatusLabel } from '@/lib/documents/matriz-microcopy'
import type {
  ClauseContentJson,
  MatrizClauseView,
  MatrizView,
  ResolutionManifest,
  TokenResolutionStatus,
} from '@/lib/documents/matriz-types'

/**
 * Documento continuo de la mesa (SDD 010 T010, FR-001, wireframe 2
 * aprobado): la escritura completa apilada en orden, en vista resuelta por
 * defecto. El modo estructura muestra los huecos de datos con su nombre
 * humano. La numeración y la detección de bloques de título espejan al
 * renderer DOCX server-side para que la mesa lea igual que la minuta.
 */

export type VistaDocumento = 'resuelta' | 'estructura'

export type SegmentoTexto = { kind: 'texto'; texto: string }

export type SegmentoDato = {
  kind: 'dato'
  variableKey: string
  label: string
  estado: TokenResolutionStatus
  valor: string | null
}

export type SegmentoParrafo = SegmentoTexto | SegmentoDato

export type BloqueParrafo = { kind: 'parrafo'; segmentos: SegmentoParrafo[] }

export type BloqueTitulo = {
  kind: 'bloque-titulo'
  blockKey: string
  label: string | null
  texto: string | null
  estado: 'aprobado' | 'pendiente'
}

export type BloqueDocumento = BloqueParrafo | BloqueTitulo

/** Mismos ordinales legales que el renderer DOCX server-side. */
export const ORDINALES_LEGALES = [
  'PRIMERO',
  'SEGUNDO',
  'TERCERO',
  'CUARTO',
  'QUINTO',
  'SEXTO',
  'SÉPTIMO',
  'OCTAVO',
  'NOVENO',
  'DÉCIMO',
  'UNDÉCIMO',
  'DUODÉCIMO',
  'DÉCIMO TERCERO',
  'DÉCIMO CUARTO',
  'DÉCIMO QUINTO',
  'DÉCIMO SEXTO',
  'DÉCIMO SÉPTIMO',
  'DÉCIMO OCTAVO',
  'DÉCIMO NOVENO',
  'VIGÉSIMO',
] as const

const ORDINAL_RE = new RegExp(
  `^\\s*(${[...ORDINALES_LEGALES]
    .sort((a, b) => b.length - a.length)
    .map((ordinal) => ordinal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\s*:`,
  'i'
)

type NodoGenerico = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: unknown[]
}

function comoNodo(value: unknown): NodoGenerico | null {
  return value && typeof value === 'object' ? (value as NodoGenerico) : null
}

export function clausulasOrdenadas(matriz: MatrizView): MatrizClauseView[] {
  const posicion = new Map(matriz.clause_order.map((key, index) => [key, index]))
  return [...matriz.clauses].sort((a, b) => {
    const posA = posicion.get(a.clause_key) ?? matriz.clause_order.length + a.position
    const posB = posicion.get(b.clause_key) ?? matriz.clause_order.length + b.position
    return posA - posB
  })
}

/** Omitida por condición no cumplida: consultable, jamás parte del texto. */
export function esClausulaOmitida(clause: MatrizClauseView): boolean {
  if (clause.disabled) return false
  if (clause.omitted_reason) return true
  return clause.condition !== null && !clause.condition.active
}

/** Texto del primer párrafo (solo nodos de texto), como lo lee el renderer. */
function primerParrafoTexto(content: ClauseContentJson | null): string | null {
  if (!content) return null
  const buscar = (nodes: unknown[]): string | null => {
    for (const value of nodes) {
      const node = comoNodo(value)
      if (!node) continue
      if (node.type === 'paragraph') {
        const texto = (node.content ?? [])
          .map((child) => {
            const inline = comoNodo(child)
            return inline?.type === 'text' ? (inline.text ?? '') : ''
          })
          .join('')
        if (texto.trim()) return texto
        continue
      }
      if (node.type === 'repeat_section' || node.type === 'conditional_section') {
        const interno = buscar(node.content ?? [])
        if (interno) return interno
      }
    }
    return null
  }
  return buscar(content.content)
}

function indiceOrdinalEmbebido(texto: string): number | null {
  const match = ORDINAL_RE.exec(texto)
  if (!match) return null
  const indice = ORDINALES_LEGALES.findIndex(
    (ordinal) => ordinal.toUpperCase() === match[1].toUpperCase()
  )
  return indice >= 0 ? indice : null
}

/**
 * Ordinal legal por cláusula, espejo del renderer DOCX: la comparecencia no
 * se numera, un ordinal ya embebido en el texto se respeta y avanza el
 * contador, y el resto recibe el siguiente ordinal disponible.
 */
export function ordinalesLegales(clausulas: MatrizClauseView[]): Map<string, string | null> {
  const ordinales = new Map<string, string | null>()
  let siguiente = 0
  for (const clause of clausulas) {
    if (clause.disabled || esClausulaOmitida(clause)) {
      ordinales.set(clause.clause_key, null)
      continue
    }
    const texto = primerParrafoTexto(clause.resolved_content ?? clause.content_json)
    if (!texto) {
      ordinales.set(clause.clause_key, null)
      continue
    }
    const embebido = indiceOrdinalEmbebido(texto)
    if (embebido !== null) {
      siguiente = Math.max(siguiente, embebido + 1)
      ordinales.set(clause.clause_key, null)
      continue
    }
    const titulo = clause.title.trim()
    const empiezaConTitulo =
      titulo.length > 0 && texto.trim().toUpperCase().startsWith(titulo.toUpperCase())
    if (titulo && !empiezaConTitulo && clause.clause_key !== 'comparecencia') {
      ordinales.set(clause.clause_key, ORDINALES_LEGALES[siguiente] ?? null)
      siguiente += 1
      continue
    }
    ordinales.set(clause.clause_key, null)
  }
  return ordinales
}

function clavesDeBloquesTitulo(content: ClauseContentJson | null): Set<string> {
  const claves = new Set<string>()
  const recorrer = (nodes: unknown[]) => {
    for (const value of nodes) {
      const node = comoNodo(value)
      if (!node) continue
      if (node.type === 'block_token') {
        const blockKey = String(node.attrs?.blockKey ?? '')
        if (blockKey) claves.add(blockKey)
        continue
      }
      if (node.content) recorrer(node.content)
    }
  }
  if (content) recorrer(content.content)
  return claves
}

/**
 * Convierte una cláusula en bloques de presentación. En la vista resuelta el
 * texto llega ya sustituido por el resolutor server-side: los datos sin
 * valor quedan como huecos con nombre humano y los bloques de título
 * aprobados se reconocen por su texto en el inventario de bloques del caso.
 */
export function bloquesDeClausula(
  clause: MatrizClauseView,
  vista: VistaDocumento,
  resolucion: ResolutionManifest
): BloqueDocumento[] {
  const clavesDeLaClausula = clavesDeBloquesTitulo(clause.content_json)
  const datosPorClave = new Map(resolucion.tokens.map((dato) => [dato.variableKey, dato]))
  const bloquesPorClave = new Map(resolucion.blocks.map((bloque) => [bloque.blockKey, bloque]))
  const textosDeBloqueAprobado = new Map<string, { blockKey: string; label: string | null }>()
  if (vista === 'resuelta') {
    for (const blockKey of clavesDeLaClausula) {
      const bloque = bloquesPorClave.get(blockKey)
      if (bloque?.status === 'resolved' && bloque.text) {
        textosDeBloqueAprobado.set(bloque.text, { blockKey, label: bloque.label ?? null })
      }
    }
  }

  const content = vista === 'resuelta' ? (clause.resolved_content ?? null) : clause.content_json
  if (!content) return []

  const bloques: BloqueDocumento[] = []

  const segmentoDato = (attrs: Record<string, unknown> | undefined): SegmentoDato => {
    const variableKey = String(attrs?.variableKey ?? '')
    const dato = datosPorClave.get(variableKey)
    const nodeLabel = typeof attrs?.label === 'string' ? attrs.label.trim() : ''
    return {
      kind: 'dato',
      variableKey,
      label: nodeLabel || dato?.label || MESA_TEXT.datoSinNombre,
      estado: dato?.status ?? 'missing',
      valor: dato?.value_text ?? null,
    }
  }

  const segmentosDeParrafo = (nodes: unknown[]): SegmentoParrafo[] => {
    const segmentos: SegmentoParrafo[] = []
    for (const value of nodes) {
      const node = comoNodo(value)
      if (!node) continue
      if (node.type === 'text') {
        if (node.text) segmentos.push({ kind: 'texto', texto: node.text })
        continue
      }
      if (node.type === 'variable_token') {
        segmentos.push(segmentoDato(node.attrs))
      }
    }
    return segmentos
  }

  const recorrer = (nodes: unknown[]) => {
    for (const value of nodes) {
      const node = comoNodo(value)
      if (!node) continue
      if (node.type === 'paragraph') {
        const segmentos = segmentosDeParrafo(node.content ?? [])
        if (segmentos.length === 0) continue
        const unico = segmentos.length === 1 && segmentos[0].kind === 'texto' ? segmentos[0] : null
        const bloqueAprobado = unico ? textosDeBloqueAprobado.get(unico.texto) : undefined
        if (bloqueAprobado && unico) {
          bloques.push({
            kind: 'bloque-titulo',
            blockKey: bloqueAprobado.blockKey,
            label: bloqueAprobado.label,
            texto: unico.texto,
            estado: 'aprobado',
          })
          continue
        }
        bloques.push({ kind: 'parrafo', segmentos })
        continue
      }
      if (node.type === 'block_token') {
        const blockKey = String(node.attrs?.blockKey ?? '')
        const inventario = bloquesPorClave.get(blockKey)
        const nodeLabel = typeof node.attrs?.label === 'string' ? node.attrs.label.trim() : ''
        bloques.push({
          kind: 'bloque-titulo',
          blockKey,
          label: nodeLabel || inventario?.label || null,
          texto: null,
          estado: inventario?.status === 'resolved' ? 'aprobado' : 'pendiente',
        })
        continue
      }
      if (node.content) recorrer(node.content)
    }
  }

  recorrer(content.content)
  return bloques
}

const CLASES_ESTADO_DATO: Record<TokenResolutionStatus, string> = {
  resolved: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  blocked: 'bg-sky-50 text-sky-900 ring-sky-200',
  missing: 'bg-amber-50 text-amber-900 ring-amber-200',
}

/** Hueco de dato con nombre humano; T011 lo reemplaza por el chip con popover. */
function DatoHueco({ segmento }: { segmento: SegmentoDato }) {
  return (
    <span
      data-testid="dato-hueco"
      className={cn(
        'rounded px-1 font-sans text-[0.85em] ring-1',
        CLASES_ESTADO_DATO[segmento.estado]
      )}
    >
      {segmento.label}
      <span className="sr-only"> ({datoStatusLabel(segmento.estado)})</span>
    </span>
  )
}

function BloqueTituloAprobado({ bloque }: { bloque: BloqueTitulo }) {
  return (
    <div
      tabIndex={0}
      data-testid="bloque-titulo"
      className="my-4 rounded-r-md border-l-4 border-purple-300 bg-purple-50/60 py-3 pl-4 pr-3 focus-visible:outline-2 focus-visible:outline-purple-400"
    >
      <p className="flex items-center gap-1.5 font-sans text-xs font-medium text-purple-900">
        <LockKeyhole aria-hidden className="size-3.5 shrink-0" />
        {MESA_TEXT.bloqueTitulo}
        {bloque.label ? <span className="font-normal">· {bloque.label}</span> : null}
      </p>
      {bloque.texto ? (
        <p className="mt-2 text-justify">{bloque.texto}</p>
      ) : (
        <p className="mt-2 font-sans text-sm text-purple-900/80">
          {MESA_TEXT.bloqueTituloPendiente}
        </p>
      )}
      <p className="mt-2 font-sans text-xs text-muted-foreground">{MESA_TEXT.bloqueTituloAyuda}</p>
    </div>
  )
}

function ClausulaOmitida({ clause }: { clause: MatrizClauseView }) {
  return (
    <details
      data-testid="clausula-omitida"
      className="my-6 rounded-md border border-dashed border-border px-4 py-2"
    >
      <summary className="cursor-pointer font-sans text-sm text-muted-foreground">
        <span className="font-medium uppercase">{clause.title}</span>
        {' — '}
        {MESA_TEXT.clausulaNoAplica}
      </summary>
      <p className="mt-2 font-sans text-sm text-muted-foreground">
        {clause.omitted_reason ?? MESA_TEXT.clausulaNoAplica}
      </p>
    </details>
  )
}

type MesaDocumentoProps = {
  matriz: MatrizView
}

export function MesaDocumento({ matriz }: MesaDocumentoProps) {
  const [vista, setVista] = useState<VistaDocumento>('resuelta')
  const clausulas = useMemo(() => clausulasOrdenadas(matriz), [matriz])
  const ordinales = useMemo(() => ordinalesLegales(clausulas), [clausulas])

  return (
    <section
      data-testid="mesa-documento"
      className="rounded-lg border border-border bg-card text-card-foreground"
    >
      <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-2.5">
        <Switch
          id="mostrar-estructura"
          checked={vista === 'estructura'}
          onCheckedChange={(checked) => setVista(checked ? 'estructura' : 'resuelta')}
        />
        <Label htmlFor="mostrar-estructura" className="text-sm font-normal">
          {MESA_TEXT.mostrarEstructura}
        </Label>
      </div>

      <article className="mx-auto max-w-3xl px-6 py-10 font-serif text-[15px] leading-8 sm:px-10">
        <h2 className="text-center text-base font-bold uppercase tracking-wide">
          {matriz.template.name}
        </h2>

        {clausulas.map((clause) => {
          if (clause.disabled) return null
          if (esClausulaOmitida(clause)) {
            return <ClausulaOmitida key={clause.clause_key} clause={clause} />
          }
          const ordinal = ordinales.get(clause.clause_key)
          const bloques = bloquesDeClausula(clause, vista, matriz.resolution)
          return (
            <section
              key={clause.clause_key}
              id={`clausula-${clause.clause_key}`}
              data-testid="mesa-clausula"
              aria-label={clause.title}
              className="mt-8"
            >
              <h3 className="text-sm font-bold uppercase tracking-wide">
                {ordinal ? `${ordinal}: ` : ''}
                {clause.title}
              </h3>
              {bloques.map((bloque, index) =>
                bloque.kind === 'bloque-titulo' ? (
                  <BloqueTituloAprobado key={`${clause.clause_key}-${index}`} bloque={bloque} />
                ) : (
                  <p key={`${clause.clause_key}-${index}`} className="mt-3 text-justify">
                    {bloque.segmentos.map((segmento, posicion) =>
                      segmento.kind === 'texto' ? (
                        <span key={posicion}>{segmento.texto}</span>
                      ) : (
                        <DatoHueco key={posicion} segmento={segmento} />
                      )
                    )}
                  </p>
                )
              )}
            </section>
          )
        })}
      </article>
    </section>
  )
}
