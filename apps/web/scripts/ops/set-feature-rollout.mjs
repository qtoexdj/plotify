#!/usr/bin/env node
// Ops: habilita/deshabilita un feature rollout (SDD019) vía set_feature_rollout_control.
// Uso:
//   node scripts/ops/set-feature-rollout.mjs \
//     --org <organization_id> --feature <feature_key> --mode <off|projects|on> \
//     [--projects <uuid,uuid>] [--reason "texto"] [--actor ops-script] [--verify-project <uuid>]
//
// Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno,
// con fallback al .env de apps/web.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const FEATURES = ['automatic_escritura', 'canonical_geometry_import', 'document_capabilities']
const MODES = ['off', 'projects', 'on']

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue
    args[argv[i].slice(2)] = argv[i + 1]
    i += 1
  }
  return args
}

function loadEnvFallback() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env')
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
    }
  } catch {
    // sin .env: se exige el entorno
  }
}

const args = parseArgs(process.argv.slice(2))
const { org, feature, mode } = args
if (!org || !FEATURES.includes(feature) || !MODES.includes(mode)) {
  console.error(`Uso: --org <uuid> --feature <${FEATURES.join('|')}> --mode <${MODES.join('|')}>`)
  process.exit(1)
}
const projectIds = args.projects ? args.projects.split(',').map((id) => id.trim()) : null
if (mode === 'projects' && !projectIds?.length) {
  console.error('--mode projects requiere --projects <uuid,uuid>')
  process.exit(1)
}
const actor = args.actor ?? 'ops-script'
const reason = args.reason ?? `Set ${feature} -> ${mode} via scripts/ops/set-feature-rollout.mjs`

loadEnvFallback()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const { data: current, error: currentError } = await supabase
  .from('feature_rollout_controls')
  .select('id, mode, version')
  .eq('organization_id', org)
  .eq('feature_key', feature)
  .maybeSingle()
if (currentError) {
  console.error('No se pudo leer el control actual:', currentError.message)
  process.exit(1)
}
const expectedVersion = current?.version ?? 0
console.log(
  current
    ? `Control actual: mode=${current.mode} version=${current.version}`
    : 'Sin control previo (fail-closed: apagado)'
)

const requestPayload = { org, feature, mode, projectIds, expectedVersion }
const requestHash = createHash('sha256').update(JSON.stringify(requestPayload)).digest('hex')
const { data: operation, error: claimError } = await supabase.rpc('claim_idempotency_operation', {
  p_organization_id: org,
  p_principal_type: 'service',
  p_principal_subject: actor,
  p_operation_type: 'rollout_control.set',
  p_resource_scope: `org:${org}:${feature}`,
  p_idempotency_key: `rollout:${feature}:${mode}:v${expectedVersion + 1}`,
  p_request_hash: requestHash,
  p_source_kind: 'service',
  p_provider_event_key: null,
})
if (claimError || !operation) {
  console.error('claim_idempotency_operation falló:', claimError?.message)
  process.exit(1)
}
if (operation.status === 'succeeded') {
  console.log('Operación ya aplicada anteriormente (replay idempotente). Nada que hacer.')
  process.exit(0)
}

const { data: control, error: setError } = await supabase.rpc('set_feature_rollout_control', {
  p_organization_id: org,
  p_feature_key: feature,
  p_mode: mode,
  p_project_ids: projectIds,
  p_expected_version: expectedVersion,
  p_operation_id: operation.id,
  p_actor: actor,
  p_reason: reason,
})
if (setError || !control) {
  console.error('set_feature_rollout_control falló:', setError?.message)
  await supabase.rpc('complete_idempotency_operation', {
    p_operation_id: operation.id,
    p_request_hash: requestHash,
    p_status: 'failed',
    p_error_code: setError?.message?.slice(0, 120) ?? 'UNKNOWN',
  })
  process.exit(1)
}
await supabase.rpc('complete_idempotency_operation', {
  p_operation_id: operation.id,
  p_request_hash: requestHash,
  p_status: 'succeeded',
  p_resource_type: 'feature_rollout_controls',
  p_resource_id: control.id,
  p_response_summary: { feature, mode: control.mode, version: control.version },
})
console.log(`OK: ${feature} -> mode=${control.mode} version=${control.version}`)

const verifyProject = args['verify-project'] ?? projectIds?.[0] ?? null
const { data: resolved, error: resolveError } = await supabase.rpc('resolve_feature_rollout', {
  p_feature_key: feature,
  p_organization_id: org,
  p_project_id: verifyProject,
})
if (resolveError) console.error('Verificación falló:', resolveError.message)
else console.log(`resolve_feature_rollout(${verifyProject ?? 'sin proyecto'}) => ${resolved}`)
