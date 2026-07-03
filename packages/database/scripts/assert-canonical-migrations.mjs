import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = resolve(packageDir, '..', '..')
const canonicalDir = join(packageDir, 'supabase', 'migrations')

const expectedBaselineFiles = [
  '20260414000100_baseline_local_validated.sql',
  '20260414000200_fix_security_definer_search_path.sql',
  '20260414000300_add_missing_fk_indexes.sql',
]

const servidumbrePrecisionMigration = '20260702000100_servidumbre_precision.sql'
const servidumbrePrecisionRequiredFragments = [
  {
    fragment: 'create table',
    description: 'create project_road_segments table',
  },
  {
    fragment: 'project_road_segments',
    description: 'define project road segment persistence',
  },
  {
    fragment: 'input_mode',
    description: 'persist road input interpretation mode',
  },
  {
    fragment: 'width_m',
    description: 'persist road width in meters',
  },
  {
    fragment: 'footprint_geometry',
    description: 'persist normalized road footprint geometry',
  },
  {
    fragment: 'servidumbre_widths_m',
    description: 'add lot multiple-width result column',
  },
  {
    fragment: 'servidumbre_ancho_label',
    description: 'add lot width label result column',
  },
  {
    fragment: 'servidumbre_geometry',
    description: 'add lot servitude overlay geometry column',
  },
  {
    fragment: 'servidumbre_sources',
    description: 'add lot servitude traceability column',
  },
  {
    fragment: 'servidumbre_calculation_status',
    description: 'add lot calculation status column',
  },
  {
    fragment: 'servidumbre_calculated_at',
    description: 'add lot calculated timestamp column',
  },
  {
    fragment: 'servidumbre_calculation_version',
    description: 'add lot calculation version column',
  },
  {
    fragment: 'comment on column',
    description: 'document legal/geometry columns with SQL comments',
  },
  {
    fragment: 'create index',
    description: 'add lookup indexes for segments and viewer overlays',
  },
]

const legacyMigrationDirs = [
  join(workspaceRoot, 'apps', 'web', 'supabase', 'migrations'),
  join(workspaceRoot, 'apps', 'api', 'supabase', 'migrations'),
]

function fail(message) {
  console.error(`Migration source check failed: ${message}`)
  process.exitCode = 1
}

function listSqlFiles(dir) {
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
}

if (!existsSync(canonicalDir) || !statSync(canonicalDir).isDirectory()) {
  fail(`canonical migrations directory is missing: ${relative(workspaceRoot, canonicalDir)}`)
} else {
  const canonicalSqlFiles = listSqlFiles(canonicalDir)

  for (const expectedFile of expectedBaselineFiles) {
    if (!canonicalSqlFiles.includes(expectedFile)) {
      fail(
        `expected baseline migration is missing: ${relative(workspaceRoot, join(canonicalDir, expectedFile))}`
      )
    }
  }

  for (const migrationFile of canonicalSqlFiles) {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(migrationFile)) {
      fail(`canonical migration does not follow timestamp_name.sql format: ${migrationFile}`)
    }

    // Static assertions for notification migrations to prevent commercial state duplication
    if (migrationFile.includes('notification')) {
      const content = readFileSync(join(canonicalDir, migrationFile), 'utf8')
      const lowerContent = content.toLowerCase()

      if (lowerContent.includes('reservation_status') || lowerContent.includes('sale_status')) {
        fail(
          `Notification migration must not duplicate commercial approval state (detected reservation_status or sale_status): ${migrationFile}`
        )
      }

      if (!lowerContent.includes('approval_requests') && !lowerContent.includes('approval_id')) {
        fail(`Notification migration must reference approval_requests: ${migrationFile}`)
      }

      if (!lowerContent.includes('read_at') && !lowerContent.includes('dismissed_at')) {
        fail(
          `Notification migration must contain read or dismissal metadata (read_at/dismissed_at): ${migrationFile}`
        )
      }
    }
  }

  if (!canonicalSqlFiles.includes(servidumbrePrecisionMigration)) {
    fail(
      `SDD14 migration is missing: ${relative(workspaceRoot, join(canonicalDir, servidumbrePrecisionMigration))}`
    )
  } else {
    const content = readFileSync(join(canonicalDir, servidumbrePrecisionMigration), 'utf8')
    const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ')

    for (const { fragment, description } of servidumbrePrecisionRequiredFragments) {
      if (!normalizedContent.includes(fragment)) {
        fail(`SDD14 migration must ${description} (missing "${fragment}")`)
      }
    }

    if (!normalizedContent.includes('references projects')) {
      fail('SDD14 migration must link project_road_segments to projects')
    }

    if (
      !normalizedContent.includes('geometry_id') ||
      !normalizedContent.includes('references geometries')
    ) {
      fail('SDD14 migration must optionally link road segments to source geometries')
    }

    if (!normalizedContent.includes('status') || !normalizedContent.includes('ready')) {
      fail('SDD14 migration must persist road segment readiness status')
    }
  }
}

for (const legacyDir of legacyMigrationDirs) {
  const legacySqlFiles = listSqlFiles(legacyDir)

  if (legacySqlFiles.length > 0) {
    fail(
      `legacy migration directory must stay empty or absent: ${relative(workspaceRoot, legacyDir)} contains ${legacySqlFiles.join(', ')}`
    )
  }
}

if (!process.exitCode) {
  console.log('Canonical Supabase migration source is valid.')
  console.log(`Use only ${relative(workspaceRoot, canonicalDir)} for new migrations.`)
}
