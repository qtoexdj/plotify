'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  LEGAL_DOCUMENT_TYPE_LABELS,
  type DocumentEvidence,
} from '@/lib/legal/variable-resolution-types'

interface LegalEvidenceViewerProps {
  evidence: DocumentEvidence[]
  isLoading?: boolean
  error?: string | null
  compact?: boolean
}

function formatConfidence(confidence: number | null | undefined) {
  if (confidence === null || confidence === undefined) return 'Sin confianza'
  return `${Math.round(confidence * 100)}% confianza`
}

function formatPage(evidence: DocumentEvidence) {
  const page = evidence.page_number ? `Pagina ${evidence.page_number}` : 'Pagina sin registrar'
  const kind = evidence.page_kind ? ` (${evidence.page_kind})` : ''
  return `${page}${kind}`
}

function safeEvidenceUrl(sourceUrl: string | null | undefined) {
  if (!sourceUrl) return null
  try {
    const parsed = new URL(sourceUrl, 'https://plotify.local')
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null
    }
    return sourceUrl
  } catch {
    return null
  }
}

export function LegalEvidenceViewer({
  evidence,
  isLoading = false,
  error = null,
  compact = false,
}: LegalEvidenceViewerProps) {
  const content = (
    <>
      {isLoading ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Cargando evidencia documental...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : evidence.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          Esta variable no tiene evidencia documental asociada.
        </div>
      ) : (
        <div className="space-y-3">
          {evidence.map((item, index) => {
            const sourceUrl = safeEvidenceUrl(item.source_url)
            return (
              <article
                key={item.id ?? `${item.legal_document_id}-${item.page_number ?? 'page'}-${index}`}
                className="rounded-lg border bg-card p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-medium">
                      {item.document_name ?? 'Documento legal'}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{formatPage(item)}</span>
                      {item.document_type ? (
                        <span>{LEGAL_DOCUMENT_TYPE_LABELS[item.document_type]}</span>
                      ) : null}
                      {item.chunk_index !== null && item.chunk_index !== undefined ? (
                        <span>Fragmento {item.chunk_index}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline">{formatConfidence(item.confidence)}</Badge>
                    {sourceUrl ? (
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a href={sourceUrl} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>

                <blockquote
                  className={cn(
                    'mt-3 rounded-md border-l-4 border-primary/30 bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground',
                    !item.snippet && 'text-muted-foreground'
                  )}
                >
                  {item.snippet ?? 'Sin fragmento de texto disponible.'}
                </blockquote>
              </article>
            )
          })}
        </div>
      )}
    </>
  )

  if (compact) {
    return (
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Evidencia</h3>
          <p className="text-sm text-muted-foreground">
            Fragmentos usados para respaldar el valor actual.
          </p>
        </div>
        {content}
      </section>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidencia documental</CardTitle>
        <CardDescription>
          Documento, pagina, confianza y fragmento de respaldo de la variable seleccionada.
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}
