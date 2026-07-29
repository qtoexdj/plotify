import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const FAILURE = 'AVATAR_LIST_FORBIDDEN'

function loadWebEnvironment() {
  const values: Record<string, string> = { ...process.env } as Record<string, string>

  for (const file of ['.env', '.env.production']) {
    try {
      for (const sourceLine of readFileSync(resolve(process.cwd(), file), 'utf8').split(/\r?\n/)) {
        const line = sourceLine.trim()
        if (!line || line.startsWith('#')) continue
        const separator = line.indexOf('=')
        if (separator < 1) continue
        const key = line.slice(0, separator).trim()
        if (values[key]) continue
        values[key] = line
          .slice(separator + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, '$2')
      }
    } catch {
      // CI may inject the same values without an env file.
    }
  }

  return values
}

function encodeObjectPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

type HttpResult = { status: number; body: string }

function curlRequest(options: {
  url: string
  method?: 'GET' | 'POST'
  headers?: string[]
  body?: string
  discardBody?: boolean
}): HttpResult {
  const quote = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  const config = [
    `url = "${quote(options.url)}"`,
    `request = "${options.method ?? 'GET'}"`,
    'silent',
    'show-error',
    'max-time = 20',
    ...(options.headers ?? []).map((header) => `header = "${quote(header)}"`),
    ...(options.body ? [`data = "${quote(options.body)}"`] : []),
    ...(options.discardBody ? ['output = "/dev/null"'] : []),
    'write-out = "\\n%{http_code}"',
  ].join('\n')
  const output = execFileSync('curl', ['--config', '-'], {
    input: config,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  })
  const separator = output.lastIndexOf('\n')
  return { body: output.slice(0, separator), status: Number(output.slice(separator + 1)) }
}

function parseObjectNames(response: HttpResult): string[] {
  if (response.status < 200 || response.status >= 300) return []
  const payload = JSON.parse(response.body) as unknown
  if (!Array.isArray(payload)) return []
  return payload.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !('name' in entry)) return []
    return typeof entry.name === 'string' ? [entry.name] : []
  })
}

describe('avatar Storage network boundary', () => {
  it('allows a known opaque object read without permitting anonymous enumeration', async () => {
    const env = loadWebEnvironment()
    const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

    if (!baseUrl || !anonKey || !serviceKey || !baseUrl.startsWith('https://')) {
      throw new Error(`${FAILURE}: linked cloud Storage credentials are unavailable`)
    }

    // Service access discovers one existing opaque fixture without persisting a
    // path, user identifier or credential in the repository.
    const serviceList = curlRequest({
      url: `${baseUrl}/storage/v1/object/list/avatars`,
      method: 'POST',
      headers: [
        `apikey: ${serviceKey}`,
        `authorization: Bearer ${serviceKey}`,
        'content-type: application/json',
      ],
      body: JSON.stringify({
        prefix: '',
        limit: 1,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      }),
    })
    const [knownObject] = parseObjectNames(serviceList)
    if (!knownObject) throw new Error(`${FAILURE}: avatars needs one opaque cloud fixture`)

    const knownRead = curlRequest({
      url: `${baseUrl}/storage/v1/object/public/avatars/${encodeObjectPath(knownObject)}`,
      headers: [`apikey: ${anonKey}`],
      discardBody: true,
    })
    expect(knownRead.status, 'known opaque avatar read').toBe(200)

    const anonymousList = curlRequest({
      url: `${baseUrl}/storage/v1/object/list/avatars`,
      method: 'POST',
      headers: [
        `apikey: ${anonKey}`,
        `authorization: Bearer ${anonKey}`,
        'content-type: application/json',
      ],
      body: JSON.stringify({ prefix: '', limit: 10, offset: 0 }),
    })
    const visibleNames = parseObjectNames(anonymousList)

    expect(visibleNames, FAILURE).toEqual([])
  }, 60_000)
})
