'use client'

import { LlmModelCatalog } from './llm-model-catalog'
import { LlmProviderCard } from './llm-provider-card'
import { LlmTaskCard } from './llm-task-card'
import { useLlmAdmin } from './use-llm-admin'

export function LlmAdminClient({ endpoint = '/api/llms' }: { endpoint?: string }) {
  const {
    snapshot,
    secrets,
    drafts,
    busy,
    message,
    modelsByTask,
    setSecret,
    saveCredential,
    syncModels,
    patchDraft,
    changeProvider,
    saveTask,
  } = useLlmAdmin(endpoint)

  if (!snapshot) {
    return <p className="text-sm text-muted-foreground">Cargando proveedores y modelos…</p>
  }

  return (
    <div className="space-y-10">
      {message && (
        <div
          role="status"
          className="rounded-xl border border-border/70 bg-card/80 px-4 py-3 text-sm text-foreground shadow-sm dark:bg-card/55"
        >
          {message}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-display text-xl font-semibold">Proveedores</h2>
            <p className="text-sm text-muted-foreground">
              Las claves se cifran en el servidor y nunca vuelven al navegador.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {snapshot.providers.filter((provider) => provider.status === 'active').length} de{' '}
            {snapshot.catalog.providers.length} conectados
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {snapshot.catalog.providers.map((provider) => {
            const state = snapshot.providers.find((item) => item.provider === provider)
            const modelSync = snapshot.model_syncs?.find((item) => item.provider === provider)
            return (
              <LlmProviderCard
                key={provider}
                provider={provider}
                state={state}
                modelSync={modelSync}
                secret={secrets[provider] ?? ''}
                busy={busy}
                onSecretChange={(value) => setSecret(provider, value)}
                onSave={() => void saveCredential(provider)}
                onSync={() => void syncModels(provider)}
              />
            )
          })}
        </div>
      </section>

      <LlmModelCatalog
        providers={snapshot.catalog.providers}
        models={snapshot.catalog.models}
        providerStates={snapshot.providers}
      />

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Asignación por tarea</h2>
          <p className="text-sm text-muted-foreground">
            Los proveedores compatibles permanecen visibles; configura su key para editar.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {snapshot.catalog.tasks.map((task) => {
            const draft = drafts[task.key]
            const taskModels = modelsByTask[task.key] ?? []
            const providers = snapshot.catalog.providers.filter((provider) =>
              taskModels.some((model) => model.provider === provider)
            )
            if (!draft) return null
            return (
              <LlmTaskCard
                key={task.key}
                task={task}
                draft={draft}
                saved={snapshot.tasks.find((item) => item.task === task.key)}
                models={taskModels}
                providerStates={snapshot.providers}
                providers={providers}
                busy={busy}
                onProviderChange={(provider) => changeProvider(task, provider)}
                onPatch={(patch) => patchDraft(task.key, patch)}
                onSave={() => void saveTask(task)}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}
