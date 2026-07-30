'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowReloadHorizontalIcon,
  CheckmarkCircle02Icon,
  LockKeyIcon,
} from '@hugeicons/core-free-icons'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  hasActiveCredential,
  PROVIDER_LABELS,
  type ModelSyncState,
  type Provider,
  type ProviderState,
} from './llm-types'
import { LlmProviderIcon } from './llm-provider-icon'

interface LlmProviderCardProps {
  provider: Provider
  state?: ProviderState
  modelSync?: ModelSyncState
  secret: string
  busy: string | null
  onSecretChange: (value: string) => void
  onSave: () => void
  onSync: () => void
}

export function LlmProviderCard({
  provider,
  state,
  modelSync,
  secret,
  busy,
  onSecretChange,
  onSave,
  onSync,
}: LlmProviderCardProps) {
  const label = PROVIDER_LABELS[provider]
  const active = hasActiveCredential(state)

  return (
    <Card
      size="sm"
      className="border border-border/70 bg-card/80 ring-0 dark:bg-card/55 dark:shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]"
    >
      <CardHeader className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-b border-border/60 pb-4">
        <div className="flex size-9 items-center justify-center rounded-xl bg-white ring-1 ring-border/70">
          <LlmProviderIcon provider={provider} />
        </div>
        <div className="min-w-0">
          <CardTitle>{label}</CardTitle>
          <p className="truncate text-xs text-muted-foreground">
            {active ? state?.key_hint : 'API key pendiente'}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`col-start-2 justify-self-start ${
            active
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-border/80 bg-muted/50 text-muted-foreground'
          }`}
        >
          <HugeiconsIcon
            icon={active ? CheckmarkCircle02Icon : LockKeyIcon}
            className="size-3"
            aria-hidden
          />
          {active ? 'Conectado' : 'Bloqueado'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
          <span>Nueva API key</span>
          <Input
            aria-label={`API key de ${label}`}
            type="password"
            autoComplete="new-password"
            value={secret}
            onChange={(event) => onSecretChange(event.target.value)}
            placeholder="Pega una nueva clave"
            className="bg-background/60 dark:bg-background/35"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            aria-label={`Guardar clave de ${label}`}
            disabled={!secret.trim() || busy !== null}
            onClick={onSave}
            className="disabled:bg-muted/70 disabled:text-muted-foreground"
          >
            {busy === `credential:${provider}` ? 'Guardando…' : 'Guardar key'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={`Actualizar modelos de ${label}`}
            disabled={!active || busy !== null}
            onClick={onSync}
          >
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-3.5" aria-hidden />
            {busy === `models:${provider}` ? 'Actualizando…' : 'Modelos'}
          </Button>
        </div>

        <p className="min-h-8 text-xs leading-4 text-muted-foreground">
          {modelSync
            ? `${modelSync.model_count} modelos · ${new Date(
                modelSync.last_synced_at
              ).toLocaleString('es-CL')}`
            : active
              ? 'Listo para consultar el catálogo del proveedor.'
              : 'Configura la key para sincronizar y usar sus modelos.'}
        </p>
      </CardContent>
    </Card>
  )
}
