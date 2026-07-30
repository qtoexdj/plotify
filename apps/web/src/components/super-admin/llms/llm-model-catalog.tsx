import { Badge } from '@/components/ui/badge'
import {
  hasActiveCredential,
  type ModelDefinition,
  type Provider,
  type ProviderState,
} from './llm-types'
import { LlmProviderModelCard } from './llm-provider-model-card'

interface LlmModelCatalogProps {
  providers: Provider[]
  models: ModelDefinition[]
  providerStates: ProviderState[]
}

export function LlmModelCatalog({ providers, models, providerStates }: LlmModelCatalogProps) {
  return (
    <section className="space-y-4" aria-labelledby="model-catalog-title">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 id="model-catalog-title" className="font-display text-xl font-semibold">
            Catálogo de modelos
          </h2>
          <p className="text-sm text-muted-foreground">
            Todos los modelos permanecen visibles; una API key activa habilita su uso.
          </p>
        </div>
        <Badge variant="outline" className="bg-card/70 text-muted-foreground">
          {models.length} modelos verificados
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {providers.map((provider) => {
          const providerModels = models.filter((model) => model.provider === provider)
          const state = providerStates.find((item) => item.provider === provider)
          const active = hasActiveCredential(state)

          return (
            <LlmProviderModelCard
              key={provider}
              provider={provider}
              models={providerModels}
              active={active}
            />
          )
        })}
      </div>
    </section>
  )
}
