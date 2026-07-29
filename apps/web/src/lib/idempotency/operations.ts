export const IDEMPOTENCY_CONFLICT_NOT_IMPLEMENTED = 'IDEMPOTENCY_CONFLICT_NOT_IMPLEMENTED'

export interface UploadMetadata {
  filename: string
  contentType: string
  size: number
  sha256: string
}

export interface OperationIdentity {
  operationKey: string
  requestHash: string
  scope: string
}

export type ReplayDecision = 'claim' | 'replay' | 'conflict'

export function canonicalizeJcs(_value: unknown): string {
  const serialize = (value: unknown): string => {
    if (value === null) return 'null'
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('JCS_NON_FINITE_NUMBER')
      return JSON.stringify(Object.is(value, -0) ? 0 : value)
    }
    if (value instanceof Date) return JSON.stringify(value.toISOString())
    if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      const entries = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`)
      return `{${entries.join(',')}}`
    }
    throw new TypeError('JCS_UNSUPPORTED_VALUE')
  }
  return serialize(_value)
}

export async function canonicalRequestHash(_value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeJcs(_value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`
}

export async function canonicalUploadMetadata(
  _bytes: Uint8Array,
  _filename: string,
  _contentType: string
): Promise<UploadMetadata> {
  // Copy into an ArrayBuffer-backed view: callers may provide a view backed by
  // SharedArrayBuffer, while Web Crypto deliberately accepts only BufferSource.
  const uploadBytes = Uint8Array.from(_bytes)
  const digest = await crypto.subtle.digest('SHA-256', uploadBytes)
  return {
    filename: _filename,
    contentType: _contentType,
    size: _bytes.byteLength,
    sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    ),
  }
}

export function decideReplay(
  _existing: OperationIdentity | null,
  _incoming: OperationIdentity
): ReplayDecision {
  if (!_existing || _existing.operationKey !== _incoming.operationKey) return 'claim'
  if (_existing.requestHash === _incoming.requestHash && _existing.scope === _incoming.scope) {
    return 'replay'
  }
  return 'conflict'
}
