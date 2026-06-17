'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { MESA_TEXT, datoStatusLabel } from '@/lib/documents/matriz-microcopy'
import type {
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

function FilaDato({ dato, projectId }: { dato: TokenResolution; projectId: string }) {
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
            TEXTO_ESTADO[dato.status]
          )}
        >
          <span aria-hidden className={cn('size-1.5 rounded-full', PUNTO_ESTADO[dato.status])} />
          {datoStatusLabel(dato.status)}
        </span>
      </button>
    </DatoPopover>
  )
}

type PanelDatosProps = {
  resolucion: ResolutionManifest
  projectId: string
}

export function PanelDatos({ resolucion, projectId }: PanelDatosProps) {
  const { tokens: datosDelCaso } = resolucion
  const grupos = useMemo(() => datosAgrupados(datosDelCaso), [datosDelCaso])

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
          {MESA_TEXT.expedienteVacio}
        </p>
      ) : (
        <div className="space-y-4 px-2 py-3">
          {grupos.map((grupo) => {
            const pendientes = pendientesDelGrupo(grupo)
            return (
              <div key={grupo.categoria || grupo.categoriaLabel}>
                <div className="flex items-center justify-between gap-2 px-2 pb-1">
                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {grupo.categoriaLabel}
                  </h4>
                  {pendientes > 0 ? (
                    <span className="text-xs text-amber-700">{pendientes} por completar</span>
                  ) : null}
                </div>
                <ul>
                  {grupo.datos.map((dato) => (
                    <li key={dato.variableKey}>
                      <FilaDato dato={dato} projectId={projectId} />
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
