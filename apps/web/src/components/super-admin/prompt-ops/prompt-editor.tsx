'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { PromptVersion, SystemPrompt } from '@/types/v2'

interface PromptEditorProps {
  prompt: SystemPrompt
  activeVersion: PromptVersion | null
  accessToken: string
}

export function highlightPlaceholders(content: string): React.ReactNode[] {
  const parts = content.split(/(\{[^}]+\})/g)
  return parts.map((part, i) =>
    /^\{[^}]+\}$/.test(part) ? (
      <mark key={i} className="bg-yellow-200 text-yellow-800 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function PromptEditor({ prompt, activeVersion, accessToken }: PromptEditorProps) {
  const [content, setContent] = useState(activeVersion?.content ?? '')
  const [changeNote, setChangeNote] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSave(activate: boolean) {
    if (!content.trim()) {
      toast.error('El contenido del prompt no puede estar vacío')
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/prompt-ops/${prompt.id}/versions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            content,
            change_note: changeNote || undefined,
            is_active: activate,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? 'Error al guardar')
        }

        toast.success(activate ? 'Versión publicada y activa' : 'Borrador guardado correctamente')
        setChangeNote('')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error inesperado')
      }
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Contenido del prompt
              {activeVersion && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  — versión activa: v{activeVersion.version}
                </span>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? 'Editar' : 'Vista previa'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showPreview ? (
            <div className="min-h-100 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed">
              {highlightPlaceholders(content)}
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-100 font-mono text-sm resize-none"
              placeholder="Escribe el system prompt aquí. Usa {variable} para variables dinámicas."
            />
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 items-stretch">
          <div className="space-y-1">
            <Label htmlFor="change-note">Nota de cambio (opcional)</Label>
            <Input
              id="change-note"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Ej: Ajuste de tono más formal"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => handleSave(false)} disabled={isPending}>
              Guardar como borrador
            </Button>
            <Button onClick={() => handleSave(true)} disabled={isPending}>
              Publicar
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
