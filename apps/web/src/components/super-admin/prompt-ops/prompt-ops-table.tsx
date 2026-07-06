'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PromptWithActiveVersion } from '@/types/v2'

interface PromptOpsTableProps {
  prompts: PromptWithActiveVersion[]
}

export const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  agent: {
    label: 'Agente',
    className: 'bg-info/15 text-info hover:bg-info/15',
  },
  tool_instruction: {
    label: 'Tool',
    className: 'bg-success/15 text-success hover:bg-success/15',
  },
  document: {
    label: 'Documento',
    className: 'bg-warning/15 text-warning hover:bg-warning/15',
  },
}

export function PromptOpsTable({ prompts }: PromptOpsTableProps) {
  const router = useRouter()

  if (prompts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No hay prompts registrados.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">System Prompts registrados</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium">Nombre (slug)</th>
                <th className="px-6 py-3 font-medium">Descripción</th>
                <th className="px-6 py-3 font-medium">Categoría</th>
                <th className="px-6 py-3 font-medium">Versión activa</th>
                <th className="px-6 py-3 font-medium">Última actualización</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prompts.map((prompt) => {
                const badge = CATEGORY_BADGE[prompt.category] ?? {
                  label: prompt.category,
                  className: 'bg-muted text-muted-foreground hover:bg-muted',
                }

                return (
                  <tr
                    key={prompt.id}
                    onClick={() => router.push(`/super-admin/prompt-ops/${prompt.id}`)}
                    className="cursor-pointer hover:bg-muted transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-foreground font-mono text-xs">
                      {prompt.slug}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground max-w-xs truncate">
                      {prompt.description ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </td>
                    <td className="px-6 py-4 text-foreground">
                      {prompt.active_version ? (
                        <span>v{prompt.active_version.version}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Sin versión activa</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {prompt.updated_at
                        ? new Date(prompt.updated_at).toLocaleDateString('es-CL', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
