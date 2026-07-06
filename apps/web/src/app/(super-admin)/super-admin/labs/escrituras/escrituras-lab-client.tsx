'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Upload01Icon as Upload,
  Refresh01Icon as RefreshCw,
  File02Icon as FileText,
  DatabaseIcon as Database,
  TestTube01Icon as FlaskConical,
  FileSyncIcon as FileCog,
  BinaryCodeIcon as Binary,
  CheckmarkCircle02Icon as CheckCircle2,
  Alert02Icon as AlertTriangle,
  CancelCircleIcon as XCircle,
} from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  LAB_ACCEPT_ATTRIBUTE,
  LAB_DOCUMENT_TYPES,
  LAB_SUPPORTED_UPLOADS,
  normalizeLabPayload,
} from '@/lib/labs/escrituras'
import type { LabPayload } from '@/lib/labs/escrituras'
import {
  getLabOperationSnapshot,
  getCurrentProcessingDocument,
  getLabOperationProgress,
  getLabOperationSteps,
  getLabOperationSummary,
  type LabOperationKind,
  type LabOperationSnapshot,
} from '@/lib/labs/escrituras-operations'

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'processed') return 'default'
  if (status === 'failed') return 'destructive'
  if (status === 'needs_ocr' || status === 'low_quality_extraction') return 'outline'
  return 'secondary'
}

type LabOperationStatus = 'running' | 'success' | 'error'

interface LabOperationState {
  open: boolean
  kind: LabOperationKind
  status: LabOperationStatus
  title: string
  description: string
  before: LabOperationSnapshot
  after?: LabOperationSnapshot
  latest?: LabOperationSnapshot
  currentItem?: string
  lastPolledAt?: string
  stdout?: string
  stderr?: string
  error?: string
}

type LabCommandResponse = {
  ok?: boolean
  error?: string
  stdout?: string
  stderr?: string
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

function responseErrorMessage(data: unknown, fallback: string) {
  if (data != null && typeof data === 'object' && 'error' in data) {
    const error = (data as { error?: unknown }).error
    if (typeof error === 'string' && error.length > 0) return error
  }

  return fallback
}

export function EscriturasLabClient({ initialPayload }: { initialPayload: LabPayload }) {
  const [payload, setPayload] = useState<LabPayload>(() => normalizeLabPayload(initialPayload))
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isEmbedding, setIsEmbedding] = useState(false)
  const [documentType, setDocumentType] = useState('escritura')
  const [files, setFiles] = useState<File[]>([])
  const [operation, setOperation] = useState<LabOperationState | null>(null)

  const latestTemplate = payload.templates[0]
  const pendingCount =
    payload.documentStats?.pendingDocuments ??
    payload.documents.filter((document) =>
      ['uploaded', 'pending'].includes(document.processing_status)
    ).length
  const totalDocuments = payload.documentStats?.totalDocuments ?? payload.documents.length
  const processedCount = useMemo(
    () => payload.documents.filter((document) => document.processing_status === 'processed').length,
    [payload.documents]
  )

  const loadLabData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true)
    try {
      const response = await fetch('/api/labs/escrituras/documents', {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const data = await readJsonResponse(response)

      if (!response.ok) {
        const message = responseErrorMessage(
          data,
          'No se pudo cargar el laboratorio de escrituras.'
        )
        setPayload((current) => normalizeLabPayload({ ...current, error: message }))
        if (!silent) toast.error(message)
        return null
      }

      const nextPayload = normalizeLabPayload(data)
      setPayload(nextPayload)
      if (!silent && nextPayload.setupRequired && nextPayload.error)
        toast.warning(nextPayload.error)
      return nextPayload
    } catch {
      if (!silent) toast.error('No se pudo cargar el laboratorio de escrituras.')
      return null
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (operation?.status !== 'running') return

    let cancelled = false
    async function poll() {
      const nextPayload = await loadLabData({ silent: true })
      if (!nextPayload || cancelled) return

      const currentDocument = getCurrentProcessingDocument(nextPayload)
      setOperation((current) =>
        current?.status === 'running'
          ? {
              ...current,
              latest: getLabOperationSnapshot(nextPayload),
              currentItem:
                current.kind === 'process'
                  ? (currentDocument?.original_filename ?? current.currentItem)
                  : current.currentItem,
              lastPolledAt: new Date().toLocaleTimeString(),
            }
          : current
      )
    }

    void poll()
    const intervalId = window.setInterval(poll, 2000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [operation?.status, operation?.kind, loadLabData])

  async function handleUpload() {
    if (files.length === 0) {
      toast.error('Selecciona uno o mas documentos primero.')
      return
    }

    setIsUploading(true)
    try {
      let uploadedCount = 0
      let failedCount = 0
      let lastError: string | null = null

      for (const selectedFile of files) {
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('documentType', documentType)

        const response = await fetch('/api/labs/escrituras/upload', {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
        })
        const data = (await readJsonResponse(response)) as {
          documents?: unknown[]
          document?: unknown
          failures?: unknown[]
          error?: string
        }

        if (!response.ok) {
          lastError = responseErrorMessage(data, 'No se pudo subir el documento.')
          failedCount += 1
          continue
        }

        uploadedCount += data.documents?.length ?? (data.document ? 1 : 0)
        failedCount += data.failures?.length ?? 0
      }

      if (uploadedCount === 0) {
        throw new Error(lastError ?? 'No se pudo subir ningun documento.')
      }

      toast.success(
        `${uploadedCount} documento${uploadedCount === 1 ? '' : 's'} registrado${uploadedCount === 1 ? '' : 's'}.`
      )
      if (failedCount > 0) {
        toast.warning(`${failedCount} archivos no se pudieron subir.`)
      }
      setFiles([])
      await loadLabData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir el documento.')
    } finally {
      setIsUploading(false)
    }
  }

  async function handleProcessPending() {
    const before = getLabOperationSnapshot(payload)
    setOperation({
      open: true,
      kind: 'process',
      status: 'running',
      title: 'Procesando documentos',
      description: 'Convirtiendo documentos pendientes y aplicando quality gate.',
      before,
      latest: before,
    })
    setIsProcessing(true)
    try {
      const response = await fetch('/api/labs/escrituras/process', {
        method: 'POST',
        credentials: 'same-origin',
      })
      const data = (await readJsonResponse(response)) as LabCommandResponse

      if (!response.ok) {
        const message = responseErrorMessage(
          data,
          'No se pudieron procesar los documentos pendientes.'
        )
        toast.error(message)
        const nextPayload = await loadLabData()
        setOperation((current) =>
          current
            ? {
                ...current,
                status: 'error',
                description: 'El procesamiento no pudo finalizar.',
                after: getLabOperationSnapshot(nextPayload ?? payload),
                latest: getLabOperationSnapshot(nextPayload ?? payload),
                currentItem: undefined,
                stdout: data.stdout,
                stderr: data.stderr,
                error: message,
              }
            : current
        )
        return
      }

      toast.success('Procesamiento del laboratorio finalizado.')
      if (data.stderr) toast.warning(data.stderr)
      const nextPayload = await loadLabData()
      setOperation((current) =>
        current
          ? {
              ...current,
              status: 'success',
              description: 'Procesamiento finalizado. Revisa el resumen y la salida del comando.',
              after: getLabOperationSnapshot(nextPayload ?? payload),
              latest: getLabOperationSnapshot(nextPayload ?? payload),
              currentItem: undefined,
              stdout: data.stdout,
              stderr: data.stderr,
            }
          : current
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudieron procesar los documentos.'
      toast.error(message)
      setOperation((current) =>
        current
          ? {
              ...current,
              status: 'error',
              description: 'El procesamiento no pudo finalizar.',
              error: message,
            }
          : current
      )
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleGenerateEmbeddings() {
    const before = getLabOperationSnapshot(payload)
    setOperation({
      open: true,
      kind: 'embeddings',
      status: 'running',
      title: 'Generando embeddings',
      description: 'Vectorizando chunks pendientes para busqueda semantica por MCP.',
      before,
      latest: before,
    })
    setIsEmbedding(true)
    try {
      const response = await fetch('/api/labs/escrituras/embeddings', {
        method: 'POST',
        credentials: 'same-origin',
      })
      const data = (await readJsonResponse(response)) as LabCommandResponse

      if (!response.ok) {
        const message = responseErrorMessage(data, 'No se pudieron generar embeddings.')
        toast.error(message)
        const nextPayload = await loadLabData()
        setOperation((current) =>
          current
            ? {
                ...current,
                status: 'error',
                description: 'La generacion de embeddings no pudo finalizar.',
                after: getLabOperationSnapshot(nextPayload ?? payload),
                latest: getLabOperationSnapshot(nextPayload ?? payload),
                stdout: data.stdout,
                stderr: data.stderr,
                error: message,
              }
            : current
        )
        return
      }

      toast.success('Embeddings generados para chunks pendientes.')
      if (data.stderr) toast.warning(data.stderr)
      const nextPayload = await loadLabData()
      setOperation((current) =>
        current
          ? {
              ...current,
              status: 'success',
              description: 'Embeddings finalizados. Revisa el resumen y la salida del comando.',
              after: getLabOperationSnapshot(nextPayload ?? payload),
              latest: getLabOperationSnapshot(nextPayload ?? payload),
              stdout: data.stdout,
              stderr: data.stderr,
            }
          : current
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron generar embeddings.'
      toast.error(message)
      setOperation((current) =>
        current
          ? {
              ...current,
              status: 'error',
              description: 'La generacion de embeddings no pudo finalizar.',
              error: message,
            }
          : current
      )
    } finally {
      setIsEmbedding(false)
    }
  }

  return (
    <PageShell>
      <LabOperationDialog operation={operation} onClose={() => setOperation(null)} />

      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <HugeiconsIcon icon={FlaskConical} className="size-4" />
        Laboratorio local
      </div>
      <PageHeader
        title="Laboratorio de Escrituras"
        description="Sube documentos legales PDF, DOCX, DOC o RTF para analizarlos fuera del runtime productivo. El Markdown vive en Supabase local bajo lab_escrituras; los exports a carpeta son opcionales."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleProcessPending}
              disabled={isProcessing || isEmbedding || pendingCount === 0 || payload.setupRequired}
            >
              <HugeiconsIcon icon={FileCog} className="size-4" />
              {isProcessing ? 'Procesando' : `Procesar pendientes (${pendingCount})`}
            </Button>
            <Button
              variant="outline"
              onClick={handleGenerateEmbeddings}
              disabled={
                isEmbedding ||
                isProcessing ||
                payload.setupRequired ||
                payload.embeddingStats.pendingChunks === 0
              }
            >
              <HugeiconsIcon icon={Binary} className="size-4" />
              {isEmbedding
                ? 'Vectorizando'
                : `Embeddings pendientes (${payload.embeddingStats.pendingChunks})`}
            </Button>
            <Button
              variant="outline"
              onClick={() => loadLabData()}
              disabled={isLoading || isProcessing || isEmbedding}
            >
              <HugeiconsIcon icon={RefreshCw} className="size-4" />
              Actualizar
            </Button>
          </div>
        }
      />

      {payload.setupRequired ? (
        <div className="rounded-lg border border-warning/20 bg-warning/10 p-4 text-sm text-warning">
          <p className="font-medium">Laboratorio pendiente de bootstrap</p>
          <p className="mt-1">
            Ejecuta <code>labs/labs_escrituras/sql/001_bootstrap_lab.sql</code> contra{' '}
            <code>supabase-db</code>. Si el listado sigue vacio, confirma que el schema{' '}
            <code>lab_escrituras</code> este expuesto para el acceso REST local.
          </p>
        </div>
      ) : null}

      {!payload.setupRequired && payload.error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">No se pudo actualizar el laboratorio</p>
          <p className="mt-1">{payload.error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Documentos</CardTitle>
            <HugeiconsIcon icon={FileText} className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-foreground">{totalDocuments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Procesados</CardTitle>
            <HugeiconsIcon icon={Database} className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-foreground">{processedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Variables candidatas</CardTitle>
            <HugeiconsIcon icon={FlaskConical} className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-foreground">{payload.variables.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">Chunks vectorizados</CardTitle>
            <HugeiconsIcon icon={Binary} className="size-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-foreground">
              {payload.embeddingStats.embeddedChunks}/{payload.embeddingStats.totalChunks}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subir documentos al laboratorio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <select
              className="h-10 rounded-md border border-border bg-card px-3 text-sm"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
            >
              {LAB_DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <input
              className="h-10 rounded-md border border-border bg-card px-3 py-2 text-sm"
              type="file"
              accept={LAB_ACCEPT_ATTRIBUTE}
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            <Button onClick={handleUpload} disabled={isUploading || files.length === 0}>
              <HugeiconsIcon icon={Upload} className="size-4" />
              {isUploading ? 'Subiendo' : files.length > 1 ? `Subir ${files.length}` : 'Subir'}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Los documentos reales quedan en storage local. No se versionan en Git junto con
            Markdown, embeddings ni exports.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documentos del laboratorio</CardTitle>
          </CardHeader>
          <CardContent>
            {payload.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Cargando documentos...' : 'Todavia no hay documentos cargados.'}
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="pb-3">Archivo</th>
                      <th className="pb-3">Tipo</th>
                      <th className="pb-3">Estado</th>
                      <th className="pb-3">Formato</th>
                      <th className="pb-3">Deteccion</th>
                      <th className="pb-3">Tamano</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground">
                    {payload.documents.map((document) => (
                      <tr key={document.id} className="border-t border-border">
                        <td className="max-w-xs truncate py-3 font-medium">
                          {document.original_filename}
                          <div className="font-mono text-xs text-muted-foreground">
                            {document.sha256.slice(0, 12)}
                          </div>
                        </td>
                        <td className="py-3">{document.document_type}</td>
                        <td className="py-3">
                          <Badge variant={statusVariant(document.processing_status)}>
                            {document.processing_status}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {LAB_SUPPORTED_UPLOADS[document.source_format]?.label ??
                            document.source_format.toUpperCase()}
                        </td>
                        <td className="py-3">{document.detected_pdf_type ?? 'pendiente'}</td>
                        <td className="py-3">{formatBytes(document.size_bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Template candidato</CardTitle>
          </CardHeader>
          <CardContent>
            {latestTemplate ? (
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-foreground">{latestTemplate.name}</p>
                  <p className="text-xs text-muted-foreground">{latestTemplate.created_at}</p>
                </div>
                <pre className="max-h-96 overflow-auto rounded-md bg-foreground p-3 text-xs text-background">
                  {latestTemplate.draft_markdown}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aun no hay template draft. Ejecuta el procesamiento/export del laboratorio cuando
                existan chunks.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Variables candidatas</CardTitle>
          </CardHeader>
          <CardContent>
            {payload.variables.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin variables candidatas todavia.</p>
            ) : (
              <div className="space-y-3">
                {payload.variables.slice(0, 10).map((variable) => (
                  <div key={variable.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-medium text-foreground">
                          {variable.canonical_variable}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {variable.proposed_value ?? 'sin valor'}
                        </p>
                      </div>
                      <Badge variant="outline">{variable.future_source}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                      {variable.evidence}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapa de fuentes</CardTitle>
          </CardHeader>
          <CardContent>
            {payload.sourceMap.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin source map generado todavia.</p>
            ) : (
              <div className="space-y-3">
                {payload.sourceMap.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border p-3">
                    <p className="font-mono text-sm font-medium text-foreground">
                      {entry.canonical_variable}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.future_source}
                      {entry.source_table
                        ? ` · ${entry.source_table}.${entry.source_field ?? '*'}`
                        : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.rationale}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}

function LabOperationDialog({
  operation,
  onClose,
}: {
  operation: LabOperationState | null
  onClose: () => void
}) {
  const open = Boolean(operation?.open)
  const isRunning = operation?.status === 'running'
  const summary =
    operation?.after != null
      ? getLabOperationSummary(operation.kind, operation.before, operation.after)
      : []
  const steps = operation ? getLabOperationSteps(operation.kind) : []
  const latest = operation?.latest ?? operation?.after ?? operation?.before
  const progress =
    operation && latest
      ? getLabOperationProgress(operation.kind, operation.before, latest, operation.currentItem)
      : null

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isRunning) onClose()
      }}
    >
      {operation ? (
        <AlertDialogContent className="sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogMedia
              className={
                operation.status === 'success'
                  ? 'bg-success/10 text-success'
                  : operation.status === 'error'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-info/10 text-info'
              }
            >
              {operation.status === 'success' ? (
                <HugeiconsIcon icon={CheckCircle2} />
              ) : operation.status === 'error' ? (
                <HugeiconsIcon icon={XCircle} />
              ) : (
                <Spinner />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {operation.title}
              {progress ? (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  {progress.percentage}%
                </span>
              ) : null}
            </AlertDialogTitle>
            <AlertDialogDescription>{operation.description}</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            {progress ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{progress.label}</span>
                    <span className="text-muted-foreground">Pendientes: {progress.pending}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-info transition-all duration-500"
                      style={{ width: `${Math.max(progress.percentage, isRunning ? 4 : 0)}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {operation.kind === 'process' ? 'Archivo actual' : 'Operacion actual'}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {operation.kind === 'process'
                      ? (progress.currentItem ??
                        'Esperando que el procesador marque el documento...')
                      : progress.label}
                  </p>
                  {operation.lastPolledAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ultima actualizacion: {operation.lastPolledAt}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetricTile label="Procesados" value={progress.processedDelta} />
                  <MetricTile label="Baja calidad" value={progress.lowQualityDelta} />
                  <MetricTile label="Fallidos" value={progress.failedDelta} />
                  <MetricTile
                    label={operation.kind === 'embeddings' ? 'Embeddings' : 'Chunks'}
                    value={
                      operation.kind === 'embeddings'
                        ? progress.embeddedDelta
                        : progress.chunksDelta
                    }
                  />
                </div>
              </div>
            ) : null}

            {isRunning ? (
              <div className="grid gap-2">
                {steps.map((step) => (
                  <div key={step} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner className="size-3.5" />
                    {step}
                  </div>
                ))}
              </div>
            ) : null}

            {!isRunning && summary.length > 0 ? (
              <div className="grid gap-2 rounded-lg border border-border p-3">
                {summary.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-semibold text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {operation.stderr ? (
              <div className="rounded-lg border border-warning/20 bg-warning/10 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-warning">
                  <HugeiconsIcon icon={AlertTriangle} className="size-4" />
                  Advertencias del proceso
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-warning">
                  {operation.stderr}
                </pre>
              </div>
            ) : null}

            {operation.stdout ? (
              <div className="rounded-lg border border-border bg-muted p-3">
                <p className="mb-2 text-sm font-medium text-foreground">Salida del comando</p>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {operation.stdout}
                </pre>
              </div>
            ) : null}

            {operation.error ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {operation.error}
              </div>
            ) : null}
          </div>

          <AlertDialogFooter>
            <Button disabled={isRunning} onClick={onClose}>
              {isRunning ? 'Procesando...' : 'Cerrar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  )
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  )
}
