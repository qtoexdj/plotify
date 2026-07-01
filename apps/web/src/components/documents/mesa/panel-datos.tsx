'use client'

import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, PenLine, ShoppingCart, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MESA_TEXT, datoStatusLabel } from '@/lib/documents/matriz-microcopy'
import {
  datosAgrupadosSdd13,
  type MesaDatoBucket,
  type MesaDatosGrupo,
} from '@/lib/documents/matriz-progress'
import type {
  MatrizScope,
  ResolutionManifest,
  TokenResolution,
  TokenResolutionStatus,
} from '@/lib/documents/matriz-types'
import { DatoPopover } from './dato-popover'

/**
 * Panel "Datos de la escritura" (SDD 010 T012, FR-004): el expediente del
 * caso agrupado por categorías humanas del catálogo canónico, con el estado
 * de cada dato y acceso al mismo popover de evidencia que usan los chips
 * del texto. El panel no edita valores; la corrección vive en el CCL.
 */

export type GrupoDeDatos = {
  categoria: string
  categoriaLabel: string
  datos: TokenResolution[]
}

/**
 * Agrupa el manifiesto por categoría conservando el orden del servidor
 * (catálogo canónico). Datos sin categoría —manifiestos pre-010— caen al
 * grupo genérico, jamás se ocultan.
 */
export function datosAgrupados(datos: TokenResolution[]): GrupoDeDatos[] {
  const grupos: GrupoDeDatos[] = []
  const porCategoria = new Map<string, GrupoDeDatos>()
  for (const dato of datos) {
    const categoria = dato.category ?? dato.category_label ?? ''
    let grupo = porCategoria.get(categoria)
    if (!grupo) {
      grupo = {
        categoria,
        categoriaLabel: dato.category_label ?? MESA_TEXT.categoriaSinNombre,
        datos: [],
      }
      porCategoria.set(categoria, grupo)
      grupos.push(grupo)
    }
    grupo.datos.push(dato)
  }
  return grupos
}

/** Pendientes del grupo: cuántos datos aún no están verificados. */
export function pendientesDelGrupo(grupo: GrupoDeDatos): number {
  return grupo.datos.filter((dato) => dato.status !== 'resolved').length
}

const PUNTO_ESTADO = {
  resolved: 'bg-emerald-500',
  blocked: 'bg-sky-500',
  missing: 'bg-amber-500',
} as const satisfies Record<TokenResolutionStatus, string>

const TEXTO_ESTADO = {
  resolved: 'text-emerald-700',
  blocked: 'text-sky-700',
  missing: 'text-amber-700',
} as const satisfies Record<TokenResolutionStatus, string>

const GROUP_ICON = {
  por_revisar: AlertTriangle,
  venta: ShoppingCart,
  firma: PenLine,
  listas: CheckCircle2,
} as const satisfies Record<MesaDatoBucket, LucideIcon>

const GROUP_TONE = {
  por_revisar:
    'border-amber-300 bg-amber-50/80 text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/20 dark:text-amber-100',
  venta:
    'border-sky-200 bg-sky-50/70 text-sky-900 dark:border-sky-400/30 dark:bg-sky-950/20 dark:text-sky-100',
  firma:
    'border-border bg-muted/60 text-foreground dark:border-border dark:bg-muted/30 dark:text-foreground',
  listas:
    'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-950/20 dark:text-emerald-100',
} as const satisfies Record<MesaDatoBucket, string>

function estadoDatoLabel(dato: TokenResolution, bucket: MesaDatoBucket): string {
  if (bucket === 'venta') return 'Venta'
  if (bucket === 'firma') return 'Firma'
  return datoStatusLabel(dato.status)
}

function FilaDato({
  dato,
  projectId,
  bucket,
}: {
  dato: TokenResolution
  projectId: string
  bucket: MesaDatoBucket
}) {
  const isNonBlocking = bucket === 'venta' || bucket === 'firma'
  return (
    <DatoPopover
      projectId={projectId}
      variableKey={dato.variableKey}
      label={dato.label ?? MESA_TEXT.datoSinNombre}
      estado={dato.status}
      valor={dato.value_text}
      evidencia={dato.evidence_refs}
      origen={dato.source_label ?? null}
    >
      <button
        type="button"
        data-testid="panel-datos-fila"
        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="min-w-0 truncate">{dato.label ?? MESA_TEXT.datoSinNombre}</span>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-xs font-medium',
            isNonBlocking ? 'text-muted-foreground' : TEXTO_ESTADO[dato.status]
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              isNonBlocking ? 'bg-muted-foreground' : PUNTO_ESTADO[dato.status]
            )}
          />
          {estadoDatoLabel(dato, bucket)}
        </span>
      </button>
    </DatoPopover>
  )
}

function GrupoDatos({ grupo, projectId }: { grupo: MesaDatosGrupo; projectId: string }) {
  const Icon = GROUP_ICON[grupo.bucket]
  const hasPending = grupo.bucket === 'por_revisar'

  return (
    <section
      data-testid={`panel-datos-grupo-${grupo.bucket}`}
      className={cn(
        'overflow-hidden rounded-lg border transition-colors',
        GROUP_TONE[grupo.bucket],
        hasPending && 'shadow-sm shadow-amber-500/10'
      )}
    >
      <header className="flex items-start gap-2 px-3 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background/70 text-current">
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="truncate text-sm font-semibold">{grupo.label}</h4>
            <span className="text-xs font-medium">
              {grupo.datos.length === 1 ? '1 dato' : `${grupo.datos.length} datos`}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{grupo.description}</p>
        </div>
      </header>
      <ul className="border-t border-current/10 bg-card/70 px-1 py-1 text-card-foreground">
        {grupo.datos.map((dato) => (
          <li key={dato.variableKey}>
            <FilaDato dato={dato} projectId={projectId} bucket={grupo.bucket} />
          </li>
        ))}
      </ul>
    </section>
  )
}

type PanelDatosProps = {
  resolucion: ResolutionManifest
  projectId: string
  scope: MatrizScope
  soloPendientes?: boolean
}

export function PanelDatos({
  resolucion,
  projectId,
  scope,
  soloPendientes = false,
}: PanelDatosProps) {
  const { tokens: datosDelCaso } = resolucion
  const grupos = useMemo(
    () => datosAgrupadosSdd13(datosDelCaso, scope, soloPendientes),
    [datosDelCaso, scope, soloPendientes]
  )

  return (
    <section
      data-testid="panel-datos"
      aria-label={MESA_TEXT.datosTitle}
      className="rounded-lg border border-border bg-card text-card-foreground"
    >
      <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
        {MESA_TEXT.datosTitle}
      </h3>

      {grupos.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {soloPendientes ? 'No quedan datos por revisar.' : MESA_TEXT.expedienteVacio}
        </p>
      ) : (
        <div className="space-y-3 px-2 py-3">
          {grupos.map((grupo) => (
            <GrupoDatos key={grupo.bucket} grupo={grupo} projectId={projectId} />
          ))}
        </div>
      )}
    </section>
  )
}
