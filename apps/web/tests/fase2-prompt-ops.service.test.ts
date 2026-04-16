/**
 * FASE 2 — F-v2-2.1
 * Tests para src/lib/services/prompt-ops.service.ts
 *
 * Verifica que cada función del servicio:
 *   - llama a microserviceFetch con el path y opciones correctas
 *   - devuelve el valor de `data` cuando la respuesta es exitosa
 *   - lanza un Error cuando `error` no es null
 *   - incluye el superAdminToken en todas las llamadas
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: vi.fn(),
}))

import { microserviceFetch } from '@/lib/services/microservice.client'
import {
  listPrompts,
  listVersions,
  createVersion,
  activateVersion,
  testInSandbox,
} from '@/lib/services/prompt-ops.service'
import type { PromptWithActiveVersion, PromptVersion } from '@/types/v2'

const TOKEN = 'super-admin-jwt-test'
const PROMPT_ID = 'prompt-uuid-1'
const VERSION_ID = 'version-uuid-1'

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const mockPrompt: PromptWithActiveVersion = {
  id: PROMPT_ID,
  slug: 'sales_agent',
  name: 'Sales Agent',
  description: 'Agente de ventas',
  category: 'agent',
  created_at: '2026-03-31',
  updated_at: '2026-03-31',
  active_version: null,
}

const mockVersion: PromptVersion = {
  id: VERSION_ID,
  prompt_id: PROMPT_ID,
  version: 1,
  content: 'Eres un agente de ventas de Plotify...',
  is_active: true,
  change_note: 'Versión inicial',
  author_id: null,
  tested_at: null,
  created_at: '2026-03-31',
}

// ─── listPrompts ──────────────────────────────────────────────────────────────
describe('listPrompts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('llama a GET /api/v1/prompts con el superAdminToken', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: [mockPrompt],
      error: null,
      status: 200,
    })

    await listPrompts(TOKEN)

    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith('/api/v1/prompts', {
      method: 'GET',
      superAdminToken: TOKEN,
    })
  })

  it('retorna el array de prompts cuando la respuesta es exitosa', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: [mockPrompt],
      error: null,
      status: 200,
    })

    const result = await listPrompts(TOKEN)
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('sales_agent')
  })

  it('retorna [] cuando data es null', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: null,
      status: 200,
    })

    const result = await listPrompts(TOKEN)
    expect(result).toEqual([])
  })

  it('lanza Error cuando el microservicio responde con error', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'HTTP 403: Forbidden',
      status: 403,
    })

    await expect(listPrompts(TOKEN)).rejects.toThrow('HTTP 403: Forbidden')
  })
})

// ─── listVersions ─────────────────────────────────────────────────────────────
describe('listVersions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('llama a GET /api/v1/prompts/:id/versions con el superAdminToken', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: [mockVersion],
      error: null,
      status: 200,
    })

    await listVersions(PROMPT_ID, TOKEN)

    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith(
      `/api/v1/prompts/${PROMPT_ID}/versions`,
      { method: 'GET', superAdminToken: TOKEN }
    )
  })

  it('retorna el array de versiones cuando la respuesta es exitosa', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: [mockVersion],
      error: null,
      status: 200,
    })

    const result = await listVersions(PROMPT_ID, TOKEN)
    expect(result).toHaveLength(1)
    expect(result[0].version).toBe(1)
    expect(result[0].is_active).toBe(true)
  })

  it('retorna [] cuando data es null', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: null,
      status: 200,
    })

    const result = await listVersions(PROMPT_ID, TOKEN)
    expect(result).toEqual([])
  })

  it('lanza Error cuando el microservicio responde con error', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'HTTP 404: Not Found',
      status: 404,
    })

    await expect(listVersions(PROMPT_ID, TOKEN)).rejects.toThrow('HTTP 404: Not Found')
  })
})

// ─── createVersion ────────────────────────────────────────────────────────────
describe('createVersion', () => {
  beforeEach(() => vi.clearAllMocks())

  const body = {
    content: 'Nuevo contenido de prompt.',
    change_note: 'Se mejoró el tono',
    is_active: false,
  }

  it('llama a POST /api/v1/prompts/:id/versions con el body y superAdminToken', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { ...mockVersion, version: 2, is_active: false, content: body.content },
      error: null,
      status: 201,
    })

    await createVersion(PROMPT_ID, body, TOKEN)

    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith(
      `/api/v1/prompts/${PROMPT_ID}/versions`,
      { method: 'POST', body, superAdminToken: TOKEN }
    )
  })

  it('retorna la versión creada cuando la respuesta es exitosa', async () => {
    const newVersion: PromptVersion = {
      ...mockVersion,
      id: 'version-uuid-2',
      version: 2,
      is_active: false,
      content: body.content,
    }
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: newVersion,
      error: null,
      status: 201,
    })

    const result = await createVersion(PROMPT_ID, body, TOKEN)
    expect(result.version).toBe(2)
    expect(result.is_active).toBe(false)
    expect(result.content).toBe(body.content)
  })

  it('envía is_active: true cuando se quiere publicar el prompt', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { ...mockVersion, version: 2, is_active: true },
      error: null,
      status: 201,
    })

    await createVersion(PROMPT_ID, { content: 'Nuevo prompt', is_active: true }, TOKEN)

    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.objectContaining({ is_active: true }),
      })
    )
  })

  it('lanza Error cuando el microservicio responde con error', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'HTTP 422: Unprocessable Entity',
      status: 422,
    })

    await expect(createVersion(PROMPT_ID, body, TOKEN)).rejects.toThrow(
      'HTTP 422: Unprocessable Entity'
    )
  })
})

// ─── activateVersion ──────────────────────────────────────────────────────────
describe('activateVersion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('llama a POST /api/v1/prompts/:promptId/versions/:versionId/activate', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: null,
      status: 200,
    })

    await activateVersion(PROMPT_ID, VERSION_ID, TOKEN)

    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith(
      `/api/v1/prompts/${PROMPT_ID}/versions/${VERSION_ID}/activate`,
      { method: 'POST', superAdminToken: TOKEN }
    )
  })

  it('resuelve sin valor cuando la respuesta es exitosa', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: null,
      status: 200,
    })

    await expect(activateVersion(PROMPT_ID, VERSION_ID, TOKEN)).resolves.toBeUndefined()
  })

  it('lanza Error cuando el microservicio responde con error (rollback fallido)', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'HTTP 404: Version not found',
      status: 404,
    })

    await expect(activateVersion(PROMPT_ID, VERSION_ID, TOKEN)).rejects.toThrow(
      'HTTP 404: Version not found'
    )
  })
})

// ─── testInSandbox ────────────────────────────────────────────────────────────
describe('testInSandbox', () => {
  beforeEach(() => vi.clearAllMocks())

  const sandboxBody = {
    prompt_content: 'Eres un agente de prueba.',
    test_message: 'Hola, quiero ver parcelas',
    role: 'lead',
    organization_id: 'org-uuid-1',
  }

  it('llama a POST /api/v1/prompts/sandbox/test con el body y superAdminToken', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { response: 'Claro, tenemos estas parcelas disponibles...' },
      error: null,
      status: 200,
    })

    await testInSandbox(sandboxBody, TOKEN)

    expect(vi.mocked(microserviceFetch)).toHaveBeenCalledWith('/api/v1/prompts/sandbox/test', {
      method: 'POST',
      body: sandboxBody,
      superAdminToken: TOKEN,
    })
  })

  it('retorna el objeto { response } cuando la llamada es exitosa', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: { response: 'Tenemos 5 parcelas disponibles.' },
      error: null,
      status: 200,
    })

    const result = await testInSandbox(sandboxBody, TOKEN)
    expect(result.response).toBe('Tenemos 5 parcelas disponibles.')
  })

  it('envía el rol correcto (lead | vendor | admin)', async () => {
    vi.mocked(microserviceFetch).mockResolvedValue({
      data: { response: 'ok' },
      error: null,
      status: 200,
    })

    for (const role of ['lead', 'vendor', 'admin'] as const) {
      await testInSandbox({ ...sandboxBody, role }, TOKEN)
      expect(vi.mocked(microserviceFetch)).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ body: expect.objectContaining({ role }) })
      )
    }
  })

  it('lanza Error cuando el microservicio responde con error', async () => {
    vi.mocked(microserviceFetch).mockResolvedValueOnce({
      data: null,
      error: 'HTTP 500: Internal Server Error',
      status: 500,
    })

    await expect(testInSandbox(sandboxBody, TOKEN)).rejects.toThrow(
      'HTTP 500: Internal Server Error'
    )
  })
})
