'use client'

import { useMemo, useCallback } from 'react'
import { ProseKit, useDocChange } from '@prosekit/react'
import { createEditor, union, defineHistory, htmlFromNode } from '@prosekit/core'
import { defineDoc } from '@prosekit/extensions/doc'
import { defineText } from '@prosekit/extensions/text'
import { defineParagraph } from '@prosekit/extensions/paragraph'
import { defineHeading } from '@prosekit/extensions/heading'
import { defineBold } from '@prosekit/extensions/bold'
import { defineItalic } from '@prosekit/extensions/italic'
import { defineList } from '@prosekit/extensions/list'
import type { ProseMirrorNode } from '@prosekit/pm/model'

interface ProseKitEditorProps {
  initialContent?: string
  onChange?: (html: string) => void
  placeholder?: string
  readOnly?: boolean
}

/**
 * Wrapper de ProseKit para edición de artículos legales.
 * Serializa el contenido como HTML (compatible con Jinja2 del microservicio).
 *
 * Extensiones habilitadas: párrafo, encabezados h2/h3, negrita, cursiva, listas, historial.
 */
export function ProseKitEditor({
  initialContent = '',
  onChange,
  placeholder,
  readOnly = false,
}: ProseKitEditorProps) {
  const editor = useMemo(() => {
    const extension = union([
      defineDoc(),
      defineText(),
      defineParagraph(),
      defineHeading(),
      defineBold(),
      defineItalic(),
      defineList(),
      defineHistory(),
    ])

    const e = createEditor({ extension })

    // Cargar contenido inicial (setContent acepta HTML string directamente)
    if (initialContent) {
      try {
        e.setContent(initialContent)
      } catch {
        // Si el HTML no es válido el editor queda vacío
      }
    }

    return e
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Crear el editor una sola vez

  return (
    <ProseKit editor={editor}>
      <div className="relative h-full flex flex-col">
        {/* Toolbar básico */}
        <div className="flex items-center gap-1 px-2 py-1 border-b bg-muted/50 shrink-0">
          <ToolbarButton
            onClick={() => editor.commands.toggleBold?.()}
            title="Negrita (Ctrl+B)"
            label="B"
            className="font-bold"
          />
          <ToolbarButton
            onClick={() => editor.commands.toggleItalic?.()}
            title="Cursiva (Ctrl+I)"
            label="I"
            className="italic"
          />
          <span className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            onClick={() => editor.commands.setHeading?.({ level: 2 })}
            title="Encabezado H2"
            label="H2"
            className="text-xs"
          />
          <ToolbarButton
            onClick={() => editor.commands.setHeading?.({ level: 3 })}
            title="Encabezado H3"
            label="H3"
            className="text-xs"
          />
          <span className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            onClick={() => editor.commands.wrapInList?.({ kind: 'bullet' })}
            title="Lista con viñetas"
            label="• Lista"
            className="text-xs"
          />
        </div>

        {/* Update handler (debe estar dentro del contexto de ProseKit) */}
        <DocChangeListener onChange={onChange} />

        {/* Área editable */}
        <div
          ref={(el) => {
            if (el && !el.querySelector('[contenteditable]')) {
              editor.mount(el)
            }
          }}
          className="flex-1 overflow-auto p-4 prose prose-sm max-w-none focus-within:outline-none"
          data-placeholder={placeholder}
          aria-label="Editor de contenido"
          aria-readonly={readOnly}
        />
      </div>
    </ProseKit>
  )
}

// Componente interno que vive DENTRO del contexto de ProseKit
function DocChangeListener({
  onChange,
}: {
  onChange?: (html: string) => void
}) {
  useDocChange((doc: ProseMirrorNode) => {
    if (!onChange) return
    try {
      const html = htmlFromNode(doc)
      onChange(html)
    } catch {
      // silenciar errores de serialización
    }
  })

  return null
}

interface ToolbarButtonProps {
  onClick: () => void
  title: string
  label: string
  className?: string
}

function ToolbarButton({ onClick, title, label, className = '' }: ToolbarButtonProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault() // Evitar que el editor pierda el foco
      onClick()
    },
    [onClick],
  )

  return (
    <button
      type="button"
      title={title}
      onMouseDown={handleMouseDown}
      className={`px-2 py-0.5 rounded text-sm hover:bg-accent transition-colors ${className}`}
    >
      {label}
    </button>
  )
}
