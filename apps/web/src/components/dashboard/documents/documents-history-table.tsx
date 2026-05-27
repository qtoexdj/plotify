'use client'

import { useState, useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Download05Icon,
  FileAttachmentIcon,
  File02Icon,
  Search01Icon,
  Calendar01Icon,
  CheckmarkSquare01Icon,
  CancelSquareIcon,
} from '@hugeicons/core-free-icons'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { GeneratedDocument } from '@/types/v2'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type DocWithTemplate = GeneratedDocument & {
  document_templates?: { name: string; document_type: string } | null
  lots?: { numero_lote: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  pdf: { label: 'PDF', variant: 'default' },
  docx: { label: 'DOCX', variant: 'secondary' },
}

const DOCTYPE_LABELS: Record<string, string> = {
  compraventa: 'Compraventa',
  promesa: 'Promesa de C/V',
  mandato: 'Mandato',
  servidumbre: 'Servidumbre',
  poder: 'Poder Notarial',
  otro: 'Otro',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateEmail(actor: string | null): string {
  if (!actor) return '—'
  if (actor.includes('@')) {
    const [local] = actor.split('@')
    return local.length > 12 ? local.slice(0, 12) + '…' : local
  }
  return actor.length > 14 ? actor.slice(0, 14) + '…' : actor
}

// ─── Componente principal ────────────────────────────────────────────────────

interface DocumentsHistoryTableProps {
  documents: DocWithTemplate[]
}

export function DocumentsHistoryTable({ documents }: DocumentsHistoryTableProps) {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('todos')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      // Filtro texto (template name o tipo o lote)
      if (search) {
        const q = search.toLowerCase()
        const templateName = doc.document_templates?.name?.toLowerCase() ?? ''
        const docType = doc.document_type.toLowerCase()
        const lotNumber = doc.lots?.numero_lote?.toLowerCase() ?? ''
        const actor = (doc.generated_by ?? '').toLowerCase()
        if (
          !templateName.includes(q) &&
          !docType.includes(q) &&
          !lotNumber.includes(q) &&
          !actor.includes(q)
        )
          return false
      }
      // Filtro tipo de documento
      if (filterType !== 'todos' && doc.document_type !== filterType) return false
      // Filtro fecha desde
      if (filterFrom && doc.created_at) {
        if (new Date(doc.created_at) < new Date(filterFrom)) return false
      }
      // Filtro fecha hasta
      if (filterTo && doc.created_at) {
        const to = new Date(filterTo)
        to.setHours(23, 59, 59, 999)
        if (new Date(doc.created_at) > to) return false
      }
      return true
    })
  }, [documents, search, filterType, filterFrom, filterTo])

  const uniqueTypes = useMemo(() => {
    return Array.from(new Set(documents.map((d) => d.document_type)))
  }, [documents])

  function handleDownload(fileUrl: string, format: string) {
    const a = document.createElement('a')
    a.href = fileUrl
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.download = `documento.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon icon={FileAttachmentIcon} className="w-5 h-5 text-blue-600" />
          Documentos Generados
        </CardTitle>
        <CardDescription>
          Historial de escrituras y documentos legales generados por la organización.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Barra de filtros ───────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-50">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            />
            <Input
              placeholder="Buscar por plantilla, lote o usuario…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-45">
              <SelectValue placeholder="Tipo de documento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tipos</SelectItem>
              {uniqueTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {DOCTYPE_LABELS[type] ?? type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Calendar01Icon}
              className="w-4 h-4 text-muted-foreground shrink-0"
            />
            <Input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-35"
              title="Desde"
            />
            <span className="text-muted-foreground text-sm">–</span>
            <Input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="w-35"
              title="Hasta"
            />
          </div>
        </div>

        {/* ── Tabla ─────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
            <HugeiconsIcon icon={File02Icon} className="w-12 h-12 text-gray-300" />
            <p className="text-sm">
              {documents.length === 0
                ? 'Aún no se han generado documentos.'
                : 'No hay documentos que coincidan con los filtros.'}
            </p>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ver.</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Plantilla</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead>Generado por</TableHead>
                  <TableHead>Destinatarios</TableHead>
                  <TableHead className="text-center" title="¿Blancos aceptados?">
                    Blancos
                  </TableHead>
                  <TableHead>Generado el</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc) => {
                  const fmt = FORMAT_LABELS[doc.file_format] ?? {
                    label: doc.file_format.toUpperCase(),
                    variant: 'outline' as const,
                  }
                  return (
                    <TableRow key={doc.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        v{doc.version_number ?? 1}
                      </TableCell>
                      <TableCell className="text-sm font-medium whitespace-nowrap">
                        {doc.lots?.numero_lote ?? '—'}
                      </TableCell>
                      <TableCell className="font-medium">
                        {doc.document_templates?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {DOCTYPE_LABELS[doc.document_type] ?? doc.document_type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={fmt.variant}>{fmt.label}</Badge>
                      </TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground whitespace-nowrap"
                        title={doc.generated_by ?? undefined}
                      >
                        {truncateEmail(doc.generated_by)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(doc.selected_recipients ?? []).length > 0 ? (
                            doc.selected_recipients.map((recipient) => (
                              <Badge key={recipient} variant="outline" className="capitalize">
                                {recipient}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {doc.missing_variables_accepted ? (
                          <span
                            title="Generado aceptando variables en blanco"
                            className="flex justify-center"
                          >
                            <HugeiconsIcon
                              icon={CheckmarkSquare01Icon}
                              className="w-4 h-4 text-amber-500"
                            />
                          </span>
                        ) : (
                          <span
                            title="Generado sin variables en blanco"
                            className="flex justify-center"
                          >
                            <HugeiconsIcon
                              icon={CancelSquareIcon}
                              className="w-4 h-4 text-green-500"
                            />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(doc.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(doc.file_url, doc.file_format)}
                          title={`Descargar ${fmt.label}`}
                        >
                          <HugeiconsIcon icon={Download05Icon} className="w-4 h-4 mr-1" />
                          Descargar
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-right">
          {filtered.length} de {documents.length} documento{documents.length !== 1 ? 's' : ''}
        </p>
      </CardContent>
    </Card>
  )
}
