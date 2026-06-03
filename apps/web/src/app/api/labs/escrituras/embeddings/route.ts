import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdminRoute } from '@/lib/auth/require-super-admin-route'
import { logger } from '@/lib/logger'
import { disabledEscriturasLabResponse, isEscriturasLabEnabled } from '@/lib/labs/escrituras.guard'

export const runtime = 'nodejs'

const execFileAsync = promisify(execFile)
const EMBEDDING_TIMEOUT_MS = 30 * 60 * 1000

type CommandError = Error & {
  stdout?: string | Buffer
  stderr?: string | Buffer
  code?: number | string
  signal?: string | null
  killed?: boolean
}

function visibleStderr(value: string | Buffer | undefined) {
  return (value?.toString() ?? '')
    .split('\n')
    .filter((line) => !line.includes('Multiple definitions in dictionary'))
    .join('\n')
    .trim()
}

function resolveRepoRoot() {
  const cwd = process.cwd()
  return cwd.endsWith('/apps/web') ? resolve(cwd, '../..') : cwd
}

export async function POST(request: NextRequest) {
  if (!isEscriturasLabEnabled()) return disabledEscriturasLabResponse()

  const auth = await requireSuperAdminRoute(request)
  if ('response' in auth) return auth.response

  const repoRoot = resolveRepoRoot()
  const pythonPath = process.env.PLOTIFY_LAB_PYTHON ?? join(repoRoot, 'apps/api/venv/bin/python')

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonPath,
      ['-m', 'lab_escrituras.embeddings'],
      {
        cwd: repoRoot,
        timeout: EMBEDDING_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 4,
        env: {
          ...process.env,
          PYTHONPATH: join(repoRoot, 'labs/labs_escrituras/scripts'),
          PYTHONUNBUFFERED: '1',
        },
      }
    )

    return NextResponse.json({
      ok: true,
      stdout: stdout.trim(),
      stderr: visibleStderr(stderr),
    })
  } catch (error) {
    logger.error({ error }, 'lab_escrituras_embeddings_failed')
    const commandError = error as CommandError
    const stderr = visibleStderr(commandError.stderr)
    const message =
      stderr ||
      (commandError.code
        ? `El proceso termino con codigo ${commandError.code}.`
        : error instanceof Error
          ? error.message
          : 'No se pudieron generar embeddings.')
    return NextResponse.json(
      {
        error: message,
        stdout: commandError.stdout?.toString().trim() ?? '',
        stderr,
        code: commandError.code,
        signal: commandError.signal,
        killed: commandError.killed,
      },
      { status: 500 }
    )
  }
}
