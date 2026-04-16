'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HugeiconsIcon } from '@hugeicons/react'
import { LockIcon, PuzzleIcon, ZapIcon, DatabaseIcon } from '@hugeicons/core-free-icons'
import { SkillDetailModal } from './skill-detail-modal'
import { toggleOrgSkill } from '@/actions/agent-skills.action'
import { toast } from 'sonner'
import type { SkillWithConfig } from '@/types/v2'

interface SkillsGridProps {
  skills: SkillWithConfig[]
  organizationId: string
}

export function getCategoryIcon(category: string) {
  switch (category) {
    case 'builtin': return ZapIcon
    case 'mcp': return DatabaseIcon
    default: return PuzzleIcon
  }
}

export function getCategoryLabel(category: string) {
  switch (category) {
    case 'builtin': return 'Integrado'
    case 'mcp': return 'MCP'
    case 'custom': return 'Custom'
    default: return category
  }
}

export function getCategoryVariant(category: string): 'default' | 'secondary' | 'outline' {
  switch (category) {
    case 'builtin': return 'default'
    case 'mcp': return 'secondary'
    default: return 'outline'
  }
}

export function getRoleBadgeVariant(roles: string[] | null): 'default' | 'secondary' | 'outline' {
  if (!roles || roles.length === 0) return 'outline'
  if (roles.includes('super_admin')) return 'default'
  if (roles.includes('admin')) return 'secondary'
  return 'outline'
}

export function getRoleLabel(roles: string[] | null): string {
  if (!roles || roles.length === 0) return 'Todos'
  if (roles.includes('super_admin')) return 'Super Admin'
  if (roles.includes('admin')) return 'Admin'
  return roles.join(', ')
}

export function SkillsGrid({ skills, organizationId }: SkillsGridProps) {
  const [optimisticStates, setOptimisticStates] = useState<Record<string, boolean>>({})
  const [selectedSkill, setSelectedSkill] = useState<SkillWithConfig | null>(null)
  const [isPending, startTransition] = useTransition()

  function isEnabled(skill: SkillWithConfig): boolean {
    if (skill.id in optimisticStates) return optimisticStates[skill.id]
    return skill.org_config?.enabled ?? skill.enabled_by_default ?? true
  }

  function handleToggle(skill: SkillWithConfig, value: boolean) {
    if (skill.is_system && !value) {
      toast.error('Las skills del sistema no se pueden deshabilitar')
      return
    }
    setOptimisticStates(prev => ({ ...prev, [skill.id]: value }))
    startTransition(async () => {
      const result = await toggleOrgSkill(organizationId, skill.id, value)
      if (!result.success) {
        setOptimisticStates(prev => ({ ...prev, [skill.id]: !value }))
        toast.error(result.error ?? 'Error al actualizar skill')
      }
    })
  }

  // Agrupar skills por categoría
  const grouped = skills.reduce<Record<string, SkillWithConfig[]>>((acc, skill) => {
    const cat = skill.category ?? 'custom'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(skill)
    return acc
  }, {})

  const categoryOrder = ['builtin', 'mcp', 'custom']
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  )

  return (
    <TooltipProvider>
      <div className="space-y-8">
        {sortedCategories.map(category => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-4">
              <HugeiconsIcon icon={getCategoryIcon(category)} size={18} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {getCategoryLabel(category)}
              </h2>
              <span className="text-xs text-muted-foreground">
                ({grouped[category].length})
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {grouped[category].map(skill => {
                const enabled = isEnabled(skill)
                return (
                  <Card
                    key={skill.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${!enabled ? 'opacity-60' : ''}`}
                    onClick={() => setSelectedSkill(skill)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                            category === 'builtin' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' :
                            category === 'mcp' ? 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400' :
                            'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400'
                          }`}>
                            <HugeiconsIcon icon={getCategoryIcon(category)} size={16} />
                          </div>
                          <CardTitle className="text-sm font-semibold leading-tight line-clamp-2">
                            {skill.name}
                          </CardTitle>
                        </div>
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          {skill.is_system ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-muted-foreground">
                                  <HugeiconsIcon icon={LockIcon} size={14} />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Skill del sistema — no se puede deshabilitar</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                          <Switch
                            checked={enabled}
                            disabled={isPending || (skill.is_system ?? false)}
                            onCheckedChange={value => handleToggle(skill, value)}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      <CardDescription className="text-xs line-clamp-2">
                        {skill.description}
                      </CardDescription>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={getCategoryVariant(skill.category ?? 'custom')} className="text-xs">
                          {getCategoryLabel(skill.category ?? 'custom')}
                        </Badge>
                        <Badge variant={getRoleBadgeVariant(skill.requires_role as string[] | null)} className="text-xs">
                          {getRoleLabel(skill.requires_role as string[] | null)}
                        </Badge>
                        {skill.requires_mcp && (
                          <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
                            Requiere MCP
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        ))}

        {skills.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <HugeiconsIcon icon={PuzzleIcon} size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No hay skills disponibles</p>
          </div>
        )}
      </div>

      {selectedSkill && (
        <SkillDetailModal
          skill={selectedSkill}
          organizationId={organizationId}
          enabled={isEnabled(selectedSkill)}
          onToggle={handleToggle}
          onClose={() => setSelectedSkill(null)}
        />
      )}
    </TooltipProvider>
  )
}
