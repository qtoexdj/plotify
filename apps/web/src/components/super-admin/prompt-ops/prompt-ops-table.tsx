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
    className: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  },
  tool_instruction: {
    label: 'Tool',
    className: 'bg-green-100 text-green-700 hover:bg-green-100',
  },
  document: {
    label: 'Documento',
    className: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  },
}

export function PromptOpsTable({ prompts }: PromptOpsTableProps) {
  const router = useRouter()

  if (prompts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-500 text-sm">
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
            <thead className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
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
                  className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
                }

                return (
                  <tr
                    key={prompt.id}
                    onClick={() => router.push(`/super-admin/prompt-ops/${prompt.id}`)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-slate-900 font-mono text-xs">
                      {prompt.slug}
                    </td>
                    <td className="px-6 py-4 text-slate-600 max-w-xs truncate">
                      {prompt.description ?? '—'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {prompt.active_version ? (
                        <span>v{prompt.active_version.version}</span>
                      ) : (
                        <span className="text-slate-400 italic">Sin versión activa</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
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
