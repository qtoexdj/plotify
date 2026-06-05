import { describe, expect, it } from 'vitest'

import { isLegalDocumentsFeatureEnabled } from '../src/lib/features/legal-documents'

describe('T063 - legal documents rollout controls', () => {
  it('keeps legal documents enabled by default for the pilot flow', () => {
    expect(isLegalDocumentsFeatureEnabled({ env: {} })).toBe(true)
  })

  it('allows disabling legal extraction and readiness globally', () => {
    expect(
      isLegalDocumentsFeatureEnabled({
        env: { ENABLE_LEGAL_DOCUMENTS: 'false' },
        organizationId: 'org-1',
        projectId: 'project-1',
      })
    ).toBe(false)
  })

  it('requires organization and project membership when rollout allowlists are configured', () => {
    const env = {
      LEGAL_DOCUMENTS_ORG_ALLOWLIST: 'org-enabled',
      LEGAL_DOCUMENTS_PROJECT_ALLOWLIST: 'project-enabled',
    }

    expect(
      isLegalDocumentsFeatureEnabled({
        env,
        organizationId: 'org-enabled',
        projectId: 'project-enabled',
      })
    ).toBe(true)
    expect(
      isLegalDocumentsFeatureEnabled({
        env,
        organizationId: 'org-enabled',
        projectId: 'project-disabled',
      })
    ).toBe(false)
    expect(
      isLegalDocumentsFeatureEnabled({
        env,
        organizationId: 'org-disabled',
        projectId: 'project-enabled',
      })
    ).toBe(false)
  })
})
