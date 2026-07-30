'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, CheckmarkCircle02Icon, LockKeyIcon } from '@hugeicons/core-free-icons'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PROVIDER_LABELS, type ModelDefinition, type Provider } from './llm-types'
import { LlmProviderIcon } from './llm-provider-icon'

const CAPABILITY_LABELS: Record<string, string> = {
  tool_calling: 'Tools',
  structured_output: 'JSON',
  reasoning: 'Reasoning',
  pdf_input: 'PDF',
}

interface LlmProviderModelCardProps {
  provider: Provider
  models: ModelDefinition[]
  active: boolean
}

export function LlmProviderModelCard({ provider, models, active }: LlmProviderModelCardProps) {
  const [expanded, setExpanded] = useState(false)
  const providerLabel = PROVIDER_LABELS[provider]
  const contentId = `llm-models-${provider}`

  return (
    <Card
      size="sm"
      className="gap-0 border border-border/70 bg-card/75 py-0 ring-0 dark:bg-card/45"
    >
      <CardHeader className="p-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={`${expanded ? 'Ocultar' : 'Mostrar'} modelos de ${providerLabel}`}
          onClick={() => setExpanded((current) => !current)}
          className="grid w-full grid-cols-1 gap-2 px-4 py-4 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white">
              <LlmProviderIcon provider={provider} className="size-4.5" />
            </div>
            <div className="min-w-0">
              <CardTitle>{providerLabel}</CardTitle>
              <p className="text-xs text-muted-foreground">{models.length} modelos</p>
            </div>
          </div>
          <div className="flex items-center justify-between pl-10">
            <Badge
              variant="outline"
              className={
                active
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-border/80 bg-muted/60 text-muted-foreground'
              }
            >
              <HugeiconsIcon
                icon={active ? CheckmarkCircle02Icon : LockKeyIcon}
                className="size-3"
                aria-hidden
              />
              {active ? 'Disponible' : 'Bloqueado'}
            </Badge>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={`size-4 text-muted-foreground transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </div>
        </button>
      </CardHeader>

      {expanded && (
        <CardContent id={contentId} className="border-t border-border/60 px-0">
          <ul className="max-h-80 divide-y divide-border/50 overflow-y-auto" role="list">
            {models.map((model) => (
              <li
                key={model.id}
                data-disabled={!active}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/35 data-[disabled=true]:bg-muted/15"
              >
                <div
                  className={
                    active
                      ? 'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success'
                      : 'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'
                  }
                >
                  <HugeiconsIcon
                    icon={active ? CheckmarkCircle02Icon : LockKeyIcon}
                    className="size-3.5"
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{model.label}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {model.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {CAPABILITY_LABELS[capability] ?? capability}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {!active && (
            <div className="border-t border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Bloqueado · configura una API key</span>
              <span className="block">La lista es informativa hasta conectar el proveedor.</span>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
