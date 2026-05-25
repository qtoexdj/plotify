'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { PromptVersion } from '@/types/v2'

interface PromptHistoryProps {
  promptId: string
  versions: PromptVersion[]
  accessToken: string
}

export function computeDiff(oldText: string, newText: string) {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: { type: 'added' | 'removed' | 'unchanged'; line: string }[] = []

  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i]
    const n = newLines[i]
    if (o === undefined) {
      result.push({ type: 'added', line: n })
    } else if (n === undefined) {
      result.push({ type: 'removed', line: o })
    } else if (o !== n) {
      result.push({ type: 'removed', line: o })
      result.push({ type: 'added', line: n })
    } else {
      result.push({ type: 'unchanged', line: o })
    }
  }
  return result
}

export function PromptHistory({ promptId, versions, accessToken }: PromptHistoryProps) {
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null)
  const [isPending, startTransition] = useTransition()

  const activeVersion = versions.find((v) => v.is_active)

  async function handleRollback(versionId: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/prompt-ops/${promptId}/versions/${versionId}/activate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? 'Error al activar versión')
        }
        toast.success('Versión activada correctamente')
        window.location.reload()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error inesperado')
      }
    })
  }

  const diff =
    selectedVersion && activeVersion && selectedVersion.id !== activeVersion.id
      ? computeDiff(activeVersion.content, selectedVersion.content)
      : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Timeline de versiones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de versiones</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-125">
            <div className="p-4 space-y-1">
              {versions.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">
                  No hay versiones registradas.
                </p>
              )}
              {versions.map((v, idx) => (
                <div key={v.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedVersion(selectedVersion?.id === v.id ? null : v)}
                    className={`w-full text-left p-3 rounded-lg transition-colors text-sm ${
                      selectedVersion?.id === v.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">v{v.version}</span>
                        {v.is_active && (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
                            Activa
                          </Badge>
                        )}
                      </div>
                      <span
                        className={`text-xs ${
                          selectedVersion?.id === v.id ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {v.created_at
                          ? new Date(v.created_at).toLocaleDateString('es-CL', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </span>
                    </div>
                    {v.change_note && (
                      <p
                        className={`text-xs mt-1 truncate ${
                          selectedVersion?.id === v.id ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {v.change_note}
                      </p>
                    )}
                  </button>
                  {idx < versions.length - 1 && <Separator className="my-1" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Panel lateral: contenido + rollback + diff */}
      <div className="space-y-4">
        {selectedVersion ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">v{selectedVersion.version}</CardTitle>
                  {!selectedVersion.is_active && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleRollback(selectedVersion.id)}
                    >
                      Rollback a esta versión
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <pre className="text-xs font-mono whitespace-pre-wrap text-slate-700">
                    {selectedVersion.content}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>

            {diff && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Diff — v{activeVersion?.version} (activa) vs v{selectedVersion.version}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <pre className="text-xs font-mono">
                      {diff.map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.type === 'added'
                              ? 'bg-green-100 text-green-800'
                              : line.type === 'removed'
                                ? 'bg-red-100 text-red-800'
                                : 'text-slate-600'
                          }
                        >
                          <span className="mr-2 select-none">
                            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                          </span>
                          {line.line}
                        </div>
                      ))}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-48 text-sm text-slate-400">
            Selecciona una versión del historial para ver detalles
          </div>
        )}
      </div>
    </div>
  )
}
