'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import { AiLockIcon, AlertCircleIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  hasActiveCredential,
  PROVIDER_LABELS,
  type ModelDefinition,
  type Provider,
  type ProviderState,
  type TaskDefinition,
  type TaskState,
} from './llm-types'

interface LlmTaskCardProps {
  task: TaskDefinition
  draft: TaskState
  saved?: TaskState
  models: ModelDefinition[]
  providerStates: ProviderState[]
  providers: Provider[]
  busy: string | null
  onProviderChange: (provider: Provider) => void
  onPatch: (patch: Partial<TaskState>) => void
  onSave: () => void
}

const selectClassName =
  'h-10 w-full rounded-xl border border-input bg-background/55 px-3 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground dark:bg-background/30 dark:disabled:bg-muted/20'

export function LlmTaskCard({
  task,
  draft,
  saved,
  models,
  providerStates,
  providers,
  busy,
  onProviderChange,
  onPatch,
  onSave,
}: LlmTaskCardProps) {
  const providerModels = models.filter((model) => model.provider === draft.provider)
  const selectedModel = providerModels.find((model) => model.id === draft.model)
  const providerState = providerStates.find((provider) => provider.provider === draft.provider)
  const active = hasActiveCredential(providerState)
  const dirty =
    !saved ||
    saved.provider !== draft.provider ||
    saved.model !== draft.model ||
    saved.reasoning_effort !== draft.reasoning_effort ||
    saved.enabled !== draft.enabled
  const statusLabel = !active
    ? dirty
      ? 'Sin guardar · proveedor bloqueado'
      : 'Guardada · proveedor bloqueado'
    : dirty
      ? 'Cambios sin guardar'
      : 'Configuración guardada'
  const statusIcon = !active ? AiLockIcon : dirty ? AlertCircleIcon : CheckmarkCircle02Icon

  return (
    <Card size="sm" className="border border-border/70 bg-card/80 ring-0 dark:bg-card/50">
      <CardHeader className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border/60 pb-4">
        <div>
          <CardTitle>{task.label}</CardTitle>
          <div className="mt-2 flex flex-wrap gap-1">
            {task.required_capabilities.map((capability) => (
              <Badge key={capability} variant="outline" className="bg-muted/45 text-[10px]">
                {capability}
              </Badge>
            ))}
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            active && !dirty
              ? 'border-success/30 bg-success/10 text-success'
              : active
                ? 'border-primary/35 bg-primary/10 text-primary'
                : 'border-border bg-muted/60 text-muted-foreground'
          }
        >
          <HugeiconsIcon icon={statusIcon} className="size-3" aria-hidden />
          {statusLabel}
        </Badge>
      </CardHeader>

      <CardContent className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          <span>Proveedor</span>
          <select
            aria-label={`Proveedor para ${task.label}`}
            value={draft.provider}
            onChange={(event) => onProviderChange(event.target.value as Provider)}
            className={selectClassName}
          >
            {providers.map((provider) => {
              const providerActive = hasActiveCredential(
                providerStates.find((item) => item.provider === provider)
              )
              return (
                <option key={provider} value={provider}>
                  {PROVIDER_LABELS[provider]}
                  {providerActive ? '' : ' · sin API key'}
                </option>
              )
            })}
          </select>
        </label>

        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          <span>Modelo</span>
          <select
            aria-label={`Modelo para ${task.label}`}
            value={draft.model}
            disabled={!active}
            onChange={(event) => {
              const next = providerModels.find((model) => model.id === event.target.value)
              onPatch({
                model: event.target.value,
                reasoning_effort: next?.reasoning_options[0] ?? 'off',
              })
            }}
            className={selectClassName}
          >
            {providerModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          <span>Razonamiento</span>
          <select
            aria-label={`Razonamiento para ${task.label}`}
            value={draft.reasoning_effort}
            disabled={!active}
            onChange={(event) => onPatch({ reasoning_effort: event.target.value })}
            className={selectClassName}
          >
            {(selectedModel?.reasoning_options ?? ['off']).map((effort) => (
              <option key={effort} value={effort}>
                {effort === 'off' ? 'Sin razonamiento adicional' : effort}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-h-10 items-center gap-3 self-end rounded-xl border border-border/70 bg-background/40 px-3 text-sm text-foreground dark:bg-background/20">
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={!active}
            onChange={(event) => onPatch({ enabled: event.target.checked })}
            className="size-4 accent-primary disabled:cursor-not-allowed"
          />
          Tarea activa
        </label>

        <div className="sm:col-span-2">
          <Button
            className="w-full disabled:bg-muted/70 disabled:text-muted-foreground"
            disabled={busy !== null || !active || !dirty}
            onClick={onSave}
          >
            {busy === `task:${task.key}`
              ? 'Guardando…'
              : !saved
                ? 'Guardar configuración'
                : dirty
                  ? 'Guardar cambios'
                  : 'Sin cambios'}
          </Button>
          {!active && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Los modelos de {PROVIDER_LABELS[draft.provider]} están visibles en el catálogo, pero
              se habilitan al configurar su API key.
            </p>
          )}
          {active && !dirty && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Esta asignación ya está guardada y en uso.
            </p>
          )}
          {active && dirty && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Guarda los cambios para aplicarlos al agente.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
