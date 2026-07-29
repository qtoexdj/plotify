export const WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED = 'WEB_SECURITY_FOUNDATION_NOT_IMPLEMENTED'

export type WorkspaceRole = 'admin' | 'user'

export interface WorkspaceMembership {
  organizationId: string
  role: WorkspaceRole
  joinedAt: string
  active: boolean
}

export type ActiveWorkspaceResolution =
  | { status: 'none' }
  | { status: 'selected'; membership: WorkspaceMembership }
  | { status: 'selection_required'; memberships: WorkspaceMembership[] }
  | { status: 'stale_selection'; memberships: WorkspaceMembership[] }

export interface ResolveActiveWorkspaceInput {
  memberships: WorkspaceMembership[]
  selectedOrganizationId?: string | null
}

/**
 * Pure workspace-selection contract used by the server-side implementation in
 * T015. This RED-phase scaffold is deliberately loadable and never chooses a
 * membership implicitly.
 */
export function resolveActiveWorkspace(
  input: ResolveActiveWorkspaceInput
): ActiveWorkspaceResolution {
  const memberships = input.memberships.filter((membership) => membership.active)
  if (memberships.length === 0) return { status: 'none' }

  if (input.selectedOrganizationId) {
    const membership = memberships.find(
      (candidate) => candidate.organizationId === input.selectedOrganizationId
    )
    return membership
      ? { status: 'selected', membership }
      : { status: 'stale_selection', memberships }
  }

  if (memberships.length === 1) return { status: 'selected', membership: memberships[0] }
  return { status: 'selection_required', memberships }
}
