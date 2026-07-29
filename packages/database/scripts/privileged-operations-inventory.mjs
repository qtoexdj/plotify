#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { catalogSnapshot, isMain, packageDir, sha256, workspaceRoot } from './supabase-cli.mjs'

const REQUIRED_FIELDS = [
  'signature',
  'class',
  'actor',
  'tenant',
  'callers',
  'audit',
  'hash',
  'grant',
  'searchPath',
  'introduction',
]

export function normalizeDefaultAcl({ owner, schema, objectType, grantee, privilege }) {
  return `${owner}|${schema || '*'}|${objectType.toLowerCase().replace(/s$/, '')}|${grantee}|${privilege.toUpperCase()}`
}

export function validateClassificationRows(rows) {
  const signatures = new Set()
  for (const row of rows) {
    for (const field of REQUIRED_FIELDS) {
      if (row[field] === undefined || row[field] === '' || row[field] === null) {
        throw new Error(`classification row ${row.signature || '<unknown>'} is missing ${field}`)
      }
    }
    if (signatures.has(row.signature)) throw new Error(`duplicate signature: ${row.signature}`)
    signatures.add(row.signature)
    if (row.grant.some((grant) => grant.startsWith('PUBLIC:')) && row.actor !== 'public') {
      throw new Error(`broad grant requires actor=public review: ${row.signature}`)
    }
  }
  return rows
}

export function compareInventoryToClassification(inventory, classification) {
  validateClassificationRows(classification)
  const actual = new Set(inventory.map((row) => row.signature))
  const expected = new Set(classification.map((row) => row.signature))
  const missing = [...actual].filter((signature) => !expected.has(signature)).sort()
  const stale = [...expected].filter((signature) => !actual.has(signature)).sort()
  if (missing.length || stale.length) {
    throw new Error(
      [
        `missing classification: ${missing.join(', ') || 'none'}`,
        `stale classification: ${stale.join(', ') || 'none'}`,
      ].join('\n')
    )
  }
  const classificationBySignature = new Map(classification.map((row) => [row.signature, row]))
  for (const row of inventory) {
    const expectedRow = classificationBySignature.get(row.signature)
    for (const field of REQUIRED_FIELDS.filter((name) => name !== 'signature')) {
      if (JSON.stringify(row[field]) !== JSON.stringify(expectedRow[field])) {
        throw new Error(`classification drift for ${row.signature}: ${field}`)
      }
    }
  }
}

function normalizeSignature(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()
    .toLowerCase()
}

function classifyActor(grants) {
  if (grants.some((grant) => grant.startsWith('PUBLIC:') || grant.startsWith('anon:')))
    return 'public'
  if (grants.some((grant) => grant.startsWith('authenticated:'))) return 'authenticated'
  if (grants.some((grant) => grant.startsWith('service_role:'))) return 'service_role'
  return 'owner_only'
}

function migrationFiles() {
  const directory = join(packageDir, 'supabase', 'migrations')
  return readdirSync(directory)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(directory, name), 'utf8') }))
}

function grantsFor(signature, allSql) {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')
  const grants = []
  const expression = new RegExp(
    `grant\\s+execute\\s+on\\s+function\\s+${escaped}\\s+to\\s+([^;]+)`,
    'gi'
  )
  for (const match of allSql.matchAll(expression)) {
    for (const grantee of match[1].split(','))
      grants.push(`${grantee.trim().replaceAll('"', '')}:EXECUTE`)
  }
  return [...new Set(grants)].sort()
}

function collectDefaultAcls(files) {
  const rows = []
  const expression =
    /alter\s+default\s+privileges\s+for\s+role\s+(\S+)(?:\s+in\s+schema\s+(\S+))?\s+grant\s+([a-z, ]+)\s+on\s+(tables|functions|sequences)\s+to\s+(\S+)/gi
  for (const { sql } of files) {
    for (const match of sql.matchAll(expression)) {
      for (const privilege of match[3].split(',')) {
        rows.push({
          owner: match[1].replaceAll('"', ''),
          schema: match[2]?.replaceAll('"', '') || null,
          objectType: match[4],
          grantee: match[5].replaceAll('"', '').replace(/;$/, ''),
          privilege: privilege.trim(),
        })
      }
    }
  }
  return rows.sort((left, right) =>
    normalizeDefaultAcl(left).localeCompare(normalizeDefaultAcl(right))
  )
}

export function inventoryFromCanonicalMigrations() {
  const files = migrationFiles()
  const allSql = files.map(({ sql }) => sql).join('\n')
  const bySignature = new Map()
  const expression =
    /create\s+(?:or\s+replace\s+)?function\s+([^\n]+?\([^;]*?\))([\s\S]*?)\bas\s+(\$[a-z_]*\$)([\s\S]*?)\3\s*;/gi

  for (const file of files) {
    for (const match of file.sql.matchAll(expression)) {
      const signature = normalizeSignature(match[1])
      const declaration = match[0]
      const body = match[4]
      const grants = grantsFor(signature, allSql)
      const privileged = /security\s+definer/i.test(declaration) || grants.length > 0
      if (!privileged) continue
      const searchPath =
        declaration.match(/set\s+search_path\s*=\s*([^\n;]+)/i)?.[1]?.trim() || 'not_set'
      const tenant = /organization_id/i.test(body)
        ? 'organization_id'
        : /project_id/i.test(body)
          ? 'project_id'
          : 'none'
      const callers = []
      if (
        new RegExp(
          `execute\\s+function\\s+${signature.split('(')[0].replace('.', '\\.')}`,
          'i'
        ).test(allSql)
      )
        callers.push('trigger')
      if (/auth\.uid\(\)|current_setting\s*\(/i.test(body)) callers.push('authenticated_rpc')
      if (!callers.length) callers.push('direct_rpc')
      bySignature.set(signature, {
        signature,
        class: /security\s+definer/i.test(declaration)
          ? 'security_definer_function'
          : 'granted_function',
        actor: classifyActor(grants),
        tenant,
        callers,
        audit: /audit_logs|audit_event|audit_/i.test(body) ? 'atomic_audit' : 'none',
        hash: sha256(declaration.replace(/\s+/g, ' ').trim()),
        grant: grants,
        searchPath,
        introduction: file.name,
      })
    }
  }
  return {
    version: 'sdd019-privileged-inventory-v1',
    operations: [...bySignature.values()].sort((left, right) =>
      left.signature.localeCompare(right.signature)
    ),
    defaultAcls: collectDefaultAcls(files),
  }
}

function introductionFor(signature, files) {
  const functionName = signature.slice(0, signature.indexOf('(')).split('.').at(-1)
  return (
    files.find(({ sql }) =>
      new RegExp(`function\\s+(?:[a-z_]+\\.)?${functionName}\\s*\\(`, 'i').test(sql)
    )?.name || 'catalog_prebaseline'
  )
}

export function inventoryFromCatalog(target) {
  const catalogJson = catalogSnapshot(target)
  const catalog = JSON.parse(catalogJson)
  const files = migrationFiles()
  const searchableCallers = [
    ...catalog.triggers.map((trigger) => ({ kind: 'trigger', text: trigger.action_statement })),
    ...catalog.policies.map((policy) => ({
      kind: 'rls_policy',
      text: `${policy.qual || ''} ${policy.with_check || ''}`,
    })),
  ]
  const operations = catalog.functions
    .map((routine) => {
      const signature = normalizeSignature(routine.signature)
      const grants = [...new Set(routine.grants)].sort()
      const privileged =
        routine.security_definer ||
        grants.some((grant) => /^(PUBLIC|anon|authenticated|service_role):/.test(grant))
      if (!privileged) return null
      const definition = routine.definition
      const functionName = signature.slice(0, signature.indexOf('(')).split('.').at(-1)
      const callers = searchableCallers
        .filter((caller) => new RegExp(`\\b${functionName}\\s*\\(`, 'i').test(caller.text || ''))
        .map((caller) => caller.kind)
      if (!callers.length) callers.push('direct_rpc')
      const configuredSearchPath = routine.config
        .find((entry) => entry.startsWith('search_path='))
        ?.slice('search_path='.length)
      return {
        signature,
        class: routine.security_definer ? 'security_definer_function' : 'granted_function',
        actor: classifyActor(grants),
        tenant: /organization_id/i.test(definition)
          ? 'organization_id'
          : /project_id/i.test(definition)
            ? 'project_id'
            : 'none',
        callers: [...new Set(callers)].sort(),
        audit: /audit_logs|audit_event|audit_/i.test(definition) ? 'atomic_audit' : 'none',
        hash: sha256(definition.replace(/\s+/g, ' ').trim()),
        grant: grants,
        searchPath: configuredSearchPath || 'not_set',
        introduction: introductionFor(signature, files),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.signature.localeCompare(right.signature))
  return {
    version: 'sdd019-privileged-inventory-v1',
    operations,
    defaultAcls: catalog.defaultAcls.map((row) => ({
      owner: row.owner,
      schema: row.schema,
      objectType: row.object_type,
      grantee: row.grantee,
      privilege: row.privilege,
    })),
    schemaFingerprint: sha256(catalogJson),
    target,
  }
}

export function parseArguments(arguments_) {
  const options = {
    target: undefined,
    assertComplete: false,
    assertDefaultAcl: false,
    initialize: false,
  }
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--') continue
    if (argument === '--help') return { help: true }
    if (argument === '--assert-complete') options.assertComplete = true
    else if (argument === '--assert-default-acl') options.assertDefaultAcl = true
    else if (argument === '--initialize-classification') options.initialize = true
    else if (['--target', '--classification', '--output'].includes(argument)) {
      options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] =
        arguments_[++index]
    } else throw new Error(`unknown argument: ${argument}`)
  }
  if (options.target !== 'linked') {
    throw new Error('Cloud-only policy requires privileged:inventory --target linked')
  }
  if (!options.classification || !options.output)
    throw new Error('--classification and --output are required')
  return options
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      console.log(
        'Usage: privileged-operations-inventory.mjs --target linked --classification <json> --output <json> [--assert-complete] [--assert-default-acl]'
      )
      return 0
    }
    const inventory = inventoryFromCatalog(options.target)
    const classificationPath = resolve(workspaceRoot, options.classification)
    if (options.initialize)
      writeFileSync(classificationPath, `${JSON.stringify(inventory, null, 2)}\n`)
    const classification = JSON.parse(readFileSync(classificationPath, 'utf8'))
    if (options.assertComplete)
      compareInventoryToClassification(inventory.operations, classification.operations)
    if (options.assertDefaultAcl) {
      const actual = inventory.defaultAcls.map(normalizeDefaultAcl)
      const expected = classification.defaultAcls.map(normalizeDefaultAcl)
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error('default ACL classification mismatch')
    }
    writeFileSync(resolve(workspaceRoot, options.output), `${JSON.stringify(inventory, null, 2)}\n`)
    console.log(`Inventoried ${inventory.operations.length} privileged operations`)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
}

if (isMain(import.meta.url)) process.exitCode = main()
