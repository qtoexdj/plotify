'use client'

import { useEffect, useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getMatrizCase,
  getMatrizProject,
  saveMatriz,
  MatrizClientError,
} from '@/lib/documents/matriz-client'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type {
  ClauseContentJson,
  MatrizCaseResponse,
  MatrizClauseOverride,
  MatrizClauseView,
  MatrizView,
} from '@/lib/documents/matriz-types'
import { EstadoPreparacion } from './estado-preparacion'
import { MesaDocumento, clausulasOrdenadas } from './mesa-documento'
import { MesaEncabezado } from './mesa-encabezado'
import { MesaIndice } from './mesa-indice'
import { PanelDatos } from './panel-datos'
import { PendientesList } from './pendientes-list'
import { PreparacionMatriz } from './preparacion-matriz'
import { WorkflowAcciones } from './workflow-acciones'

/**
 * Orquestador de la mesa de escritura (SDD 010, research D7): decide entre
 * el estado de preparación (verificaciones del caso bloqueadas — jamás una
 * mesa parcial, regla heredada de SDD 008) y la mesa de lectura completa
 * (T013): encabezado con contexto, documento continuo, índice con reorden
 * y panel de datos con pendientes.
 */

export type MesaVista = 'preparacion' | 'mesa'

export function decideMesaVista(matriz: MatrizView): MesaVista {
  const verificacionesBloqueadas = matriz.approval_blockers.some(
    (blocker) => blocker.kind === 'readiness_gate'
  )
  return verificacionesBloqueadas ? 'preparacion' : 'mesa'
}

/** Resumen del caso para encabezado e índice (migrado del builder SDD 008). */
export function resumenDeMesa(matriz: MatrizView) {
  const desactivadas = matriz.clauses.filter((clause) => clause.disabled).length
  const fijas = matriz.clauses.filter((clause) => clause.fixed_position).length
  return {
    totalClausulas: matriz.clauses.length,
    desactivadas,
    fijas,
    pendientes: matriz.approval_blockers.length,
    datosFaltantes: matriz.resolution.missing_count,
    puedeEditar: matriz.status !== 'approved' && !matriz.snapshot_stale,
  }
}

/**
 * Mensaje humano de guardado: el conflicto de versión (otra persona guardó
 * primero) se comunica con el texto del diccionario, jamás con el código.
 */
export function mensajeDeGuardado(error: unknown): string {
  if (error instanceof MatrizClientError && error.status === 409) {
    return MESA_TEXT.conflictoGuardado
  }
  return MESA_TEXT.noSePudoGuardar
}

/** Overrides persistibles: solo cláusulas desactivadas o ya intervenidas. */
export function overridesDeLaMatriz(
  clauses: MatrizClauseView[]
): Record<string, MatrizClauseOverride> {
  return Object.fromEntries(
    clauses
      .filter((clause) => clause.disabled || clause.overridden)
      .map((clause) => [
        clause.clause_key,
        {
          disabled: clause.disabled,
          title: clause.title,
          content_json: clause.content_json,
        },
      ])
  )
}

type MesaEscrituraProps = {
  caseId?: string
  projectId?: string
  initialData?: MatrizCaseResponse | null
}

export function MesaEscritura({ caseId, projectId, initialData = null }: MesaEscrituraProps) {
  const missingSource = !initialData && !caseId && !projectId
  const [data, setData] = useState<MatrizCaseResponse | null>(initialData)
  const [isLoading, setIsLoading] = useState(!initialData && !missingSource)
  const [error, setError] = useState<string | null>(missingSource ? MESA_TEXT.noSePudoCargar : null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [clausulaActiva, setClausulaActiva] = useState<string | null>(null)
  const [borradores, setBorradores] = useState<Record<string, MatrizClauseOverride>>({})

  useEffect(() => {
    if (initialData || missingSource) return
    let active = true
    const loader = caseId ? getMatrizCase(caseId) : getMatrizProject(projectId as string)
    loader
      .then((response) => {
        if (active) setData(response)
      })
      .catch(() => {
        if (active) setError(MESA_TEXT.noSePudoCargar)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [caseId, projectId, initialData, missingSource])

  const matriz = data?.matriz ?? null
  const resumen = useMemo(() => (matriz ? resumenDeMesa(matriz) : null), [matriz])
  const ordenadas = useMemo(() => (matriz ? clausulasOrdenadas(matriz) : []), [matriz])

  function handleReordenar(reordenadas: MatrizClauseView[]) {
    setData((current) => {
      if (!current) return current
      return {
        ...current,
        matriz: {
          ...current.matriz,
          clauses: reordenadas,
          clause_order: reordenadas.map((clause) => clause.clause_key),
        },
      }
    })
  }

  function handleCambioClausula(clauseKey: string, content: ClauseContentJson) {
    setBorradores((current) => ({ ...current, [clauseKey]: { content_json: content } }))
  }

  async function handleGuardar() {
    if (!matriz || !resumen?.puedeEditar) return
    setGuardando(true)
    setAviso(null)
    try {
      const response = await saveMatriz(matriz.id, {
        version: matriz.version,
        clause_order: matriz.clause_order,
        clause_overrides: { ...overridesDeLaMatriz(matriz.clauses), ...borradores },
      })
      setData((current) => (current ? { ...current, matriz: response.matriz } : response))
      setBorradores({})
    } catch (err) {
      setAviso(mensajeDeGuardado(err))
    } finally {
      setGuardando(false)
    }
  }

  function handleWorkflowUpdate(response: MatrizCaseResponse) {
    setData(response)
    setBorradores({})
    setClausulaActiva(null)
    setAviso(null)
  }

  async function recargarMatriz() {
    const sourceProjectId = projectId ?? matriz?.project_id
    if (!caseId && !sourceProjectId) return
    try {
      const response = caseId
        ? await getMatrizCase(caseId)
        : await getMatrizProject(sourceProjectId as string)
      setData(response)
      setBorradores({})
      setAviso(null)
    } catch {
      setAviso(MESA_TEXT.noSePudoCargar)
    }
  }

  if (isLoading) {
    return (
      <div data-testid="mesa-escritura" className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    )
  }

  if (error || !data || !matriz || !resumen) {
    return (
      <div
        data-testid="mesa-escritura"
        className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error ?? MESA_TEXT.noSePudoCargar}
      </div>
    )
  }

  if (decideMesaVista(matriz) === 'preparacion') {
    return (
      <div data-testid="mesa-escritura">
        <EstadoPreparacion matriz={matriz} blockers={matriz.approval_blockers} />
      </div>
    )
  }

  return (
    <div data-testid="mesa-escritura" className="space-y-4">
      <MesaEncabezado
        matriz={matriz}
        puedeGuardar={resumen.puedeEditar}
        guardando={guardando}
        onGuardar={handleGuardar}
      />

      {aviso ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {aviso}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <MesaIndice
          clausulas={ordenadas}
          resolucion={matriz.resolution}
          puedeReordenar={resumen.puedeEditar}
          onReordenar={handleReordenar}
        />

        <MesaDocumento
          matriz={matriz}
          puedeEditar={resumen.puedeEditar}
          clausulaActiva={clausulaActiva}
          clausulasConCambios={Object.keys(borradores)}
          insertables={data.insertable_variables ?? []}
          onActivarClausula={setClausulaActiva}
          onCambioClausula={handleCambioClausula}
          onCerrarEditor={() => setClausulaActiva(null)}
        />

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
            <WorkflowAcciones matriz={matriz} onWorkflowUpdate={handleWorkflowUpdate} />
          </section>

          {matriz.approval_blockers.length > 0 ? (
            <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
              <h3 className="mb-3 text-sm font-semibold">{MESA_TEXT.pendientesTitle}</h3>
              {matriz.scope === 'project' ? (
                <PreparacionMatriz
                  projectId={matriz.project_id}
                  blockers={matriz.approval_blockers}
                  onResolved={recargarMatriz}
                />
              ) : (
                <PendientesList blockers={matriz.approval_blockers} compact />
              )}
            </section>
          ) : null}
          <PanelDatos resolucion={matriz.resolution} projectId={matriz.project_id} />
        </aside>
      </div>
    </div>
  )
}
