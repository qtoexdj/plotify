export type Provider = 'openai' | 'anthropic' | 'deepseek' | 'gemini'

export interface ModelDefinition {
  provider: Provider
  id: string
  label: string
  capabilities: string[]
  reasoning_options: string[]
}

export interface TaskDefinition {
  key: string
  label: string
  required_capabilities: string[]
}

export interface ProviderState {
  provider: Provider
  status: string
  key_hint: string | null
  version: number
  last_tested_at: string | null
  last_error_code: string | null
}

export interface TaskState {
  task: string
  provider: Provider
  model: string
  reasoning_effort: string
  enabled: boolean
  version: number
}

export interface ModelSyncState {
  provider: Provider
  status: 'success' | 'error'
  model_count: number
  last_synced_at: string
  last_error_code: string | null
}

export interface LlmSnapshot {
  catalog: {
    providers: Provider[]
    tasks: TaskDefinition[]
    models: ModelDefinition[]
  }
  providers: ProviderState[]
  tasks: TaskState[]
  model_syncs?: ModelSyncState[]
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
}

export function hasActiveCredential(state?: ProviderState) {
  return state?.status === 'active'
}
