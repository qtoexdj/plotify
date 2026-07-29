import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '../..')

export function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

export function fileDigest(path) {
  return sha256(readFileSync(resolve(path)))
}

export function readJson(path, code = 'OPERATOR_INPUT_INVALID') {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'))
  } catch (error) {
    throw new Error(`${code}: ${error.message}`)
  }
}

export function atomicWriteJson(path, document) {
  const resolved = resolve(path)
  mkdirSync(dirname(resolved), { recursive: true })
  const temporary = `${resolved}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, resolved)
}

export function targetFingerprint(projectRef) {
  return sha256(`supabase-project-v1:${projectRef}`)
}

export function parseOptions(argv, { booleans = [], values = [] } = {}) {
  const booleanSet = new Set(booleans)
  const valueSet = new Set(values)
  const result = { positional: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '--help' || argument === '-h') result.help = true
    else if (booleanSet.has(argument)) result[argument] = true
    else if (valueSet.has(argument)) {
      if (!argv[index + 1]) throw new Error(`OPERATOR_ARGUMENT_VALUE_REQUIRED: ${argument}`)
      result[argument] = argv[++index]
    } else if (argument.startsWith('-')) {
      throw new Error(`OPERATOR_ARGUMENT_UNKNOWN: ${argument}`)
    } else result.positional.push(argument)
  }
  return result
}
