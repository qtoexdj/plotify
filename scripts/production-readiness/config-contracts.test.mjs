import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const root = new URL('.', import.meta.url).pathname
const schemaNames = [
  'report.schema.json',
  'evidence.schema.json',
  'feature-controls.schema.json',
  'deployment-manifest.schema.json',
  'deployment-trust-policy.schema.json',
  'runtime-config.schema.json',
  'privileged-http-surfaces.schema.json',
  'runtime-egress-surfaces.schema.json',
  'structured-log-policy.schema.json',
  'evidence-archive.schema.json',
]

function readJson(name) {
  return JSON.parse(readFileSync(join(root, name), 'utf8'))
}

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  return ajv
}

test('compiles every production-readiness JSON Schema strictly', () => {
  const ajv = validator()
  const schemas = schemaNames.map(readJson)
  for (const schema of schemas) assert.doesNotThrow(() => ajv.addSchema(schema), schema.$id)
  for (const schema of schemas)
    assert.equal(typeof ajv.getSchema(schema.$id), 'function', schema.$id)
})

test('pins versioned thresholds and tool checksums', () => {
  const thresholds = readJson('thresholds.json')
  const tools = readJson('tool-versions.json')

  assert.equal(thresholds.schemaVersion, 1)
  assert.equal(thresholds.attestationMaxAgeSeconds, 120)
  assert.equal(thresholds.writeMinimumIterations, 20)
  assert.equal(thresholds.linkedMinimumObservations, 30)
  assert.deepEqual(Object.keys(tools.tools).sort(), [
    'gitleaks',
    'pip-audit',
    'playwright',
    'supabase',
  ])
  for (const tool of Object.values(tools.tools)) assert.match(tool.sha256, /^sha256:[a-f0-9]{64}$/)
})

test('feature controls require the exact keys and modes', () => {
  const schema = readJson('feature-controls.schema.json')
  const keys = schema.properties.controls.propertyNames.enum
  const mode = schema.$defs.control.properties.mode.enum

  assert.deepEqual(keys, [
    'automatic_escritura',
    'canonical_geometry_import',
    'document_capabilities',
  ])
  assert.deepEqual(mode, ['off', 'projects', 'on'])
  assert.equal(schema.properties.controls.additionalProperties.$ref, '#/$defs/control')
  assert.equal(schema.additionalProperties, false)
})

test('deployment and runtime contracts require trust, roster, lifecycle, and hard-offs', () => {
  const manifest = readJson('deployment-manifest.schema.json')
  const runtime = readJson('runtime-config.schema.json')
  const requiredRuntimeKeys = [
    'PLOTIFY_HARD_OFF_AUTOMATIC_ESCRITURA',
    'PLOTIFY_HARD_OFF_CANONICAL_GEOMETRY_IMPORT',
    'PLOTIFY_HARD_OFF_DOCUMENT_CAPABILITIES',
    'PLOTIFY_RELEASE_CONFIG_VERSION',
  ]

  for (const field of ['provenance', 'expectedRoster', 'roleArtifactDigests', 'sourceSha']) {
    assert.ok(manifest.required.includes(field))
  }
  assert.deepEqual(runtime.properties.requiredDeploymentKeys.const, requiredRuntimeKeys)
  assert.ok(manifest.$defs.instance.required.includes('lifecycle'))
  assert.ok(manifest.$defs.instance.required.includes('artifactDigest'))
})

test('rejects extra feature controls and unsafe runtime config', () => {
  const ajv = validator()
  const controls = ajv.compile(readJson('feature-controls.schema.json'))
  const runtime = ajv.compile(readJson('runtime-config.schema.json'))

  assert.equal(
    controls({ schemaVersion: 1, controls: { unexpected: { mode: 'on', version: 1 } } }),
    false
  )
  assert.equal(
    runtime({
      schemaVersion: 1,
      environmentClass: 'production',
      requiredDeploymentKeys: [],
      secrets: [{ name: 'TOKEN', exposure: 'browser', present: true, fingerprint: 'default' }],
      endpoints: [{ name: 'API', scheme: 'http', host: 'example.com', browserExposed: true }],
    }),
    false
  )
})
