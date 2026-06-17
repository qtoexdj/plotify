'use client'

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type {
  ClauseContentJson,
  MatrizClauseView,
  ResolutionManifest,
} from '@/lib/documents/matriz-types'
import { esClausulaOmitida } from './mesa-documento'

/**
 * Índice del documento (SDD 010 T013, FR-011): navegación por cláusula con
 * su estado y reordenamiento por arrastre con las fijas ancladas. La lógica
 * de reorden migra intacta del builder de SDD 008 (contrato de no-regresión
 * SC-006): una cláusula fija jamás se mueve ni sirve de destino.
 */

export function reordenarClausulas(
  clauses: MatrizClauseView[],
  activeKey: string,
  overKey: string
): MatrizClauseView[] {
  if (activeKey === overKey) return clauses
  const activa = clauses.find((clause) => clause.clause_key === activeKey)
  const destino = clauses.find((clause) => clause.clause_key === overKey)
  if (!activa || !destino || activa.fixed_position || destino.fixed_position) {
    return clauses
  }

  const movibles = clauses
    .filter((clause) => !clause.fixed_position)
    .map((clause) => clause.clause_key)
  const desde = movibles.indexOf(activeKey)
  const hasta = movibles.indexOf(overKey)
  if (desde === -1 || hasta === -1 || desde === hasta) return clauses

  const moviblesReordenadas = arrayMove(movibles, desde, hasta)
  const porClave = new Map(clauses.map((clause) => [clause.clause_key, clause]))
  let movibleIndex = 0
  return clauses.map((clause, position) => {
    if (clause.fixed_position) {
      return { ...clause, position }
    }
    const siguienteClave = moviblesReordenadas[movibleIndex++]
    const siguiente = porClave.get(siguienteClave) ?? clause
    return { ...siguiente, position }
  })
}

function clavesDeDatos(content: ClauseContentJson | null): Set<string> {
  const claves = new Set<string>()
  const recorrer = (nodes: unknown[]) => {
    for (const value of nodes) {
      if (!value || typeof value !== 'object') continue
      const node = value as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
      if (node.type === 'variable_token') {
        const clave = String(node.attrs?.variableKey ?? '')
        if (clave) claves.add(clave)
        continue
      }
      if (node.content) recorrer(node.content)
    }
  }
  if (content) recorrer(content.content)
  return claves
}

/** Datos de la cláusula aún no verificados, para el estado del índice. */
export function pendientesDeClausula(
  clause: MatrizClauseView,
  resolucion: ResolutionManifest
): number {
  const claves = clavesDeDatos(clause.content_json)
  let pendientes = 0
  for (const dato of resolucion.tokens) {
    if (claves.has(dato.variableKey) && dato.status !== 'resolved') pendientes += 1
  }
  return pendientes
}

type FilaIndiceProps = {
  clause: MatrizClauseView
  pendientes: number
  omitida: boolean
  puedeReordenar: boolean
}

function FilaIndice({ clause, pendientes, omitida, puedeReordenar }: FilaIndiceProps) {
  const arrastreDeshabilitado = !puedeReordenar || clause.fixed_position
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: clause.clause_key,
    disabled: arrastreDeshabilitado,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`mesa-indice-${clause.clause_key}`}
      className={cn(
        'grid grid-cols-[2rem_minmax(0,1fr)] items-stretch rounded-md border border-transparent text-sm transition-colors hover:bg-muted',
        isDragging && 'z-10 border-border opacity-70 shadow-sm'
      )}
    >
      <Button
        ref={setActivatorNodeRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={arrastreDeshabilitado}
        aria-label={clause.fixed_position ? MESA_TEXT.posicionFija : MESA_TEXT.reordenarClausula}
        className="h-full rounded-md text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        {clause.fixed_position ? <LockKeyhole /> : <GripVertical />}
      </Button>
      <a href={`#clausula-${clause.clause_key}`} className="min-w-0 px-2 py-1.5">
        <span className={cn('block truncate font-medium', omitida && 'text-muted-foreground')}>
          {clause.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {omitida ? (
            MESA_TEXT.noAplicaCorto
          ) : pendientes > 0 ? (
            <span className="text-amber-700">{pendientes} por completar</span>
          ) : (
            MESA_TEXT.clausulaCompleta
          )}
        </span>
      </a>
    </div>
  )
}

type MesaIndiceProps = {
  clausulas: MatrizClauseView[]
  resolucion: ResolutionManifest
  puedeReordenar: boolean
  onReordenar: (clausulas: MatrizClauseView[]) => void
}

export function MesaIndice({
  clausulas,
  resolucion,
  puedeReordenar,
  onReordenar,
}: MesaIndiceProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    if (!puedeReordenar || !event.over) return
    const reordenadas = reordenarClausulas(
      clausulas,
      String(event.active.id),
      String(event.over.id)
    )
    if (reordenadas === clausulas) return
    onReordenar(reordenadas)
  }

  return (
    <nav
      data-testid="mesa-indice"
      aria-label={MESA_TEXT.indiceTitle}
      className="rounded-lg border border-border bg-card text-card-foreground"
    >
      <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
        {MESA_TEXT.indiceTitle}
      </h3>
      <div className="max-h-[70vh] overflow-auto p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={clausulas.map((clause) => clause.clause_key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-0.5">
              {clausulas.map((clause) => (
                <FilaIndice
                  key={clause.clause_key}
                  clause={clause}
                  pendientes={pendientesDeClausula(clause, resolucion)}
                  omitida={esClausulaOmitida(clause)}
                  puedeReordenar={puedeReordenar}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </nav>
  )
}
