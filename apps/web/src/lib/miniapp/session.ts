export interface MiniappUser {
  id: string
  nombre: string
  org_id: string
  org_nombre: string
}

export interface MiniappSession {
  token: string
  role: string
  user: MiniappUser
  bot_username?: string | null
}

const SESSION_KEY = 'plotify_miniapp_session'

/**
 * Obtiene la sesión de la mini app desde localStorage.
 */
export function getMiniappSession(): MiniappSession | null {
  if (typeof window === 'undefined') return null
  try {
    const data = localStorage.getItem(SESSION_KEY)
    if (!data) return null
    return JSON.parse(data)
  } catch {
    return null
  }
}

/**
 * Guarda la sesión de la mini app en localStorage.
 */
export function setMiniappSession(session: MiniappSession): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Silenciar posibles errores de escritura de localStorage en entornos restringidos
  }
}

/**
 * Limpia la sesión almacenada.
 */
export function clearMiniappSession(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Silenciar posibles errores
  }
}

/**
 * Decodifica el token JWT de forma nativa mediante Base64 y valida su expiración.
 * Retorna true si el token está expirado, es nulo o tiene formato inválido.
 */
export function isSessionExpired(token: string | null): boolean {
  if (!token) return true
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true

    // Decodificar el payload en base64 (segunda parte del JWT)
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')

    // atob decodifica la cadena codificada en base64
    const payloadJson = atob(base64)
    const payload = JSON.parse(payloadJson)

    if (!payload.exp) return true

    // Comparar contra el timestamp actual en segundos
    const now = Math.floor(Date.now() / 1000)
    return now >= payload.exp
  } catch {
    return true
  }
}
