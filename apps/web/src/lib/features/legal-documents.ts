type FeatureEnv = Record<string, string | undefined>

function readCsvSet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

function isExplicitlyDisabled(value: string | undefined): boolean {
  return ['0', 'false', 'off', 'disabled'].includes((value ?? '').trim().toLowerCase())
}

function readFlag(env: FeatureEnv): string | undefined {
  return env.ENABLE_LEGAL_DOCUMENTS ?? env.NEXT_PUBLIC_ENABLE_LEGAL_DOCUMENTS
}

export function isLegalDocumentsFeatureEnabled({
  organizationId,
  projectId,
  env = process.env,
}: {
  organizationId?: string | null
  projectId?: string | null
  env?: FeatureEnv
} = {}): boolean {
  if (isExplicitlyDisabled(readFlag(env))) {
    return false
  }

  const organizationAllowlist = readCsvSet(env.LEGAL_DOCUMENTS_ORG_ALLOWLIST)
  if (
    organizationAllowlist.size > 0 &&
    (!organizationId || !organizationAllowlist.has(organizationId))
  ) {
    return false
  }

  const projectAllowlist = readCsvSet(env.LEGAL_DOCUMENTS_PROJECT_ALLOWLIST)
  if (projectAllowlist.size > 0 && (!projectId || !projectAllowlist.has(projectId))) {
    return false
  }

  return true
}
