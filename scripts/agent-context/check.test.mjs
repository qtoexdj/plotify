import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const script = new URL('./check.mjs', import.meta.url)

async function write(root, relativePath, content) {
  const destination = join(root, relativePath)
  await mkdir(join(destination, '..'), { recursive: true })
  await writeFile(destination, content, 'utf8')
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'plotify-agent-context-'))
  await write(root, 'AGENTS.md', '# Reglas\n\nLee [memory.md](memory.md).\n')
  await write(
    root,
    'memory.md',
    '# Memoria\n\nConsulta [AGENTS.md](AGENTS.md).\n\n## Feature SDD activa\n\n`specs/019-hardening-produccion/`\n'
  )
  await write(root, 'specs/019-hardening-produccion/spec.md', '# Spec\n')
  await write(root, 'specs/019-hardening-produccion/plan.md', '# Plan\n')
  await write(root, 'specs/019-hardening-produccion/tasks.md', '# Tasks\n')
  await write(
    root,
    'plotify_memori/00 - Home.md',
    '# Home\n\n[Mapa Técnico](30 - Arquitectura/Mapa Técnico Actual.md)\n'
  )
  await write(root, 'plotify_memori/30 - Arquitectura/Mapa Técnico Actual.md', '# Mapa\n')
  await write(
    root,
    'package.json',
    '{"packageManager":"pnpm@11.22.0","engines":{"node":">=22.13"}}\n'
  )
  await write(
    root,
    'apps/web/package.json',
    '{"dependencies":{"next":"16.2.6","react":"19.2.8"}}\n'
  )
  await write(root, 'apps/api/requirements.txt', 'fastapi==0.135.1\nlanggraph==1.2.1\n')
  return root
}

test('accepts a complete agent context', async () => {
  const root = await fixture()
  try {
    const { checkContext } = await import(script)
    assert.deepEqual(await checkContext(root), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports a missing required SDD artifact', async () => {
  const root = await fixture()
  try {
    await rm(join(root, 'specs/019-hardening-produccion/tasks.md'))
    const { checkContext } = await import(script)
    assert.ok((await checkContext(root)).some((issue) => issue.includes('tasks.md')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
