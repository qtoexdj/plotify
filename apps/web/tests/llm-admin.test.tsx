// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LlmAdminClient } from '@/components/super-admin/llms/llm-admin-client'

const snapshot = {
  catalog: {
    providers: ['openai', 'anthropic', 'deepseek', 'gemini'],
    tasks: [
      {
        key: 'conversation',
        label: 'Chat Telegram / WhatsApp',
        required_capabilities: ['tool_calling'],
      },
      {
        key: 'pdf_vision',
        label: 'Lectura visual de PDF',
        required_capabilities: ['pdf_input'],
      },
    ],
    models: [
      {
        provider: 'deepseek',
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        capabilities: ['tool_calling', 'structured_output', 'reasoning'],
        reasoning_options: ['off', 'high', 'max'],
      },
      {
        provider: 'openai',
        id: 'gpt-5.6-sol',
        label: 'GPT-5.6 Sol',
        capabilities: ['tool_calling', 'structured_output', 'pdf_input'],
        reasoning_options: ['off', 'low', 'medium', 'high'],
      },
      {
        provider: 'anthropic',
        id: 'claude-opus-4-8',
        label: 'Claude Opus 4.8',
        capabilities: ['tool_calling', 'structured_output'],
        reasoning_options: ['off'],
      },
      {
        provider: 'gemini',
        id: 'gemini-3.6-flash',
        label: 'Gemini 3.6 Flash',
        capabilities: ['tool_calling', 'structured_output', 'reasoning', 'pdf_input'],
        reasoning_options: ['off', 'minimal', 'low', 'medium', 'high'],
      },
    ],
  },
  providers: [
    {
      provider: 'deepseek',
      status: 'unconfigured',
      key_hint: null,
      version: 0,
      last_tested_at: null,
      last_error_code: null,
    },
  ],
  model_syncs: [
    {
      provider: 'deepseek',
      status: 'success',
      model_count: 1,
      last_synced_at: '2026-07-29T12:00:00Z',
      last_error_code: null,
    },
  ],
  tasks: [
    {
      task: 'conversation',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      reasoning_effort: 'off',
      enabled: true,
      version: 1,
    },
  ],
}

describe('LlmAdminClient', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => snapshot,
      })
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows providers and task assignments from the control plane', async () => {
    render(<LlmAdminClient />)

    expect(await screen.findByRole('heading', { name: 'Proveedores' })).toBeTruthy()
    expect(screen.getAllByText('DeepSeek').length).toBeGreaterThan(0)
    expect(screen.getByText('Chat Telegram / WhatsApp')).toBeTruthy()
  })

  it('renders the official provider logos from developer-icons', async () => {
    render(<LlmAdminClient />)

    await screen.findByRole('heading', { name: 'Proveedores' })
    expect(document.querySelector('[data-provider-icon="openai"]')).toBeTruthy()
    expect(document.querySelector('[data-provider-icon="anthropic"]')).toBeTruthy()
    expect(document.querySelector('[data-provider-icon="deepseek"]')).toBeTruthy()
    expect(document.querySelector('[data-provider-icon="gemini"]')).toBeTruthy()
  })

  it('uses a password input and clears the secret after saving', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => snapshot,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          provider: 'deepseek',
          status: 'active',
          key_hint: '••••••cret',
          version: 1,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => snapshot,
      } as Response)

    render(<LlmAdminClient />)

    const secretInput = await screen.findByLabelText('API key de DeepSeek')
    expect(secretInput.getAttribute('type')).toBe('password')

    fireEvent.change(secretInput, { target: { value: 'deepseek-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar clave de DeepSeek' }))

    await waitFor(() => expect((secretInput as HTMLInputElement).value).toBe(''))
    expect(document.body.textContent).not.toContain('deepseek-secret')
  })

  it('offers Gemini but not DeepSeek for PDF vision based on pdf_input', async () => {
    render(<LlmAdminClient />)

    await screen.findByText('Lectura visual de PDF')
    const visionProvider = screen.getByLabelText('Proveedor para Lectura visual de PDF')

    expect(visionProvider.querySelector('option[value="deepseek"]')).toBeNull()
    expect(visionProvider.querySelector('option[value="openai"]')).not.toBeNull()
    expect(visionProvider.querySelector('option[value="gemini"]')).not.toBeNull()
  })

  it('shows current OpenAI and Anthropic models in task selectors', async () => {
    render(<LlmAdminClient />)

    const provider = await screen.findByLabelText('Proveedor para Chat Telegram / WhatsApp')
    fireEvent.change(provider, { target: { value: 'openai' } })
    expect(screen.getByLabelText('Modelo para Chat Telegram / WhatsApp').textContent).toContain(
      'GPT-5.6 Sol'
    )

    fireEvent.change(provider, { target: { value: 'anthropic' } })
    expect(screen.getByLabelText('Modelo para Chat Telegram / WhatsApp').textContent).toContain(
      'Claude Opus 4.8'
    )
  })

  it('shows the full model catalog but locks model controls without an API key', async () => {
    render(<LlmAdminClient />)

    expect(await screen.findByRole('heading', { name: 'Catálogo de modelos' })).toBeTruthy()
    for (const provider of ['OpenAI', 'Anthropic', 'DeepSeek', 'Gemini']) {
      fireEvent.click(screen.getByRole('button', { name: `Mostrar modelos de ${provider}` }))
    }
    expect(screen.getAllByText('GPT-5.6 Sol').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Claude Opus 4.8').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DeepSeek V4 Pro').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Gemini 3.6 Flash').length).toBeGreaterThan(0)

    const model = screen.getByLabelText('Modelo para Chat Telegram / WhatsApp')
    const reasoning = screen.getByLabelText('Razonamiento para Chat Telegram / WhatsApp')
    expect((model as HTMLSelectElement).disabled).toBe(true)
    expect((reasoning as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getAllByText('Bloqueado · configura una API key').length).toBeGreaterThan(0)
  })

  it('allows a configured provider model catalog to be refreshed', async () => {
    const configuredSnapshot = {
      ...snapshot,
      providers: [
        {
          ...snapshot.providers[0],
          status: 'active',
          key_hint: '••••••cret',
        },
      ],
    }
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => configuredSnapshot,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ provider: 'deepseek', model_count: 2 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => configuredSnapshot,
      } as Response)

    render(<LlmAdminClient />)

    const refresh = await screen.findByRole('button', {
      name: 'Actualizar modelos de DeepSeek',
    })
    expect(
      (screen.getByLabelText('Modelo para Chat Telegram / WhatsApp') as HTMLSelectElement).disabled
    ).toBe(false)
    fireEvent.click(refresh)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/llms/providers/deepseek/models/sync', {
        method: 'POST',
      })
    )
  })

  it('distinguishes saved task settings from unsaved changes', async () => {
    const configuredSnapshot = {
      ...snapshot,
      providers: [
        {
          ...snapshot.providers[0],
          status: 'active',
          key_hint: '••••••cret',
        },
      ],
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => configuredSnapshot,
    } as Response)

    render(<LlmAdminClient />)

    expect(await screen.findByText('Configuración guardada')).toBeTruthy()
    const unchangedButton = screen.getByRole('button', { name: 'Sin cambios' })
    expect((unchangedButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Razonamiento para Chat Telegram / WhatsApp'), {
      target: { value: 'high' },
    })

    expect(screen.getByText('Cambios sin guardar')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled
    ).toBe(false)
  })

  it('collapses every provider model list behind an accessible toggle', async () => {
    render(<LlmAdminClient />)

    const toggle = await screen.findByRole('button', { name: 'Mostrar modelos de DeepSeek' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.getAttribute('aria-label')).toBe('Ocultar modelos de DeepSeek')
  })
})
