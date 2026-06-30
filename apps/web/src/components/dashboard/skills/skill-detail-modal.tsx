'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
    case 'builtin':
      return ZapIcon
    case 'mcp':
      return DatabaseIcon
    default:
      return PuzzleIcon
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'builtin':
      return 'Integrado'
    case 'mcp':
      return 'MCP'
    case 'custom':
      return 'Custom'
    default:
      return category
  }
}

function getRoleLabel(roles: string[] | null): string {
  if (!roles || roles.length === 0) return 'Todos'
  if (roles.includes('super_admin')) return 'Super Admin'
  if (roles.includes('admin')) return 'Admin'
  return roles.join(', ')
}

export function getValidationLabel(status: string | null): string {
  switch (status) {
    case 'draft':
      return 'Borrador'
    case 'blocked':
      return 'Revisar'
    case 'valid':
      return 'Validada'
    default:
      return status ?? 'Sin validar'
  }
}

export function getMcpRequirementLabel(skill: SkillWithConfig): string {
  if (!skill.requires_mcp) return 'Sin MCP'
  switch (skill.mcp_requirement_state) {
    case 'ready':
      return 'MCP listo'
    case 'revoked':
      return 'Conexión revocada'
    case 'expired':
      return 'Conexión expirada'
    case 'error':
      return 'Conexión con error'
    default:
      return skill.mcp_ready ? 'MCP listo' : 'Requiere conexión'
  }
}

export function getMcpRequirementDescription(skill: SkillWithConfig): string {
  const provider = skill.mcp_provider ?? 'la integración'
  switch (skill.mcp_requirement_state) {
    case 'ready':
      return `${provider} está conectado y aprobado para esta organización.`
    case 'revoked':
      return `${provider} fue revocada. Vuelve a conectar la integración antes de activar esta skill.`
    case 'expired':
      return `${provider} expiró. Renueva la conexión antes de activar esta skill.`
    case 'error':
      return `${provider} tiene un error operativo. Revisa la integración antes de activar esta skill.`
    default:
      return `Conecta ${provider} en integraciones antes de activar esta skill.`
  }
}

function isMcpBlocked(skill: SkillWithConfig): boolean {
  return Boolean(skill.requires_mcp && !skill.mcp_ready)
}

// Extraer parámetros del tool_definition
export function getParameters(
  toolDefinition: unknown
): Array<{ name: string; type: string; description: string; required: boolean }> {
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
  const mcpBlocked = isMcpBlocked(skill)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg" data-testid="agent-skill-detail">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                skill.category === 'builtin'
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                  : skill.category === 'mcp'
                    ? 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400'
                    : 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400'
              }`}
            >
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
            <Badge variant="outline">Versión v{skill.current_version}</Badge>
            <Badge variant={skill.validation_status === 'blocked' ? 'destructive' : 'outline'}>
              {getValidationLabel(skill.validation_status)}
            </Badge>
            {skill.approved_tool_slugs.length > 0 && (
              <Badge variant="outline">
                {skill.approved_tool_slugs.length}{' '}
                {skill.approved_tool_slugs.length === 1 ? 'tool aprobada' : 'tools aprobadas'}
              </Badge>
            )}
            {skill.requires_mcp && skill.mcp_provider && (
              <Badge
                variant={skill.mcp_ready ? 'outline' : 'destructive'}
                className={skill.mcp_ready ? 'border-purple-300 text-purple-600' : ''}
              >
                {getMcpRequirementLabel(skill)}: {skill.mcp_provider}
              </Badge>
            )}
          </div>

          {skill.requires_mcp && skill.mcp_provider && (
            <div
              data-testid="skill-detail-mcp-requirement"
              className="rounded-lg border p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{getMcpRequirementLabel(skill)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getMcpRequirementDescription(skill)}
                  </p>
                </div>
                {!skill.mcp_ready && (
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <a href="/agente/integrations" data-testid="skill-detail-mcp-cta">
                      <HugeiconsIcon icon={DatabaseIcon} size={14} />
                      Configurar
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}

          {skill.approved_tool_slugs.length > 0 && (
            <div data-testid="skill-detail-approved-tools">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Tools aprobadas
              </p>
              <div className="flex flex-wrap gap-2">
                {skill.approved_tool_slugs.map((toolSlug) => (
                  <Badge key={toolSlug} variant="outline" className="font-mono text-xs">
                    {toolSlug}
                  </Badge>
                ))}
              </div>
            </div>
          )}

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
                {mcpBlocked
                  ? 'La integración requerida debe estar lista antes de activar esta skill'
                  : skill.is_system
                    ? 'Esta skill del sistema siempre está activa'
                    : 'Controla si tu agente puede usar esta herramienta'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {skill.is_system && (
                <HugeiconsIcon icon={LockIcon} size={14} className="text-muted-foreground" />
              )}
              <Switch
                aria-label={`Alternar ${skill.name}`}
                checked={enabled}
                disabled={(skill.is_system ?? false) || mcpBlocked}
                onCheckedChange={(value) => onToggle(skill, value)}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
