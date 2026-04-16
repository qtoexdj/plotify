/**
 * FASE 1 — F-v2-1.2
 * Tests para src/lib/services/microservice.client.ts
 *
 * Como SECRET se captura al nivel de módulo (const SECRET = process.env...),
 * se usa vi.resetModules() + import dinámico en cada test para garantizar
 * que las variables de entorno se leen en el momento correcto.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mockear logger para evitar pino-pretty en entorno de test
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

describe('microserviceFetch', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.INTERNAL_API_SECRET = 'test-secret-123'
    process.env.PLOTIFY_CHAT_BASE_URL = 'http://localhost:8005'
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.INTERNAL_API_SECRET
    delete process.env.PLOTIFY_CHAT_BASE_URL
  })

  it('retorna { data, error: null, status: 200 } cuando la respuesta es OK', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ items: ['a', 'b'] }),
    } as Response)

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    const result = await microserviceFetch<{ items: string[] }>('/api/v1/test')

    expect(result.data).toEqual({ items: ['a', 'b'] })
    expect(result.error).toBeNull()
    expect(result.status).toBe(200)
  })

  it('construye la URL correcta combinando BASE_URL + path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    await microserviceFetch('/api/v1/approvals/request-reservation')

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'http://localhost:8005/api/v1/approvals/request-reservation',
      expect.any(Object)
    )
  })

  it('incluye el header X-Internal-Secret en todas las peticiones', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    await microserviceFetch('/api/v1/test')

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Internal-Secret': 'test-secret-123',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('incluye Authorization Bearer cuando se provee superAdminToken', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    await microserviceFetch('/api/v1/admin', { superAdminToken: 'super-jwt-token' })

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer super-jwt-token',
        }),
      })
    )
  })

  it('no incluye Authorization si no se pasa superAdminToken', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    await microserviceFetch('/api/v1/test')

    const callArgs = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(callArgs.headers as Record<string, string>).not.toHaveProperty('Authorization')
  })

  it('serializa body como JSON y usa el método HTTP especificado', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'new-id' }),
    } as Response)

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    await microserviceFetch('/api/v1/create', {
      method: 'POST',
      body: { lot_id: 'lot-1', organization_id: 'org-1' },
    })

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lot_id: 'lot-1', organization_id: 'org-1' }),
      })
    )
  })

  it('usa GET por defecto cuando no se especifica método', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ([]),
    } as Response)

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    await microserviceFetch('/api/v1/list')

    const callArgs = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(callArgs.method).toBe('GET')
  })

  it('retorna { data: null, error, status } cuando la respuesta no es OK con detail', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'Datos inválidos en el payload' }),
    } as Response)

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    const result = await microserviceFetch('/api/v1/test')

    expect(result.data).toBeNull()
    expect(result.error).toBe('Datos inválidos en el payload')
    expect(result.status).toBe(422)
  })

  it('retorna error genérico cuando la respuesta no-OK no contiene detail', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    } as Response)

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    const result = await microserviceFetch('/api/v1/test')

    expect(result.data).toBeNull()
    expect(result.error).toContain('500')
    expect(result.status).toBe(500)
  })

  it('retorna status 503 y error de conexión cuando fetch lanza excepción de red', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    const result = await microserviceFetch('/api/v1/test')

    expect(result.data).toBeNull()
    expect(result.status).toBe(503)
    expect(result.error).toBeTruthy()
  })

  it('retorna status 500 y no llama a fetch cuando INTERNAL_API_SECRET no está configurado', async () => {
    delete process.env.INTERNAL_API_SECRET
    vi.resetModules()

    const { microserviceFetch } = await import('@/lib/services/microservice.client')
    const result = await microserviceFetch('/api/v1/test')

    expect(result.data).toBeNull()
    expect(result.status).toBe(500)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
