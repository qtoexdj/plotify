'use client'

import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Alert02Icon as AlertTriangle,
  CheckmarkCircle02Icon as CheckCircle2,
  FilterIcon as ListFilter,
  Refresh01Icon as RefreshCw,
  FloppyDiskIcon as Save,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MESA_TEXT, mesaStatusLabel } from '@/lib/documents/matriz-microcopy'
import { matrizEscrituraProgress } from '@/lib/documents/matriz-progress'
import type { MatrizStatus, MatrizView, TokenResolution } from '@/lib/documents/matriz-types'

/**
 * Encabezado de la mesa (SDD 010 T013, FR-015): contexto del caso
 * (proyecto · lote · comprador desde el expediente), estado en español,
 * contador de pendientes y acciones primarias. El slot de acciones recibe
 * el workflow (T016) sin cambiar este componente.
 */

const CLAVES_CONTEXTO = [
  'proyecto.nombre',
  'lote.numero_nombre',
  'lote.numero',
  'comprador.nombre',
] as const

/**
 * Contexto humano del caso desde el expediente. `lote.numero_nombre` y
 * `lote.numero` son alternativas: se usa la primera con valor.
 */
export function contextoDelCaso(datos: TokenResolution[]): string {
  const porClave = new Map(datos.map((dato) => [dato.variableKey, dato]))
  const partes: string[] = []
  let loteIncluido = false
  for (const clave of CLAVES_CONTEXTO) {
    const valor = porClave.get(clave)?.value_text?.trim()
    if (!valor) continue
    const esLote = clave.startsWith('lote.')
    if (esLote && loteIncluido) continue
    if (esLote) loteIncluido = true
    partes.push(valor)
  }
  return partes.join(' · ')
}

export function contadorPendientes(cantidad: number): string {
  return cantidad === 1 ? '1 pendiente' : `${cantidad} pendientes`
}

export function tituloDeMesa(matriz: Pick<MatrizView, 'scope' | 'template'>): string {
  return matriz.scope === 'project' ? 'Matriz del proyecto' : matriz.template.name
}

export function estadoDeMesa(matriz: Pick<MatrizView, 'scope' | 'status'>): string {
  if (matriz.scope === 'project' && matriz.status === 'approved') {
    return MESA_TEXT.esperandoVentas
  }
  return mesaStatusLabel(matriz.status)
}

const BADGE_ESTADO_MESA = {
  draft: 'border-border bg-muted text-foreground',
  legal_review_pending: 'border-info/30 bg-info/10 text-info',
  approved: 'border-success/30 bg-success/10 text-success',
  superseded: 'border-border bg-muted text-muted-foreground',
} as const satisfies Record<MatrizStatus, string>

type MesaEncabezadoProps = {
  matriz: MatrizView
  puedeGuardar: boolean
  guardando: boolean
  onGuardar: () => void
  soloPendientes?: boolean
  onSoloPendientesChange?: (active: boolean) => void
  acciones?: ReactNode
}

export function MesaEncabezado({
  matriz,
  puedeGuardar,
  guardando,
  onGuardar,
  soloPendientes = false,
  onSoloPendientesChange,
  acciones = null,
}: MesaEncabezadoProps) {
  const contexto = contextoDelCaso(matriz.resolution.tokens)
  const progreso = matrizEscrituraProgress(matriz)
  const pendientes = progreso.porRevisar
  const titulo = tituloDeMesa(matriz)
  const estado = estadoDeMesa(matriz)
  const puedeFiltrarPendientes = pendientes > 0 && Boolean(onSoloPendientesChange)

  return (
    <header
      data-testid="mesa-encabezado"
      className="rounded-none bg-transparent text-card-foreground"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {titulo}
            </h1>
            <Badge
              variant="outline"
              className={cn('rounded-full px-3 py-1', BADGE_ESTADO_MESA[matriz.status])}
            >
              {estado}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {contexto ? <span className="min-w-0 truncate">{contexto}</span> : null}
            <span data-testid="mesa-progreso-sdd13" className="font-medium text-foreground">
              {progreso.listas}/{progreso.total} listas
            </span>
            <span
              data-testid="mesa-contador-pendientes"
              className={
                pendientes > 0
                  ? 'inline-flex items-center gap-1 font-medium text-warning'
                  : 'inline-flex items-center gap-1 text-success'
              }
            >
              {pendientes > 0 ? (
                <HugeiconsIcon icon={AlertTriangle} aria-hidden className="size-3.5" />
              ) : (
                <HugeiconsIcon icon={CheckCircle2} aria-hidden className="size-3.5" />
              )}
              {contadorPendientes(pendientes)}
            </span>
            {matriz.scope === 'project' ? <span>los huecos de venta no cuentan</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {acciones}
          {puedeFiltrarPendientes ? (
            <Button
              type="button"
              variant={soloPendientes ? 'secondary' : 'outline'}
              size="lg"
              className="min-h-11"
              onClick={() => onSoloPendientesChange?.(!soloPendientes)}
            >
              <HugeiconsIcon icon={ListFilter} />
              {soloPendientes ? 'Ver todas' : 'Ver pendientes'}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={() => window.location.reload()}
          >
            <HugeiconsIcon icon={RefreshCw} />
            Verificar
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            onClick={onGuardar}
            disabled={!puedeGuardar || guardando}
          >
            <HugeiconsIcon icon={Save} />
            {guardando ? MESA_TEXT.guardando : 'Generar escritura'}
          </Button>
        </div>
      </div>

      {matriz.snapshot_stale ? (
        <div
          data-testid="mesa-expediente-cambio"
          className="mt-4 flex items-start gap-2 rounded-lg bg-warning/10 px-4 py-2.5 text-sm text-warning"
        >
          <HugeiconsIcon icon={AlertTriangle} aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{MESA_TEXT.expedienteCambio}</p>
        </div>
      ) : null}
    </header>
  )
}
