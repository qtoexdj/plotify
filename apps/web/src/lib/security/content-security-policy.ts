type ContentSecurityPolicyOptions = {
  nonce: string
  isDevelopment: boolean
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
}: ContentSecurityPolicyOptions): string {
  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", 'https://telegram.org']

  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'")
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://demotiles.maplibre.org",
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]

  if (!isDevelopment) {
    directives.push('upgrade-insecure-requests')
  }

  return directives.join('; ')
}
