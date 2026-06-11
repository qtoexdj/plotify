'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { ProseKit, useDocChange } from '@prosekit/react'
import { createEditor } from '@prosekit/core'
import type { ProseMirrorNode } from '@prosekit/pm/model'
import { Check, LockKeyhole } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CLASES_NODOS_EDITOR,
  clauseContentFromDoc,
  clauseDocFromContent,
  defineMatrizClauseExtension,
} from '@/lib/documents/matriz-schema'
import { cn } from '@/lib/utils'
import { MESA_TEXT } from '@/lib/documents/matriz-microcopy'
import type { ClauseContentJson, MatrizClauseView } from '@/lib/documents/matriz-types'
import { urlCorreccion } from './dato-popover'

/**
 * Editor in-place de cláusula (SDD 010 T014, FR-008, research D1): ProseKit
 * montado sobre la cláusula clickeada — una sola instancia activa en toda la
 * mesa. Edita la estructura (`content_json`, el mismo schema de SDD 008:
 * los bloques de título son átomos no editables) y el guardado viaja por la
 * matriz con optimistic locking (mesa-escritura, mensaje humano de
 * conflicto). Solo lectura cuando el estado del workflow lo exige.
 */

/** La cláusula contiene bloques aprobados del estudio de título. */
export function contieneBloquesTitulo(content: ClauseContentJson | null): boolean {
  if (!content) return false
  const buscar = (nodes: unknown[]): boolean => {
    for (const value of nodes) {
      if (!value || typeof value !== 'object') continue
      const node = value as { type?: string; content?: unknown[] }
      if (node.type === 'block_token') return true
      if (node.content && buscar(node.content)) return true
    }
    return false
  }
  return buscar(content.content)
}

type ClausulaEditorInlineProps = {
  clause: MatrizClauseView
  projectId: string
  soloLectura: boolean
  onCambio: (content: ClauseContentJson) => void
  onCerrar: () => void
}

export function ClausulaEditorInline({
  clause,
  projectId,
  soloLectura,
  onCambio,
  onCerrar,
}: ClausulaEditorInlineProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const conBloques = useMemo(() => contieneBloquesTitulo(clause.content_json), [clause])
  const editor = useMemo(() => {
    const instance = createEditor({ extension: defineMatrizClauseExtension() })
    try {
      instance.setContent(clauseDocFromContent(clause.content_json))
    } catch {
      // El servidor valida el schema; ante contenido inválido el editor queda
      // vacío y el encabezado de la cláusula sigue visible.
    }
    return instance
  }, [clause.content_json])

  useEffect(() => {
    if (!mountRef.current) return
    const cleanup = editor.mount(mountRef.current)
    const editable = mountRef.current.querySelector('[contenteditable]')
    if (soloLectura) {
      editable?.setAttribute('contenteditable', 'false')
    }
    return cleanup
  }, [editor, soloLectura])

  return (
    <ProseKit editor={editor}>
      <div
        data-testid="clausula-editor-inline"
        className="my-3 rounded-lg border border-primary/40 bg-background shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 font-sans">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold">{clause.title}</p>
            {soloLectura ? <Badge variant="outline">{MESA_TEXT.soloLectura}</Badge> : null}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onCerrar}>
            <Check />
            {MESA_TEXT.cerrarEditor}
          </Button>
        </div>

        <DocChangeBridge onChange={soloLectura ? undefined : onCambio} />

        <div
          ref={mountRef}
          aria-label={`${MESA_TEXT.editarClausula}: ${clause.title}`}
          aria-readonly={soloLectura}
          className={cn(
            'min-h-[120px] px-5 py-4 font-serif text-[15px] leading-8 outline-none',
            CLASES_NODOS_EDITOR
          )}
        />

        {conBloques ? (
          <p
            data-testid="editor-bloque-titulo-nota"
            className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2.5 font-sans text-xs text-muted-foreground"
          >
            <LockKeyhole aria-hidden className="size-3.5 shrink-0 text-purple-700" />
            {MESA_TEXT.bloqueTitulo}. {MESA_TEXT.bloqueTituloAyuda}{' '}
            <Link
              href={urlCorreccion(projectId)}
              className="font-medium text-blue-600 hover:underline"
            >
              {MESA_TEXT.irAlPanelTitulo}
            </Link>
          </p>
        ) : null}
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
