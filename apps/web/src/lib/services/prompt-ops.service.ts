import { microserviceFetch } from './microservice.client'
import type { PromptWithActiveVersion, PromptVersion } from '@/types/v2'

export async function listPrompts(superAdminToken: string): Promise<PromptWithActiveVersion[]> {
  const { data, error } = await microserviceFetch<PromptWithActiveVersion[]>('/api/v1/prompts', {
    method: 'GET',
    superAdminToken,
  })
  if (error) throw new Error(error)
  return data ?? []
}

export async function listVersions(
  promptId: string,
  superAdminToken: string
): Promise<PromptVersion[]> {
  const { data, error } = await microserviceFetch<PromptVersion[]>(
    `/api/v1/prompts/${promptId}/versions`,
    { method: 'GET', superAdminToken }
  )
  if (error) throw new Error(error)
  return data ?? []
}

export async function createVersion(
  promptId: string,
  body: { content: string; change_note?: string; is_active?: boolean },
  superAdminToken: string
): Promise<PromptVersion> {
  const { data, error } = await microserviceFetch<PromptVersion>(
    `/api/v1/prompts/${promptId}/versions`,
    { method: 'POST', body, superAdminToken }
  )
  if (error) throw new Error(error)
  return data!
}

export async function activateVersion(
  promptId: string,
  versionId: string,
  superAdminToken: string
): Promise<void> {
  const { error } = await microserviceFetch(
    `/api/v1/prompts/${promptId}/versions/${versionId}/activate`,
    { method: 'POST', superAdminToken }
  )
  if (error) throw new Error(error)
}

export async function testInSandbox(
  body: {
    prompt_content: string
    test_message: string
    role: string
    organization_id: string
  },
  superAdminToken: string
): Promise<{ response: string }> {
  const { data, error } = await microserviceFetch<{ response: string }>(
    '/api/v1/prompts/sandbox/test',
    { method: 'POST', body, superAdminToken }
  )
  if (error) throw new Error(error)
  return data!
}
