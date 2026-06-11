'use client'

import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { MatrizBuilder } from '@/components/documents/matriz/matriz-builder'
import { getMatrizCase } from '@/lib/documents/matriz-client'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { MatrizCaseResponse, MatrizView } from '@/lib/documents/matriz-types'
import { EstadoPreparacion } from './estado-preparacion'

/**
 * Orquestador de la mesa de escritura (SDD 010, research D7): decide entre
 * el estado de preparación (verificaciones del caso bloqueadas — jamás una
 * mesa parcial, regla heredada de SDD 008) y la mesa de lectura.
 *
 * Transición fases 3→4: la rama "mesa" delega temporalmente en el builder
 * anterior; T013 la reemplaza por el documento continuo y T020 retira el
 * builder.
 */

export type MesaVista = 'preparacion' | 'mesa'

export function decideMesaVista(matriz: MatrizView): MesaVista {
  const verificacionesBloqueadas = matriz.approval_blockers.some(
    (blocker) => blocker.kind === 'readiness_gate'
  )
  return verificacionesBloqueadas ? 'preparacion' : 'mesa'
}

type MesaEscrituraProps = {
  caseId: string
  initialData?: MatrizCaseResponse | null
}

export function MesaEscritura({ caseId, initialData = null }: MesaEscrituraProps) {
  const [data, setData] = useState<MatrizCaseResponse | null>(initialData)
  const [isLoading, setIsLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialData) return
    let active = true
    getMatrizCase(caseId)
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
  }, [caseId, initialData])

  if (isLoading) {
    return (
      <div data-testid="mesa-escritura" className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div
        data-testid="mesa-escritura"
        className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
      >
        {error ?? MESA_TEXT.noSePudoCargar}
      </div>
    )
  }

  const vista = decideMesaVista(data.matriz)

  return (
    <div data-testid="mesa-escritura">
      {vista === 'preparacion' ? (
        <EstadoPreparacion matriz={data.matriz} blockers={data.matriz.approval_blockers} />
      ) : (
        <MatrizBuilder caseId={caseId} initialData={data} />
      )}
    </div>
  )
}
