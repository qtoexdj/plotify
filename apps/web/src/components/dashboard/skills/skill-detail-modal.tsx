'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { HugeiconsIcon } from '@hugeicons/react'
import { LockIcon, ZapIcon, DatabaseIcon, PuzzleIcon } from '@hugeicons/core-free-icons'
import type { SkillWithConfig } from '@/types/v2'

interface SkillDetailModalProps {
  skill: SkillWithConfig
  organizationId: string
  enabled: boolean
  onToggle: (skill: SkillWithConfig, value: boolean) => void
  onClose: () => void
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'builtin': return ZapIcon
    case 'mcp': return DatabaseIcon
    default: return PuzzleIcon
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'builtin': return 'Integrado'
    case 'mcp': return 'MCP'
    case 'custom': return 'Custom'
    default: return category
  }
}

function getRoleLabel(roles: string[] | null): string {
  if (!roles || roles.length === 0) return 'Todos'
  if (roles.includes('super_admin')) return 'Super Admin'
  if (roles.includes('admin')) return 'Admin'
  return roles.join(', ')
}

// Extraer parámetros del tool_definition
export function getParameters(toolDefinition: unknown): Array<{ name: string; type: string; description: string; required: boolean }> {
  if (!toolDefinition || typeof toolDefinition !== 'object') return []
  const def = toolDefinition as Record<string, unknown>
  const params = def.parameters
  if (!params || typeof params !== 'object') return []
  const p = params as Record<string, unknown>
  const props = p.properties
  if (!props || typeof props !== 'object') return []
  const required = Array.isArray(p.required) ? (p.required as string[]) : []
  return Object.entries(props as Record<string, unknown>).map(([name, schema]) => {
    const s = schema as Record<string, unknown>
    return {
      name,
      type: typeof s.type === 'string' ? s.type : 'any',
      description: typeof s.description === 'string' ? s.description : '',
      required: required.includes(name),
    }
  })
}

export function SkillDetailModal({ skill, enabled, onToggle, onClose }: SkillDetailModalProps) {
  const parameters = getParameters(skill.tool_definition)

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
              skill.category === 'builtin' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' :
              skill.category === 'mcp' ? 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400' :
              'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400'
            }`}>
              <HugeiconsIcon icon={getCategoryIcon(skill.category ?? 'custom')} size={20} />
            </div>
            <div>
              <DialogTitle className="text-base">{skill.name}</DialogTitle>
              <DialogDescription className="text-xs font-mono">{skill.slug}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Descripción */}
          <p className="text-sm text-muted-foreground">{skill.description}</p>

          {/* Badges de info */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{getCategoryLabel(skill.category ?? 'custom')}</Badge>
            <Badge variant="outline">
              Rol: {getRoleLabel(skill.requires_role as string[] | null)}
            </Badge>
            {skill.requires_mcp && skill.mcp_provider && (
              <Badge variant="outline" className="border-purple-300 text-purple-600">
                MCP: {skill.mcp_provider}
              </Badge>
            )}
          </div>

          {/* Parámetros */}
          {parameters.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Parámetros
              </p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Nombre</th>
                      <th className="text-left px-3 py-2 font-medium">Tipo</th>
                      <th className="text-left px-3 py-2 font-medium">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parameters.map((param, i) => (
                      <tr key={param.name} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                        <td className="px-3 py-2 font-mono">
                          {param.name}
                          {param.required && <span className="text-red-500 ml-0.5">*</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{param.type}</td>
                        <td className="px-3 py-2 text-muted-foreground">{param.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Toggle de activación */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">
                {enabled ? 'Habilitada' : 'Deshabilitada'}
              </Label>
              <p className="text-xs text-muted-foreground">
                {skill.is_system
                  ? 'Esta skill del sistema siempre está activa'
                  : 'Controla si tu agente puede usar esta herramienta'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {skill.is_system && (
                <HugeiconsIcon icon={LockIcon} size={14} className="text-muted-foreground" />
              )}
              <Switch
                checked={enabled}
                disabled={skill.is_system ?? false}
                onCheckedChange={value => onToggle(skill, value)}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
