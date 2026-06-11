'use client'

import { useEffect, useMemo, useRef } from 'react'
import { ProseKit, useDocChange } from '@prosekit/react'
import { createEditor } from '@prosekit/core'
import type { ProseMirrorNode } from '@prosekit/pm/model'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  clauseContentFromDoc,
  clauseDocFromContent,
  defineMatrizClauseExtension,
} from '@/lib/documents/matriz-schema'
import type {
  BlockResolution,
  ClauseContentJson,
  MatrizClauseView,
  TokenResolution,
  TokenResolutionStatus,
} from '@/lib/documents/matriz-types'

export const TOKEN_STATUS_LABELS = {
  resolved: 'Resuelto',
  missing: 'Falta dato',
  blocked: 'Pendiente',
} as const satisfies Record<TokenResolutionStatus, string>

export const TOKEN_STATUS_STYLES = {
  resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  missing: 'border-amber-200 bg-amber-50 text-amber-800',
  blocked: 'border-sky-200 bg-sky-50 text-sky-800',
} as const satisfies Record<TokenResolutionStatus, string>

type TokenNodeSummary = {
  kind: 'variable'
  key: string
  label: string
}

type BlockNodeSummary = {
  kind: 'block'
  key: string
  label: string
}

export type ClauseNodeSummary = TokenNodeSummary | BlockNodeSummary

function walkNodes(node: unknown, summaries: ClauseNodeSummary[]) {
  if (!node || typeof node !== 'object') return
  const current = node as {
    type?: string
    attrs?: Record<string, unknown>
    content?: unknown[]
  }
  if (current.type === 'variable_token') {
    const key = String(current.attrs?.variableKey || '')
    if (key) {
      summaries.push({
        kind: 'variable',
        key,
        label: String(current.attrs?.label || key),
      })
    }
  }
  if (current.type === 'block_token') {
    const key = String(current.attrs?.blockKey || '')
    if (key) {
      summaries.push({
        kind: 'block',
        key,
        label: String(current.attrs?.label || key),
      })
    }
  }
  for (const child of current.content || []) {
    walkNodes(child, summaries)
  }
}

export function collectClauseNodeSummaries(content: ClauseContentJson): ClauseNodeSummary[] {
  const summaries: ClauseNodeSummary[] = []
  walkNodes(content, summaries)
  return summaries
}

export function tokenStatusLabel(status: TokenResolutionStatus): string {
  return TOKEN_STATUS_LABELS[status]
}

export function tokenStatusClassName(status: TokenResolutionStatus): string {
  return TOKEN_STATUS_STYLES[status]
}

export function resolutionByKey<T extends { variableKey?: string; blockKey?: string }>(
  entries: T[],
  key: string
): T | undefined {
  return entries.find((entry) => entry.variableKey === key || entry.blockKey === key)
}

type MatrizClauseEditorProps = {
  clause: MatrizClauseView
  tokens: TokenResolution[]
  blocks: BlockResolution[]
  readOnly?: boolean
  onChange?: (content: ClauseContentJson) => void
}

export function MatrizClauseEditor({
  clause,
  tokens,
  blocks,
  readOnly = false,
  onChange,
}: MatrizClauseEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const summaries = useMemo(() => collectClauseNodeSummaries(clause.content_json), [clause])
  const editor = useMemo(() => {
    const instance = createEditor({ extension: defineMatrizClauseExtension() })
    try {
      instance.setContent(clauseDocFromContent(clause.content_json))
    } catch {
      // El servidor valida el schema; si algo llega mal, dejamos el editor vacío y
      // mantenemos visible la metadata de la cláusula para que el usuario no quede a ciegas.
    }
    return instance
  }, [clause.content_json])

  useEffect(() => {
    if (!mountRef.current) return
    const cleanup = editor.mount(mountRef.current)
    const editable = mountRef.current.querySelector('[contenteditable]')
    if (readOnly) {
      editable?.setAttribute('contenteditable', 'false')
    }
    return cleanup
  }, [editor, readOnly])

  return (
    <ProseKit editor={editor}>
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{clause.title}</p>
            <p className="text-xs text-muted-foreground">
              {clause.fixed_position ? 'Posición fija' : 'Cláusula editable'} ·{' '}
              {clause.overridden ? 'con cambios locales' : 'desde plantilla'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {readOnly ? <Badge variant="outline">Solo lectura</Badge> : null}
            <Button type="button" variant="outline" size="sm" disabled={readOnly}>
              Guardar cláusula
            </Button>
          </div>
        </div>

        <DocChangeBridge onChange={onChange} />

        <div
          ref={mountRef}
          aria-label={`Editor de cláusula ${clause.title}`}
          aria-readonly={readOnly}
          className="min-h-[360px] flex-1 overflow-auto px-5 py-4 text-sm leading-7 outline-none [&_.matriz-block-token]:rounded-lg [&_.matriz-block-token]:border [&_.matriz-block-token]:border-sky-200 [&_.matriz-block-token]:bg-sky-50 [&_.matriz-block-token]:px-3 [&_.matriz-block-token]:py-2 [&_.matriz-block-token]:text-sky-900 [&_.matriz-variable-token]:rounded-full [&_.matriz-variable-token]:border [&_.matriz-variable-token]:border-amber-200 [&_.matriz-variable-token]:bg-amber-50 [&_.matriz-variable-token]:px-2 [&_.matriz-variable-token]:py-0.5 [&_.matriz-variable-token]:text-amber-900"
        />

        <div className="border-t border-border px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tokens de esta cláusula
          </p>
          {summaries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {summaries.map((summary) => {
                if (summary.kind === 'block') {
                  const block = resolutionByKey(blocks, summary.key)
                  return (
                    <span
                      key={`block-${summary.key}`}
                      data-testid="matriz-block-token-readonly"
                      className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-900"
                      title="Bloque aprobado por abogado; se corrige en el panel de título."
                    >
                      <span className="font-medium">{summary.label}</span>
                      <span>{block ? tokenStatusLabel(block.status) : 'Bloque de título'}</span>
                    </span>
                  )
                }
                const token = resolutionByKey(tokens, summary.key)
                const status = token?.status || 'missing'
                return (
                  <span
                    key={`token-${summary.key}`}
                    data-testid="matriz-token-chip"
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${tokenStatusClassName(status)}`}
                  >
                    <span className="font-medium">{summary.label}</span>
                    <span>{tokenStatusLabel(status)}</span>
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Esta cláusula no contiene tokens.</p>
          )}
        </div>
      </div>
    </ProseKit>
  )
}

function DocChangeBridge({ onChange }: { onChange?: (content: ClauseContentJson) => void }) {
  useDocChange((doc: ProseMirrorNode) => {
    if (!onChange) return
    onChange(clauseContentFromDoc(doc.toJSON()))
  })
  return null
}
