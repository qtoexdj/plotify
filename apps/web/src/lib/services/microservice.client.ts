import 'server-only'
import { logger } from '@/lib/logger'

// Browser callers always use a same-origin Next.js gateway; only this server-only
// adapter may resolve the private API origin.
const BASE_URL = process.env.PLOTIFY_CHAT_BASE_URL || 'http://127.0.0.1:8005'
const SECRET = process.env.INTERNAL_API_SECRET
const TOTAL_TIMEOUT_MS = 10_000

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface MicroserviceOptions {
  method?: HttpMethod
  body?: unknown
  superAdminToken?: string
  headers?: Record<string, string>
}

interface MicroserviceResponse<T = unknown> {
  data: T | null
  error: string | null
  status: number
}

export async function microserviceFetch<T = unknown>(
  path: string,
  options: MicroserviceOptions = {}
): Promise<MicroserviceResponse<T>> {
  const { method = 'GET', body, superAdminToken, headers: customHeaders } = options

  if (!SECRET) {
    logger.error({ path }, '[microservice.client] INTERNAL_API_SECRET no configurado')
    return { data: null, error: 'Error de configuración del servidor', status: 500 }
  }
  if (!path.startsWith('/api/v1/') || path.includes('..')) {
    return { data: null, error: 'Ruta interna no permitida', status: 400 }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Internal-Secret': SECRET,
    ...customHeaders,
  }

  if (superAdminToken) {
    headers['Authorization'] = `Bearer ${superAdminToken}`
  }

  const url = `${BASE_URL}${path}`

  try {
    const response = await fetch(url, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(TOTAL_TIMEOUT_MS),
    })

    if (!response.ok) {
      let errorMessage = `Error ${response.status} del microservicio`
      try {
        const errorData = await response.json()
        if (errorData.detail) errorMessage = errorData.detail
      } catch {
        // Ignorar error de parseo
      }
      logger.warn(
        { path, status: response.status, error: errorMessage },
        '[microservice.client] Respuesta no OK'
      )
      return { data: null, error: errorMessage, status: response.status }
    }

    const data = (await response.json()) as T
    return { data, error: null, status: response.status }
  } catch {
    logger.error(
      { path, code: 'UPSTREAM_UNAVAILABLE' },
      '[microservice.client] Excepción de conexión al microservicio'
    )
    return {
      data: null,
      error: 'No se pudo conectar con el servicio interno',
      status: 503,
    }
  }
}
