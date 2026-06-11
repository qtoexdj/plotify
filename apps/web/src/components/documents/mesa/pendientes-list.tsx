import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { ApprovalBlocker } from '@/lib/documents/matriz-types'

/**
 * Lista de pendientes humanizados (SDD 010 FR-005). Los textos llegan ya
 * redactados desde el API (`title`/`description`/`action_label`); este
 * componente jamás traduce códigos. Reusado por el estado de preparación y
 * por el panel lateral de la mesa.
 */

export function pendienteTitle(blocker: ApprovalBlocker): string {
  return blocker.title?.trim() || blocker.description?.trim() || MESA_TEXT.pendienteGenerico
}

export function pendienteHref(blocker: ApprovalBlocker): string | null {
  if (blocker.action_href?.trim()) return blocker.action_href
  if ('fix_url' in blocker && blocker.fix_url?.trim()) return blocker.fix_url
  return null
}

type PendientesListProps = {
  blockers: ApprovalBlocker[]
  compact?: boolean
}

export function PendientesList({ blockers, compact = false }: PendientesListProps) {
  if (blockers.length === 0) {
    return (
      <p data-testid="pendientes-list" className="text-sm text-muted-foreground">
        {MESA_TEXT.sinPendientes}
      </p>
    )
  }

  return (
    <ul data-testid="pendientes-list" className="space-y-2">
      {blockers.map((blocker, index) => {
        const href = pendienteHref(blocker)
        return (
          <li
            key={`${blocker.kind}-${index}`}
            className={`rounded-md border border-amber-200 bg-card ${compact ? 'p-2.5' : 'p-3'}`}
          >
            <p className="text-sm font-medium text-foreground">{pendienteTitle(blocker)}</p>
            {blocker.description && blocker.description !== blocker.title ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{blocker.description}</p>
            ) : null}
            {href && blocker.action_label ? (
              <Link
                href={href}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                {blocker.action_label}
                <ArrowRight className="size-3" />
              </Link>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
