'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'

export interface ApprovedToolOption {
  slug: string
  name: string
  description: string
  roles: string[]
}

interface ApprovedToolsPickerProps {
  tools: ApprovedToolOption[]
  selectedRoles: string[]
  value: string[]
  onChange: (toolSlugs: string[]) => void
}

function roleMatches(toolRoles: string[], selectedRoles: string[]) {
  if (toolRoles.length === 0 || selectedRoles.length === 0) return true
  return toolRoles.some((role) => selectedRoles.includes(role))
}

export function ApprovedToolsPicker({
  tools,
  selectedRoles,
  value,
  onChange,
}: ApprovedToolsPickerProps) {
  const visibleTools = tools.filter((tool) => roleMatches(tool.roles, selectedRoles))

  function toggleTool(slug: string, checked: boolean) {
    if (checked) {
      onChange(value.includes(slug) ? value : [...value, slug])
      return
    }
    onChange(value.filter((item) => item !== slug))
  }

  return (
    <div data-testid="approved-tools-picker" className="space-y-3">
      {visibleTools.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay tools compatibles con el rol.</p>
      ) : (
        <div className="grid gap-2">
          {visibleTools.map((tool) => (
            <label
              key={tool.slug}
              className="flex items-start gap-3 rounded-xl border bg-background p-3 text-sm"
            >
              <Checkbox
                aria-label={tool.name}
                data-testid={`approved-tool-option-${tool.slug}`}
                checked={value.includes(tool.slug)}
                onCheckedChange={(checked) => toggleTool(tool.slug, checked === true)}
              />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{tool.name}</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {tool.slug}
                  </Badge>
                </span>
                <span className="block text-muted-foreground">{tool.description}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
