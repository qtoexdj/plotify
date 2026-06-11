'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LegalEvidenceViewer } from '@/components/projects/legal/legal-evidence-viewer'
import type { DocumentEvidence } from '@/lib/legal/variable-resolution-types'
import type {
  ClauseContentJson,
  MatrizClauseView,
  MatrizEvidenceRef,
  TokenResolution,
  TokenResolutionStatus,
} from '@/lib/documents/matriz-types'
import {
  TOKEN_STATUS_LABELS,
  collectClauseNodeSummaries,
  tokenStatusClassName,
} from './matriz-clause-editor'

export type MatrizViewMode = 'template' | 'resuelto' | 'evidencia'

export const MATRIZ_VIEW_MODE_LABELS = {
  template: 'Template',
  resuelto: 'Resuelto',
  evidencia: 'Evidencia',
} as const satisfies Record<MatrizViewMode, string>

type MatrizViewSwitchProps = {
  clause: MatrizClauseView
  tokens: TokenResolution[]
  projectId: string
  value: MatrizViewMode
  onValueChange: (mode: MatrizViewMode) => void
  children: ReactNode
}

export function correctionUrl(projectId: string, variableKey?: string | null): string {
  const params = new URLSearchParams({ tab: 'legal' })
  if (variableKey) params.set('variable', variableKey)
  return `/projects/${encodeURIComponent(projectId)}?${params.toString()}`
}

export function evidenceRefToDocumentEvidence(
  ref: MatrizEvidenceRef,
  index: number
): DocumentEvidence {
  const shortDocumentId = ref.legal_document_id?.slice(0, 8)
  return {
    id: ref.legal_document_page_id ?? `${ref.legal_document_id ?? 'evidence'}-${index}`,
    legal_document_id: ref.legal_document_id ?? 'sin-documento',
    legal_document_page_id: ref.legal_document_page_id,
    document_name: shortDocumentId ? `Documento ${shortDocumentId}` : 'Documento legal',
    page_number: ref.page_number,
    snippet: ref.snippet,
    confidence: null,
  }
}

export function clauseTokenResolutions(
  clause: MatrizClauseView,
  tokens: TokenResolution[]
): TokenResolution[] {
  const keys = new Set(
    collectClauseNodeSummaries(clause.content_json)
      .filter((summary) => summary.kind === 'variable')
      .map((summary) => summary.key)
  )
  return tokens.filter((token) => keys.has(token.variableKey))
}

export function resolvedParagraphs(content: ClauseContentJson | null): string[] {
  if (!content) return []
  return blockTexts(content.content).filter(Boolean)
}

function blockTexts(nodes: unknown[]): string[] {
  const paragraphs: string[] = []
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const current = node as {
      type?: string
      content?: unknown[]
      attrs?: Record<string, unknown>
    }
    if (current.type === 'paragraph') {
      const text = inlineText(current.content || []).trim()
      if (text) paragraphs.push(text)
      continue
    }
    if (current.type === 'block_token') {
      const label = String(current.attrs?.label || current.attrs?.blockKey || '')
      if (label) paragraphs.push(`[${label}]`)
      continue
    }
    if (current.type === 'repeat_section' || current.type === 'conditional_section') {
      paragraphs.push(...blockTexts(current.content || []))
    }
  }
  return paragraphs
}

function inlineText(nodes: unknown[]): string {
  return nodes
    .map((node) => {
      if (!node || typeof node !== 'object') return ''
      const current = node as {
        type?: string
        text?: string
        attrs?: Record<string, unknown>
      }
      if (current.type === 'text') return current.text || ''
      if (current.type === 'variable_token') {
        return `[${String(current.attrs?.label || current.attrs?.variableKey || 'token pendiente')}]`
      }
      return ''
    })
    .join('')
}

function statusCounts(tokens: TokenResolution[]): Record<TokenResolutionStatus, number> {
  return tokens.reduce(
    (counts, token) => {
      counts[token.status] += 1
      return counts
    },
    { resolved: 0, missing: 0, blocked: 0 } satisfies Record<TokenResolutionStatus, number>
  )
}

export function MatrizViewSwitch({
  clause,
  tokens,
  projectId,
  value,
  onValueChange,
  children,
}: MatrizViewSwitchProps) {
  const clauseTokens = useMemo(() => clauseTokenResolutions(clause, tokens), [clause, tokens])
  const counts = useMemo(() => statusCounts(clauseTokens), [clauseTokens])
  const paragraphs = useMemo(() => resolvedParagraphs(clause.resolved_content), [clause])
  const [selectedTokenKey, setSelectedTokenKey] = useState<string | null>(null)

  const selectedToken =
    clauseTokens.find((token) => token.variableKey === selectedTokenKey) ?? clauseTokens[0] ?? null
  const selectedEvidence =
    selectedToken?.evidence_refs.map((ref, index) => evidenceRefToDocumentEvidence(ref, index)) ??
    []

  return (
    <Tabs
      value={value}
      onValueChange={(mode) => onValueChange(mode as MatrizViewMode)}
      className="min-h-0"
    >
      <div className="mb-3 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList aria-label="Vista de matriz" data-testid="matriz-view-switch">
          {Object.entries(MATRIZ_VIEW_MODE_LABELS).map(([mode, label]) => (
            <TabsTrigger key={mode} value={mode}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{counts.resolved} resueltos</Badge>
          <Badge variant="outline">{counts.blocked} pendientes</Badge>
          <Badge variant="outline">{counts.missing} faltantes</Badge>
        </div>
      </div>

      <TabsContent value="template" className="mt-0">
        {children}
      </TabsContent>

      <TabsContent value="resuelto" className="mt-0">
        <section
          data-testid="matriz-resolved-view"
          className="rounded-lg border border-border bg-background"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">{clause.title}</p>
            <p className="text-xs text-muted-foreground">
              Texto producido por el resolutor server-side para esta cláusula.
            </p>
          </div>
          <div className="space-y-4 px-5 py-4 text-sm leading-7">
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph, index) => (
                <p key={`${clause.clause_key}-resolved-${index}`} className="text-justify">
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">
                Esta cláusula no tiene texto resuelto disponible.
              </p>
            )}
          </div>
        </section>
      </TabsContent>

      <TabsContent value="evidencia" className="mt-0">
        <section
          data-testid="matriz-evidence-view"
          className="grid gap-4 rounded-lg border border-border bg-background p-4 xl:grid-cols-[280px_minmax(0,1fr)]"
        >
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Tokens de la cláusula</p>
              <p className="text-xs text-muted-foreground">
                Selecciona un dato para revisar su respaldo documental.
              </p>
            </div>
            <div className="space-y-2">
              {clauseTokens.length > 0 ? (
                clauseTokens.map((token) => (
                  <button
                    key={token.variableKey}
                    type="button"
                    data-testid="matriz-evidence-token"
                    onClick={() => setSelectedTokenKey(token.variableKey)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      selectedToken?.variableKey === token.variableKey
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <span className="block truncate font-medium">{token.variableKey}</span>
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 ${tokenStatusClassName(
                        token.status
                      )}`}
                    >
                      {TOKEN_STATUS_LABELS[token.status]}
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Esta cláusula no contiene tokens con evidencia.
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            {selectedToken ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selectedToken.variableKey}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedToken.value_text || 'Sin valor resuelto en el manifiesto.'}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={correctionUrl(projectId, selectedToken.variableKey)}>
                    Corregir en Centro de Control Legal
                    <ExternalLink />
                  </a>
                </Button>
              </div>
            ) : null}
            <LegalEvidenceViewer evidence={selectedEvidence} compact />
          </div>
        </section>
      </TabsContent>
    </Tabs>
  )
}
