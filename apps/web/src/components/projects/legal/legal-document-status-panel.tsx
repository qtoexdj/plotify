'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  LEGAL_DOCUMENT_TYPE_LABELS,
  LEGAL_EXTRACTION_STATUS_LABELS,
  type LegalDocument,
  type LegalDocumentListItem,
  type LegalExtractionStatus,
} from '@/lib/legal/variable-resolution-types'
import { HugeiconsIcon } from '@hugeicons/react'
import { File02Icon, AlertCircleIcon, Refresh01Icon } from '@hugeicons/core-free-icons'

type LegalDocumentStatusItem = LegalDocumentListItem | LegalDocument

interface LegalDocumentStatusPanelProps {
  documents: LegalDocumentStatusItem[]
  isLoading?: boolean
  error?: string | null
  onRetryDocument?: (document: LegalDocumentStatusItem) => void
  onOpenControlCenter?: () => void
}

const statusClassName: Record<LegalExtractionStatus, string> = {
  pending: 'border-slate-200/50 bg-slate-500/10 text-slate-600 dark:text-slate-400',
  queued: 'border-sky-200/50 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  processing: 'border-blue-200/50 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  text_extracted: 'border-indigo-200/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  variables_proposed:
    'border-emerald-200/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  needs_review: 'border-amber-200/50 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'border-red-200/50 bg-red-500/10 text-red-600 dark:text-red-400',
  superseded: 'border-zinc-200/50 bg-zinc-500/10 text-zinc-500 dark:text-zinc-400',
}

function getUploadedAt(document: LegalDocumentStatusItem) {
  return 'uploaded_at' in document ? document.uploaded_at : document.created_at
}

function getSummary(document: LegalDocumentStatusItem) {
  if ('summary' in document) return document.summary
  return {
    pages: 0,
    variables_proposed: 0,
    variables_conflict: 0,
    variables_missing: 0,
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '--'
  return new Date(value).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function LegalDocumentStatusPanel({
  documents,
  isLoading = false,
  error = null,
  onRetryDocument,
  onOpenControlCenter,
}: LegalDocumentStatusPanelProps) {
  const needsReviewCount = documents.filter((document) =>
    ['needs_review', 'failed'].includes(document.extraction_status)
  ).length

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-muted/10">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Documentos legales
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estado de extracción y variables propuestas desde las fuentes del proyecto.
          </p>
        </div>
        {onOpenControlCenter ? (
          <Button
            type="button"
            variant={needsReviewCount > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={onOpenControlCenter}
            className="self-start sm:self-auto h-8 text-xs transition-all duration-200"
          >
            Revisar variables
          </Button>
        ) : null}
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-2 border border-dashed border-border rounded-lg">
            <HugeiconsIcon icon={Refresh01Icon} className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs">Cargando documentos legales...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20 flex items-center gap-2">
            <HugeiconsIcon icon={AlertCircleIcon} className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg">
            <HugeiconsIcon icon={File02Icon} className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs">No hay documentos legales registrados para este proyecto.</p>
          </div>
        ) : (
          <div className="overflow-hidden border border-border rounded-lg bg-muted/5">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20 border-b border-border">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="py-2.5 px-3 font-semibold text-xs uppercase text-muted-foreground">
                      Documento
                    </TableHead>
                    <TableHead className="py-2.5 px-3 font-semibold text-xs uppercase text-muted-foreground">
                      Tipo
                    </TableHead>
                    <TableHead className="py-2.5 px-3 font-semibold text-xs uppercase text-muted-foreground">
                      Estado
                    </TableHead>
                    <TableHead className="py-2.5 px-3 font-semibold text-xs uppercase text-muted-foreground text-right">
                      Variables
                    </TableHead>
                    <TableHead className="py-2.5 px-3 font-semibold text-xs uppercase text-muted-foreground text-right">
                      Versión
                    </TableHead>
                    <TableHead className="py-2.5 px-3 font-semibold text-xs uppercase text-muted-foreground">
                      Subido
                    </TableHead>
                    <TableHead className="py-2.5 px-3 font-semibold text-xs uppercase text-muted-foreground text-right">
                      Acción
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/50">
                  {documents.map((document) => {
                    const summary = getSummary(document)
                    return (
                      <TableRow
                        key={document.id}
                        className="align-middle hover:bg-muted/10 transition-colors"
                      >
                        <TableCell className="py-3 px-3 max-w-64">
                          <div className="truncate font-medium text-xs text-foreground">
                            {document.original_filename}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {summary.pages} páginas
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-3 text-xs text-muted-foreground">
                          {LEGAL_DOCUMENT_TYPE_LABELS[document.document_type] ??
                            document.document_type}
                        </TableCell>
                        <TableCell className="py-3 px-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] px-1.5 py-0 border',
                              statusClassName[document.extraction_status]
                            )}
                          >
                            {LEGAL_EXTRACTION_STATUS_LABELS[document.extraction_status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 px-3 text-right">
                          <div className="font-mono text-xs text-foreground font-semibold">
                            {summary.variables_proposed}
                          </div>
                          {(summary.variables_conflict > 0 || summary.variables_missing > 0) && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {summary.variables_conflict} conf, {summary.variables_missing} falt
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-right font-mono text-xs text-foreground">
                          v{document.version_number}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-xs text-muted-foreground">
                          {formatDate(getUploadedAt(document))}
                        </TableCell>
                        <TableCell className="py-3 px-3 text-right">
                          {document.extraction_status === 'failed' && onRetryDocument ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onRetryDocument(document)}
                              className="h-7 text-xs px-2.5 transition-all duration-150"
                            >
                              Reintentar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
