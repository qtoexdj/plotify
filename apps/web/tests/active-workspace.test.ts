import { describe, expect, it } from 'vitest'
import {
  WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED,
  resolveActiveWorkspace,
  type ActiveWorkspaceResolution,
  type WorkspaceMembership,
} from '@/lib/auth/active-workspace'

const adminA: WorkspaceMembership = {
  organizationId: 'org-a',
  role: 'admin',
  joinedAt: '2026-01-01T00:00:00.000Z',
  active: true,
}

const sellerB: WorkspaceMembership = {
  organizationId: 'org-b',
  role: 'user',
  joinedAt: '2026-07-01T00:00:00.000Z',
  active: true,
}

function recordResolution(
  failures: string[],
  name: string,
  run: () => ActiveWorkspaceResolution,
  expected: ActiveWorkspaceResolution
) {
  try {
    expect(run(), name).toEqual(expected)
  } catch (error) {
    if (error instanceof Error && error.message === WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED) {
      failures.push(`${name}: ${error.message}`)
      return
    }
    throw error
  }
}

describe('active workspace contract (RED)', () => {
  it('aggregates explicit-selection failures without a latest-membership fallback', () => {
    const failures: string[] = []

    recordResolution(
      failures,
      'zero memberships',
      () => resolveActiveWorkspace({ memberships: [] }),
      { status: 'none' }
    )

    recordResolution(
      failures,
      'single active membership',
      () => resolveActiveWorkspace({ memberships: [adminA] }),
      {
        status: 'selected',
        membership: adminA,
      }
    )

    recordResolution(
      failures,
      'explicit membership among many',
      () =>
        resolveActiveWorkspace({
          memberships: [sellerB, adminA],
          selectedOrganizationId: 'org-a',
        }),
      {
        status: 'selected',
        membership: adminA,
      }
    )

    recordResolution(
      failures,
      'multiple memberships require selection',
      () => resolveActiveWorkspace({ memberships: [sellerB, adminA] }),
      {
        status: 'selection_required',
        memberships: [sellerB, adminA],
      }
    )

    recordResolution(
      failures,
      'stale explicit selection',
      () =>
        resolveActiveWorkspace({
          memberships: [sellerB, adminA],
          selectedOrganizationId: 'org-retired',
        }),
      {
        status: 'stale_selection',
        memberships: [sellerB, adminA],
      }
    )

    expect(failures, WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED).toEqual([])
  })
})
