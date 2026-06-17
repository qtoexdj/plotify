'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MatrizClientError, upsertEscrituraTemplateClause } from '@/lib/documents/matriz-client'
import type {
  AlertTipo,
  ClauseContentJson,
  ClauseUpsertRequest,
  ConditionMode,
  EscrituraTemplateDetail,
  InvalidTemplateKey,
  TemplateClause,
} from '@/lib/documents/matriz-types'

const EMPTY_OPTION = '__none__'

export const ALERT_TIPO_OPTIONS = [
  'dl_3516',
  'derechos_aguas',
  'vigente_en_el_resto',
  'multi_inmueble',
  'gravamen',
  'personeria_requerida',
  'discrepancia_declaracion',
  'otro',
] as const satisfies readonly AlertTipo[]

export const EMPTY_CLAUSE_CONTENT: ClauseContentJson = {
  schema_version: 1,
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Nueva cláusula.' }],
    },
  ],
}

export const INVALID_KEY_REASON_LABELS = {
  unknown_key: 'Clave fuera del catálogo',
  removed_key: 'Clave removida',
  invalid_node: 'Nodo inválido',
} as const satisfies Record<InvalidTemplateKey['reason'], string>

type ParseClauseContentResult =
  | { ok: true; value: ClauseContentJson }
  | { ok: false; message: string }

export function parseClauseContentInput(value: string): ParseClauseContentResult {
  try {
    const parsed = JSON.parse(value) as Partial<ClauseContentJson>
    if (parsed.schema_version !== 1 || parsed.type !== 'doc' || !Array.isArray(parsed.content)) {
      return { ok: false, message: 'El JSON debe ser un doc ProseMirror schema_version 1.' }
    }
    return { ok: true, value: parsed as ClauseContentJson }
  } catch {
    return { ok: false, message: 'El contenido debe ser JSON válido.' }
  }
}

export function formatInvalidTemplateKey(issue: InvalidTemplateKey): string {
  const label = INVALID_KEY_REASON_LABELS[issue.reason]
  return issue.suggested_migration
    ? `${issue.key}: ${label}. Migrar a ${issue.suggested_migration}`
    : `${issue.key}: ${label}`
}

export function buildClausePayload({
  title,
  position,
  fixedPosition,
  contentInput,
  conditionKey,
  conditionMode,
  alertTipo,
}: {
  title: string
  position: string
  fixedPosition: boolean
  contentInput: string
  conditionKey: string
  conditionMode: ConditionMode | ''
  alertTipo: AlertTipo | ''
}): { ok: true; payload: ClauseUpsertRequest } | { ok: false; message: string } {
  const normalizedTitle = title.trim()
  if (!normalizedTitle) {
    return { ok: false, message: 'La cláusula necesita un título.' }
  }

  const parsedPosition = Number.parseInt(position, 10)
  if (!Number.isInteger(parsedPosition) || parsedPosition < 0) {
    return { ok: false, message: 'La posición debe ser un entero mayor o igual a 0.' }
  }

  const parsedContent = parseClauseContentInput(contentInput)
  if (!parsedContent.ok) return parsedContent

  const normalizedConditionKey = conditionKey.trim()
  if ((normalizedConditionKey && !conditionMode) || (!normalizedConditionKey && conditionMode)) {
    return {
      ok: false,
      message: 'La condición requiere key y modo, o ambos campos vacíos.',
    }
  }

  return {
    ok: true,
    payload: {
      title: normalizedTitle,
      position: parsedPosition,
      fixed_position: fixedPosition,
      content_json: parsedContent.value,
      condition_key: normalizedConditionKey || null,
      condition_mode: conditionMode || null,
      alert_tipo: alertTipo || null,
    },
  }
}

export function extractInvalidTemplateKeys(detail: unknown): InvalidTemplateKey[] {
  const candidates: unknown[] = []
  if (detail && typeof detail === 'object') {
    candidates.push((detail as { error?: unknown }).error)
    candidates.push((detail as { detail?: unknown }).detail)
  }
  candidates.push(detail)

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const payload = candidate as { code?: unknown; invalid_keys?: unknown }
    if (payload.code === 'invalid_keys' && Array.isArray(payload.invalid_keys)) {
      return payload.invalid_keys as InvalidTemplateKey[]
    }
  }

  return []
}

type TemplateClauseFormProps = {
  templateId: string
  clause?: TemplateClause | null
  nextPosition: number
  editable: boolean
  onSaved: (template: EscrituraTemplateDetail) => void
}

export function TemplateClauseForm({
  templateId,
  clause,
  nextPosition,
  editable,
  onSaved,
}: TemplateClauseFormProps) {
  const [clauseKey, setClauseKey] = useState(clause?.clause_key ?? '')
  const [title, setTitle] = useState(clause?.title ?? '')
  const [position, setPosition] = useState(String(clause?.position ?? nextPosition))
  const [fixedPosition, setFixedPosition] = useState(clause?.fixed_position ?? false)
  const [conditionKey, setConditionKey] = useState(clause?.condition_key ?? '')
  const [conditionMode, setConditionMode] = useState<ConditionMode | ''>(
    clause?.condition_mode ?? ''
  )
  const [alertTipo, setAlertTipo] = useState<AlertTipo | ''>(clause?.alert_tipo ?? '')
  const [contentInput, setContentInput] = useState(
    JSON.stringify(clause?.content_json ?? EMPTY_CLAUSE_CONTENT, null, 2)
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invalidKeys, setInvalidKeys] = useState<InvalidTemplateKey[]>([])

  const contentPreview = useMemo(() => parseClauseContentInput(contentInput), [contentInput])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedClauseKey = clauseKey.trim()
    if (!normalizedClauseKey) {
      setError('La cláusula necesita una clave estable.')
      return
    }

    const built = buildClausePayload({
      title,
      position,
      fixedPosition,
      contentInput,
      conditionKey,
      conditionMode,
      alertTipo,
    })
    if (!built.ok) {
      setError(built.message)
      setInvalidKeys([])
      return
    }

    setIsSaving(true)
    setError(null)
    setInvalidKeys([])
    try {
      const response = await upsertEscrituraTemplateClause({
        templateId,
        clauseKey: normalizedClauseKey,
        payload: built.payload,
      })
      onSaved(response)
    } catch (err) {
      if (err instanceof MatrizClientError) {
        const invalid = extractInvalidTemplateKeys(err.detail)
        if (invalid.length > 0) {
          setInvalidKeys(invalid)
          setError('Hay claves fuera del catálogo canónico.')
        } else {
          setError(err.message)
        }
      } else {
        setError('No se pudo guardar la cláusula.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-4"
      data-testid="template-clause-form"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Editor de cláusula</p>
          <p className="text-xs text-muted-foreground">
            Valida tokens contra el catálogo del API antes de guardar.
          </p>
        </div>
        {editable ? <Badge variant="outline">Borrador editable</Badge> : <Badge>Publicado</Badge>}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {invalidKeys.length > 0 ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
          data-testid="template-invalid-keys"
        >
          <div className="mb-2 flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" />
            Claves inválidas
          </div>
          <ul className="space-y-1">
            {invalidKeys.map((issue) => (
              <li key={`${issue.key}-${issue.reason}`}>{formatInvalidTemplateKey(issue)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Clave</span>
          <Input
            value={clauseKey}
            onChange={(event) => setClauseKey(event.target.value)}
            placeholder="comparecencia"
            disabled={!editable || Boolean(clause)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Posición</span>
          <Input
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            inputMode="numeric"
            disabled={!editable}
          />
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium">Título</span>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="COMPARECENCIA"
          disabled={!editable}
        />
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Condición key</span>
          <Input
            value={conditionKey}
            onChange={(event) => setConditionKey(event.target.value)}
            placeholder="titulo.alertas.derechos_aguas"
            disabled={!editable}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Modo condición</span>
          <Select
            value={conditionMode || EMPTY_OPTION}
            onValueChange={(value) =>
              setConditionMode(value === EMPTY_OPTION ? '' : (value as ConditionMode))
            }
            disabled={!editable}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sin condición" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_OPTION}>Sin condición</SelectItem>
              <SelectItem value="omit">Omitir</SelectItem>
              <SelectItem value="block">Bloquear</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Alerta legal</span>
          <Select
            value={alertTipo || EMPTY_OPTION}
            onValueChange={(value) =>
              setAlertTipo(value === EMPTY_OPTION ? '' : (value as AlertTipo))
            }
            disabled={!editable}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sin alerta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_OPTION}>Sin alerta</SelectItem>
              {ALERT_TIPO_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={fixedPosition}
          onChange={(event) => setFixedPosition(event.target.checked)}
          disabled={!editable}
          className="size-4 rounded border-border"
        />
        Posición fija
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">Contenido ProseMirror JSON</span>
        <Textarea
          value={contentInput}
          onChange={(event) => setContentInput(event.target.value)}
          className="min-h-[300px] font-mono text-xs"
          disabled={!editable}
        />
      </label>

      {!contentPreview.ok ? (
        <p className="text-sm text-destructive">{contentPreview.message}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          JSON válido · {contentPreview.value.content.length} bloques
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!editable || isSaving}>
          <Save />
          {isSaving ? 'Guardando' : 'Guardar cláusula'}
        </Button>
      </div>
    </form>
  )
}
