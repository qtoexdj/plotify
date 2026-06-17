'use client'

import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LegalEvidenceViewer } from '@/components/projects/legal/legal-evidence-viewer'
import { MESA_TEXT, datoStatusLabel } from '@/lib/documents/matriz-microcopy'
import type { DocumentEvidence } from '@/lib/legal/variable-resolution-types'
import type { MatrizEvidenceRef, TokenResolutionStatus } from '@/lib/documents/matriz-types'

/**
 * Popover de evidencia del dato (SDD 010 T011, FR-003, wireframe 3
 * aprobado): nombre humano, valor, respaldo documental (visor compacto) o
 * descripción del origen operacional, y la única salida de corrección — la
 * navegación al Centro de Control Legal. La mesa jamás edita el valor.
 * Esc cierra y devuelve el foco al chip (comportamiento del Popover).
 */

export function urlCorreccion(projectId: string, variableKey?: string | null): string {
  const params = new URLSearchParams({ tab: 'legal' })
  if (variableKey) params.set('variable', variableKey)
  return `/projects/${encodeURIComponent(projectId)}?${params.toString()}`
}

/** Refs del manifiesto → evidencia del visor legal (SDD 007), sin lookups. */
export function evidenciaDocumental(refs: MatrizEvidenceRef[]): DocumentEvidence[] {
  return refs.map((ref, index) => {
    const documentoId = ref.legal_document_id ?? 'sin-documento'
    return {
      id: ref.legal_document_page_id ?? `evidencia-${documentoId}-${index}`,
      legal_document_id: documentoId,
      legal_document_page_id: ref.legal_document_page_id,
      page_number: ref.page_number,
      snippet: ref.snippet,
      confidence: null,
    }
  })
}

const BADGE_ESTADO = {
  resolved: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  blocked: 'border-sky-300 bg-sky-50 text-sky-900',
  missing: 'border-amber-300 bg-amber-50 text-amber-900',
} as const satisfies Record<TokenResolutionStatus, string>

type DatoPopoverProps = {
  projectId: string
  variableKey: string
  label: string
  estado: TokenResolutionStatus
  valor: string | null
  evidencia: MatrizEvidenceRef[]
  origen?: string | null
  children: ReactNode
}

export function DatoPopover({
  projectId,
  variableKey,
  label,
  estado,
  valor,
  evidencia,
  origen = null,
  children,
}: DatoPopoverProps) {
  const documentos = evidenciaDocumental(evidencia)

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        data-testid="dato-popover"
        align="start"
        className="w-96 max-w-[calc(100vw-2rem)] space-y-3 font-sans"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-semibold">{label}</p>
          <Badge variant="outline" className={BADGE_ESTADO[estado]}>
            {datoStatusLabel(estado)}
          </Badge>
        </div>

        <p className="text-sm">
          {valor ?? <span className="text-muted-foreground">{MESA_TEXT.datoSinValor}</span>}
        </p>

        {documentos.length > 0 ? (
          <LegalEvidenceViewer evidence={documentos} compact />
        ) : origen ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {origen}
          </p>
        ) : null}

        <Button type="button" variant="outline" size="sm" asChild className="w-full">
          <a href={urlCorreccion(projectId, variableKey)}>
            {MESA_TEXT.corregirEnControlLegal}
            <ExternalLink aria-hidden />
          </a>
        </Button>
      </PopoverContent>
    </Popover>
  )
}
