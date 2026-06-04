'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

type LegalDocumentStatusItem = LegalDocumentListItem | LegalDocument

interface LegalDocumentStatusPanelProps {
  documents: LegalDocumentStatusItem[]
  isLoading?: boolean
  error?: string | null
  onRetryDocument?: (document: LegalDocumentStatusItem) => void
  onOpenControlCenter?: () => void
}

const statusClassName: Record<LegalExtractionStatus, string> = {
  pending: 'border-slate-200 bg-slate-50 text-slate-700',
  queued: 'border-sky-200 bg-sky-50 text-sky-700',
  processing: 'border-blue-200 bg-blue-50 text-blue-700',
  text_extracted: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  variables_proposed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  needs_review: 'border-amber-200 bg-amber-50 text-amber-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  superseded: 'border-zinc-200 bg-zinc-50 text-zinc-600',
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
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Documentos legales</CardTitle>
          <CardDescription>
            Estado de extraccion y variables propuestas desde las fuentes del proyecto.
          </CardDescription>
        </div>
        {onOpenControlCenter ? (
          <Button
            type="button"
            variant={needsReviewCount > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={onOpenControlCenter}
          >
            Revisar variables
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Cargando documentos legales...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            No hay documentos legales registrados para este proyecto.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Variables</TableHead>
                <TableHead className="text-right">Version</TableHead>
                <TableHead>Subido</TableHead>
                <TableHead className="text-right">Accion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((document) => {
                const summary = getSummary(document)
                return (
                  <TableRow key={document.id}>
                    <TableCell className="max-w-64">
                      <div className="truncate font-medium">{document.original_filename}</div>
                      <div className="text-xs text-muted-foreground">{summary.pages} paginas</div>
                    </TableCell>
                    <TableCell>
                      {LEGAL_DOCUMENT_TYPE_LABELS[document.document_type] ?? document.document_type}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(statusClassName[document.extraction_status])}
                      >
                        {LEGAL_EXTRACTION_STATUS_LABELS[document.extraction_status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-mono text-sm">{summary.variables_proposed}</div>
                      {(summary.variables_conflict > 0 || summary.variables_missing > 0) && (
                        <div className="text-xs text-muted-foreground">
                          {summary.variables_conflict} conflicto, {summary.variables_missing}{' '}
                          faltante
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      v{document.version_number}
                    </TableCell>
                    <TableCell>{formatDate(getUploadedAt(document))}</TableCell>
                    <TableCell className="text-right">
                      {document.extraction_status === 'failed' && onRetryDocument ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onRetryDocument(document)}
                        >
                          Reintentar
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">--</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
