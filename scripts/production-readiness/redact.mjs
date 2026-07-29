const REDACTED = '[REDACTED]'

const PRESERVED_KEY = /(^|_)(id|ids|sha|sha256|hash|digest|fingerprint|code|status|kind)$/i
const SENSITIVE_KEY =
  /(authorization|cookie|password|secret|token|signed.?url|email|phone|rut|buyer|recipient|document.?text|body|content|plaintext)/i
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE = /(?<![a-f0-9])(?:\+?56[\s-]?)?(?:9[\s-]?)?\d{4}[\s-]?\d{4}(?![a-f0-9])/gi
const SIGNED_QUERY =
  /([?&](?:token|signature|sig|x-amz-signature|x-goog-signature|expires)=[^&#\s]+)/gi

function redactString(value) {
  return value
    .replace(BEARER, `Bearer ${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(EMAIL, REDACTED)
    .replace(PHONE, REDACTED)
    .replace(SIGNED_QUERY, (match) => `${match.slice(0, match.indexOf('=') + 1)}${REDACTED}`)
}

export function redact(value, key = '') {
  if (value === null || value === undefined) return value
  if (PRESERVED_KEY.test(key)) return value
  if (SENSITIVE_KEY.test(key)) return REDACTED
  if (Array.isArray(value)) return value.map((item) => redact(item, key))
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redact(childValue, childKey),
      ])
    )
  }
  if (typeof value === 'string') return redactString(value)
  return value
}

export function assertRedacted(value) {
  const serialized = JSON.stringify(value)
  const unsafe = [BEARER, JWT, EMAIL, PHONE, SIGNED_QUERY].find((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(serialized.replaceAll(REDACTED, ''))
  })
  if (unsafe) throw new Error('REDACTION_INCOMPLETE')
  return value
}
