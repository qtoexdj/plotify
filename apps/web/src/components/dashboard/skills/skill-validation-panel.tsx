'use client'

import { Badge } from '@/components/ui/badge'
import type { SkillValidationResult } from '@/actions/agent-skills.action'

interface SkillValidationPanelProps {
  validation: SkillValidationResult | null
}

export function SkillValidationPanel({ validation }: SkillValidationPanelProps) {
  if (!validation) return null

  const isBlocked = validation.status === 'blocked'

  return (
    <div
      data-testid="skill-validation-panel"
      className="rounded-xl border bg-muted/20 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isBlocked ? 'destructive' : 'secondary'}>
          {isBlocked ? 'Revisar' : 'Validada'}
        </Badge>
        <Badge variant="outline" className="font-mono">
          {validation.normalized_slug}
        </Badge>
      </div>

      {validation.errors.length > 0 && (
        <div className="space-y-2">
          {validation.errors.map((error) => (
            <p
              key={`${error.code}-${error.field ?? 'general'}`}
              className="text-sm text-destructive"
            >
              {error.message}
            </p>
          ))}
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="space-y-2">
          {validation.warnings.map((warning) => (
            <p key={warning} className="text-sm text-muted-foreground">
              {warning}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
