import { logger } from '@/lib/logger'

const BASE_URL = process.env.PLOTIFY_CHAT_BASE_URL || 'http://127.0.0.1:8005'
const SECRET = process.env.INTERNAL_API_SECRET

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface MicroserviceOptions {
  method?: HttpMethod
  body?: unknown
  superAdminToken?: string
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
  const { method = 'GET', body, superAdminToken } = options

  if (!SECRET) {
    logger.error({ path }, '[microservice.client] INTERNAL_API_SECRET no configurado')
    return { data: null, error: 'Error de configuración del servidor', status: 500 }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Internal-Secret': SECRET,
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
    })

    if (!response.ok) {
      let errorMessage = `Error ${response.status} del microservicio`
      try {
        const errorData = await response.json()
        if (errorData.detail) errorMessage = errorData.detail
      } catch {
        // Ignorar error de parseo
      }
      logger.warn({ path, status: response.status, error: errorMessage }, '[microservice.client] Respuesta no OK')
      return { data: null, error: errorMessage, status: response.status }
    }

    const data = (await response.json()) as T
    return { data, error: null, status: response.status }
  } catch (err) {
    logger.error({ path, err }, '[microservice.client] Excepción al llamar al microservicio')
    return { data: null, error: 'No se pudo conectar con el microservicio', status: 503 }
  }
}
