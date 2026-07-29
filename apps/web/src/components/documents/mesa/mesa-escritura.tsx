'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, ListViewIcon, Task01Icon } from '@hugeicons/core-free-icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  getMatrizCase,
  getMatrizProject,
  listMinutaGenerations,
  saveMatriz,
  stageOperationalVariables,
  MatrizClientError,
} from '@/lib/documents/matriz-client'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type {
  ApprovalBlocker,
  ClauseContentJson,
  MatrizCaseResponse,
  MatrizClauseOverride,
  MatrizClauseView,
  MatrizView,
  MinutaGeneration,
} from '@/lib/documents/matriz-types'
import { EstadoPreparacion } from './estado-preparacion'
import { HistorialGeneraciones } from './historial-generaciones'
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
export type CascadeMesaVista = 'completed' | 'exception' | 'awaiting_review' | 'legacy'

export function isInheritedProjectGateBlocker(blocker: ApprovalBlocker): boolean {
  return blocker.kind === 'readiness_gate' && blocker.inherited === true
}

export function visibleApprovalBlockers(blockers: ApprovalBlocker[]): ApprovalBlocker[] {
  return blockers.filter((blocker) => !isInheritedProjectGateBlocker(blocker))
}

/** La acción de aprobar/rechazar la revisión jurídica (T018) vive DENTRO de
 * la mesa (WorkflowAcciones). Si el gate legal_review_ready solo está
 * bloqueado por la acción en sí (cause=revision_juridica.estado, no por
 * datos previos faltantes como el abogado redactor), no puede ser un
 * pre-requisito para entrar a la mesa — eso crea un deadlock donde nunca
 * se puede completar la revisión porque la revisión pendiente bloquea el
 * único lugar donde se completa. Los demás gates siguen bloqueando: "jamás
 * una mesa parcial" (SDD 008) se mantiene para datos realmente faltantes. */
function isLegalReviewActionOnlyBlocker(blocker: ApprovalBlocker): boolean {
  return (
    blocker.kind === 'readiness_gate' &&
    blocker.gate === 'legal_review_ready' &&
    blocker.cause === 'revision_juridica.estado'
  )
}

export function decideMesaVista(matriz: MatrizView): MesaVista {
  if (matriz.cascade_status === 'completed' || matriz.cascade_status === 'exception') {
    return 'mesa'
  }
  const verificacionesBloqueadas = visibleApprovalBlockers(matriz.approval_blockers).some(
    (blocker) => blocker.kind === 'readiness_gate' && !isLegalReviewActionOnlyBlocker(blocker)
  )
  return verificacionesBloqueadas ? 'preparacion' : 'mesa'
}

export function decideCascadeMesaVista(matriz: MatrizView): CascadeMesaVista {
  return matriz.cascade_status ?? 'legacy'
}

/** Resumen del caso para encabezado e índice (migrado del builder SDD 008). */
export function resumenDeMesa(matriz: MatrizView) {
  const desactivadas = matriz.clauses.filter((clause) => clause.disabled).length
  const fijas = matriz.clauses.filter((clause) => clause.fixed_position).length
  return {
    totalClausulas: matriz.clauses.length,
    desactivadas,
    fijas,
    pendientes: visibleApprovalBlockers(matriz.approval_blockers).length,
    datosFaltantes: matriz.resolution.missing_count,
    puedeEditar: matriz.status !== 'approved' && !matriz.snapshot_stale,
  }
}

function useIsCompactMesa() {
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1279px)')
    const onChange = () => setIsCompact(mql.matches)
    mql.addEventListener('change', onChange)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsCompact(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isCompact
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
  const [verificando, setVerificando] = useState(false)
  const [clausulaActiva, setClausulaActiva] = useState<string | null>(null)
  const [borradores, setBorradores] = useState<Record<string, MatrizClauseOverride>>({})
  const [soloPendientes, setSoloPendientes] = useState(false)
  const isMobile = useIsMobile()
  const isCompact = useIsCompactMesa()
  const [indiceSheetOpen, setIndiceSheetOpen] = useState(false)
  const [datosSheetOpen, setDatosSheetOpen] = useState(false)
  const indiceTriggerRef = useRef<HTMLButtonElement | null>(null)
  const datosTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [generations, setGenerations] = useState<MinutaGeneration[]>([])

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
  const blockersVisibles = useMemo(
    () => (matriz ? visibleApprovalBlockers(matriz.approval_blockers) : []),
    [matriz]
  )
  const ordenadas = useMemo(() => (matriz ? clausulasOrdenadas(matriz) : []), [matriz])
  const cascadeVista = matriz ? decideCascadeMesaVista(matriz) : 'legacy'

  useEffect(() => {
    const escrituraCaseId = matriz?.escritura_case_id
    if (!escrituraCaseId || cascadeVista !== 'completed') {
      return
    }
    let active = true
    listMinutaGenerations(escrituraCaseId)
      .then((response) => {
        if (active) setGenerations(response.generations)
      })
      .catch(() => {
        if (active) setGenerations([])
      })
    return () => {
      active = false
    }
  }, [matriz?.escritura_case_id, cascadeVista])

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

  /** Interruptor manual de la cláusula (no aplica a las de posición fija). */
  function handleToggleDisabled(clauseKey: string) {
    setData((current) => {
      if (!current) return current
      const clauses = current.matriz.clauses.map((clause) =>
        clause.clause_key === clauseKey && !clause.fixed_position
          ? { ...clause, disabled: !clause.disabled }
          : clause
      )
      return { ...current, matriz: { ...current.matriz, clauses } }
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

  async function handleVerificar() {
    const escrituraCaseId = matriz?.escritura_case_id
    if (!escrituraCaseId) {
      window.location.reload()
      return
    }
    setVerificando(true)
    setAviso(null)
    try {
      await stageOperationalVariables(escrituraCaseId)
      await recargarMatriz()
    } catch {
      setAviso(MESA_TEXT.noSePudoVerificar)
    } finally {
      setVerificando(false)
    }
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
        role="alert"
        className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error ?? MESA_TEXT.noSePudoCargar}
      </div>
    )
  }

  if (decideMesaVista(matriz) === 'preparacion') {
    return (
      <div data-testid="mesa-escritura">
        <EstadoPreparacion matriz={matriz} blockers={blockersVisibles} />
      </div>
    )
  }

  const indiceContent = (
    <MesaIndice
      clausulas={ordenadas}
      resolucion={matriz.resolution}
      scope={matriz.scope}
      soloPendientes={soloPendientes}
      puedeReordenar={resumen.puedeEditar}
      onReordenar={handleReordenar}
      onToggleDisabled={handleToggleDisabled}
    />
  )

  const datosContent = (
    <div className="space-y-4">
      {cascadeVista === 'completed' ? (
        <section className="rounded-lg border border-success/30 bg-success/10 p-4 text-card-foreground">
          <h3 className="text-sm font-semibold text-success">{MESA_TEXT.minutaEntregadaTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {MESA_TEXT.minutaEntregadaDescription}
          </p>
          {matriz.approval_origin === 'system' ? (
            <p className="mt-2 text-xs text-muted-foreground">{MESA_TEXT.trazabilidadSistema}</p>
          ) : null}
          {matriz.cascade_last_run_at ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {MESA_TEXT.ultimaCorrida}:{' '}
              {new Date(matriz.cascade_last_run_at).toLocaleString('es-CL')}
            </p>
          ) : null}
        </section>
      ) : null}

      {cascadeVista === 'exception' ? (
        <section className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-card-foreground">
          <h3 className="text-sm font-semibold text-warning">{MESA_TEXT.excepcionTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{MESA_TEXT.excepcionDescription}</p>
          {matriz.cascade_last_run_at ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {MESA_TEXT.ultimaCorrida}:{' '}
              {new Date(matriz.cascade_last_run_at).toLocaleString('es-CL')}
            </p>
          ) : null}
          <div className="mt-3">
            <PendientesList
              blockers={
                (matriz.cascade_causes as ApprovalBlocker[] | undefined) ?? blockersVisibles
              }
              compact
            />
          </div>
        </section>
      ) : null}

      {cascadeVista === 'awaiting_review' ? (
        <section className="rounded-lg border border-info/30 bg-info/10 p-4 text-card-foreground">
          <h3 className="text-sm font-semibold text-info">{MESA_TEXT.esperandoRevisionJuridica}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {MESA_TEXT.esperandoRevisionDescription}
          </p>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <WorkflowAcciones matriz={matriz} onWorkflowUpdate={handleWorkflowUpdate} />
      </section>

      {cascadeVista === 'completed' ? <HistorialGeneraciones generations={generations} /> : null}

      {blockersVisibles.length > 0 && cascadeVista !== 'completed' ? (
        <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          <h3 className="mb-3 text-sm font-semibold">{MESA_TEXT.pendientesTitle}</h3>
          {matriz.scope === 'project' ? (
            <PreparacionMatriz
              projectId={matriz.project_id}
              blockers={blockersVisibles}
              onResolved={recargarMatriz}
            />
          ) : (
            <PendientesList blockers={blockersVisibles} compact />
          )}
        </section>
      ) : null}
      <PanelDatos
        resolucion={matriz.resolution}
        projectId={matriz.project_id}
        scope={matriz.scope}
        soloPendientes={soloPendientes}
      />
    </div>
  )

  const encabezado = (
    <MesaEncabezado
      matriz={matriz}
      puedeGuardar={resumen.puedeEditar}
      guardando={guardando}
      onGuardar={handleGuardar}
      onVerificar={handleVerificar}
      verificando={verificando}
      soloPendientes={soloPendientes}
      onSoloPendientesChange={setSoloPendientes}
    />
  )

  const avisoBanner = aviso ? (
    <div
      role="alert"
      className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {aviso}
    </div>
  ) : null

  const pendientesCount = matriz.resolution.missing_count

  const supportSheets = (
    <>
      <Sheet open={indiceSheetOpen} onOpenChange={setIndiceSheetOpen}>
        <SheetContent
          data-testid="sheet-mesa"
          side="bottom"
          className="flex h-[80dvh] flex-col overflow-hidden rounded-t-2xl p-0"
          onCloseAutoFocus={(event) => {
            if (!indiceTriggerRef.current) return
            event.preventDefault()
            indiceTriggerRef.current.focus()
          }}
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest('a[href^="#clausula-"]')) {
              setIndiceSheetOpen(false)
            }
          }}
        >
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle>{MESA_TEXT.indiceTitle}</SheetTitle>
            <SheetDescription>Navega las cláusulas y pendientes de la escritura.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="p-4">{indiceContent}</div>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet open={datosSheetOpen} onOpenChange={setDatosSheetOpen}>
        <SheetContent
          data-testid="sheet-mesa"
          side="bottom"
          showCloseButton={false}
          className="flex h-[80dvh] flex-col overflow-hidden rounded-t-2xl p-0"
          onCloseAutoFocus={(event) => {
            if (!datosTriggerRef.current) return
            event.preventDefault()
            datosTriggerRef.current.focus()
          }}
        >
          <SheetHeader className="border-b border-border px-4 py-3 pr-14 text-left">
            <SheetTitle>Datos y acciones</SheetTitle>
            <SheetDescription>
              Revisa estados, errores, pendientes y acciones de la escritura.
            </SheetDescription>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-3 top-2 min-h-11"
              >
                <HugeiconsIcon icon={Cancel01Icon} aria-hidden />
                Cerrar
              </Button>
            </SheetClose>
          </SheetHeader>
          <SheetBody aria-live="polite">
            <div className="p-4">{datosContent}</div>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )

  const compactActions =
    typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-x-0 bottom-0 z-50 flex gap-2 border-t border-border bg-card/95 py-3 pl-20 pr-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:p-3 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] xl:hidden">
            <Button
              ref={indiceTriggerRef}
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              onClick={() => setIndiceSheetOpen(true)}
            >
              <HugeiconsIcon icon={ListViewIcon} />
              {MESA_TEXT.indiceTitle}
            </Button>
            <Button
              ref={datosTriggerRef}
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              onClick={() => setDatosSheetOpen(true)}
            >
              <HugeiconsIcon icon={Task01Icon} />
              Datos y acciones
              {pendientesCount > 0 ? (
                <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                  {pendientesCount}
                </Badge>
              ) : null}
            </Button>
          </div>,
          document.body
        )
      : null

  if (isCompact || isMobile) {
    return (
      <>
        <div
          data-testid="mesa-escritura"
          className="space-y-4 rounded-2xl bg-background/70 p-4 pb-28 shadow-sm ring-1 ring-border/40 sm:p-5"
        >
          {encabezado}
          {avisoBanner}

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
        </div>
        {compactActions}
        {supportSheets}
      </>
    )
  }

  return (
    <div
      data-testid="mesa-escritura"
      className="space-y-4 rounded-2xl bg-background/70 p-4 shadow-sm ring-1 ring-border/40 sm:p-5"
    >
      {encabezado}
      {avisoBanner}

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className="sticky top-24 self-start">{indiceContent}</aside>

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

        <aside className="sticky top-24 max-h-[calc(100dvh-7rem)] space-y-4 overflow-auto pr-1">
          {datosContent}
        </aside>
      </div>
    </div>
  )
}
