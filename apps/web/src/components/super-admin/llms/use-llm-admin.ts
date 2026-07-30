'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  PROVIDER_LABELS,
  type LlmSnapshot,
  type ModelDefinition,
  type Provider,
  type TaskDefinition,
  type TaskState,
} from './llm-types'

function supportsTask(model: ModelDefinition, task: TaskDefinition) {
  return task.required_capabilities.every((capability) => model.capabilities.includes(capability))
}

async function readPayload(response: Response) {
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || 'No se pudo guardar la configuración')
  }
  return payload
}

export function useLlmAdmin(endpoint: string) {
  const [snapshot, setSnapshot] = useState<LlmSnapshot | null>(null)
  const [secrets, setSecrets] = useState<Partial<Record<Provider, string>>>({})
  const [drafts, setDrafts] = useState<Record<string, TaskState>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const applySnapshot = useCallback((next: LlmSnapshot) => {
    setSnapshot(next)
    setDrafts(
      Object.fromEntries(
        next.catalog.tasks.map((task) => {
          const saved = next.tasks.find((item) => item.task === task.key)
          const compatible = next.catalog.models.find((model) => supportsTask(model, task))
          return [
            task.key,
            saved ?? {
              task: task.key,
              provider: compatible?.provider ?? 'openai',
              model: compatible?.id ?? '',
              reasoning_effort: compatible?.reasoning_options[0] ?? 'off',
              enabled: true,
              version: 0,
            },
          ]
        })
      )
    )
  }, [])

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' })
    const next = (await readPayload(response)) as LlmSnapshot
    applySnapshot(next)
  }, [applySnapshot, endpoint])

  useEffect(() => {
    let active = true
    void fetch(endpoint, { cache: 'no-store' })
      .then(readPayload)
      .then((payload: LlmSnapshot) => {
        if (active) applySnapshot(payload)
      })
      .catch(() => {
        if (active) setMessage('No se pudo cargar la configuración de LLMs.')
      })
    return () => {
      active = false
    }
  }, [applySnapshot, endpoint])

  const modelsByTask = useMemo(() => {
    if (!snapshot) return {}
    return Object.fromEntries(
      snapshot.catalog.tasks.map((task) => [
        task.key,
        snapshot.catalog.models.filter((model) => supportsTask(model, task)),
      ])
    )
  }, [snapshot])

  function setSecret(provider: Provider, value: string) {
    setSecrets((current) => ({ ...current, [provider]: value }))
  }

  async function saveCredential(provider: Provider) {
    const apiKey = secrets[provider]?.trim()
    if (!apiKey) return
    setBusy(`credential:${provider}`)
    setMessage(null)
    try {
      await readPayload(
        await fetch(`${endpoint}/providers/${provider}/credential`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey }),
        })
      )
      setSecret(provider, '')
      await load()
      setMessage(`Clave de ${PROVIDER_LABELS[provider]} guardada de forma segura.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la clave.')
    } finally {
      setBusy(null)
    }
  }

  async function syncModels(provider: Provider) {
    setBusy(`models:${provider}`)
    setMessage(null)
    try {
      const result = (await readPayload(
        await fetch(`${endpoint}/providers/${provider}/models/sync`, {
          method: 'POST',
        })
      )) as { model_count?: number }
      await load()
      setMessage(
        `${PROVIDER_LABELS[provider]} actualizado: ${result.model_count ?? 0} modelos disponibles.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron actualizar los modelos.')
    } finally {
      setBusy(null)
    }
  }

  function patchDraft(task: string, patch: Partial<TaskState>) {
    setDrafts((current) => ({ ...current, [task]: { ...current[task], ...patch } }))
  }

  function changeProvider(task: TaskDefinition, provider: Provider) {
    const model = (modelsByTask[task.key] ?? []).find((item) => item.provider === provider)
    if (!model) return
    patchDraft(task.key, {
      provider,
      model: model.id,
      reasoning_effort: model.reasoning_options[0] ?? 'off',
    })
  }

  async function saveTask(task: TaskDefinition) {
    const draft = drafts[task.key]
    if (!draft) return
    setBusy(`task:${task.key}`)
    setMessage(null)
    try {
      await readPayload(
        await fetch(`${endpoint}/tasks/${task.key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: draft.provider,
            model: draft.model,
            reasoning_effort: draft.reasoning_effort,
            enabled: draft.enabled,
            expected_version: draft.version,
          }),
        })
      )
      await load()
      setMessage(`Configuración de “${task.label}” actualizada.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la tarea.')
    } finally {
      setBusy(null)
    }
  }

  return {
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
  }
}
