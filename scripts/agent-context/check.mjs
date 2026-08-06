import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function read(root, relativePath, issues) {
  const path = join(root, relativePath)
  if (!(await exists(path))) {
    issues.push(`Falta ${relativePath}`)
    return ''
  }
  return readFile(path, 'utf8')
}

function activeFeature(memory) {
  const start = memory.indexOf('Feature SDD activa')
  return start === -1
    ? undefined
    : memory.slice(start, start + 240).match(/`(specs\/[^`]+\/)`/)?.[1]
}

function packageValue(content, section, name) {
  try {
    return JSON.parse(content)[section]?.[name]
  } catch {
    return undefined
  }
}

export async function checkContext(root) {
  const issues = []
  const agents = await read(root, 'AGENTS.md', issues)
  const memory = await read(root, 'memory.md', issues)

  if (agents && !agents.includes('memory.md')) issues.push('AGENTS.md no referencia memory.md')
  if (memory && !memory.includes('AGENTS.md')) issues.push('memory.md no referencia AGENTS.md')

  const feature = activeFeature(memory)
  if (!feature) {
    issues.push('memory.md no declara una feature SDD activa')
  } else {
    for (const artifact of ['spec.md', 'plan.md', 'tasks.md']) {
      if (!(await exists(join(root, feature, artifact)))) issues.push(`Falta ${feature}${artifact}`)
    }
  }

  for (const retired of ['.agents/rules', '.agents/workflows']) {
    if (await exists(join(root, retired))) issues.push(`Directorio retirado todavía existe: ${retired}`)
  }

  const home = await read(root, 'plotify_memori/00 - Home.md', issues)
  if (home && !home.includes('Mapa Técnico')) issues.push('El Home de Obsidian no enlaza el mapa técnico')
  await read(root, 'plotify_memori/30 - Arquitectura/Mapa Técnico Actual.md', issues)

  const rootPackage = await read(root, 'package.json', issues)
  const webPackage = await read(root, 'apps/web/package.json', issues)
  const requirements = await read(root, 'apps/api/requirements.txt', issues)
  for (const [content, expected, label] of [
    [rootPackage, 'pnpm@11.3.0', 'pnpm 11.3.0'],
    [rootPackage, '>=22.13', 'Node >=22.13'],
    [requirements, 'fastapi==0.135.1', 'FastAPI 0.135.1'],
    [requirements, 'langgraph==1.2.1', 'LangGraph 1.2.1'],
  ]) {
    if (content && !content.includes(expected)) issues.push(`No coincide la fuente de ${label}`)
  }
  if (webPackage && packageValue(webPackage, 'dependencies', 'next') !== '16.2.6') {
    issues.push('No coincide la fuente de Next 16.2.6')
  }
  if (webPackage && packageValue(webPackage, 'dependencies', 'react') !== '19.2.4') {
    issues.push('No coincide la fuente de React 19.2.4')
  }
  return issues
}

async function main() {
  const rootFlag = process.argv.indexOf('--root')
  const root = rootFlag === -1 ? process.cwd() : resolve(process.argv[rootFlag + 1] ?? '')
  const issues = await checkContext(root)
  if (issues.length) {
    for (const issue of issues) console.error(`ERROR: ${issue}`)
    process.exitCode = 1
    return
  }
  console.log('Contexto de agentes consistente.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
