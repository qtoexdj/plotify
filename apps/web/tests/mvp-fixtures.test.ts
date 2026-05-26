import { describe, expect, it } from 'vitest'

type MvpRole = 'admin' | 'vendor'

interface MvpUserState {
  userId: string
  organizationId: string
  role: MvpRole
  assignedProjectIds: string[]
}

export const mvpWebAuthFixtures = {
  admin: {
    userId: 'admin-a',
    organizationId: 'org-a',
    role: 'admin',
    assignedProjectIds: ['project-a'],
  },
  assignedVendor: {
    userId: 'vendor-a',
    organizationId: 'org-a',
    role: 'vendor',
    assignedProjectIds: ['project-a'],
  },
  unassignedVendor: {
    userId: 'vendor-unassigned',
    organizationId: 'org-a',
    role: 'vendor',
    assignedProjectIds: [],
  },
  foreignVendor: {
    userId: 'vendor-b',
    organizationId: 'org-b',
    role: 'vendor',
    assignedProjectIds: ['project-b'],
  },
} satisfies Record<string, MvpUserState>

function canOperateProject(user: MvpUserState, projectId: string, organizationId: string): boolean {
  if (user.organizationId !== organizationId) return false
  if (user.role === 'admin') return true
  return user.assignedProjectIds.includes(projectId)
}

describe('MVP web auth and organization fixtures', () => {
  it('model admin, assigned vendor, unassigned vendor, and foreign organization states', () => {
    expect(canOperateProject(mvpWebAuthFixtures.admin, 'project-a', 'org-a')).toBe(true)
    expect(canOperateProject(mvpWebAuthFixtures.assignedVendor, 'project-a', 'org-a')).toBe(true)
    expect(canOperateProject(mvpWebAuthFixtures.unassignedVendor, 'project-a', 'org-a')).toBe(false)
    expect(canOperateProject(mvpWebAuthFixtures.foreignVendor, 'project-a', 'org-a')).toBe(false)
  })

  it('keeps tenant identity explicit for every fixture', () => {
    const states = Object.values(mvpWebAuthFixtures)
    expect(states.every((state) => state.userId && state.organizationId)).toBe(true)
    expect(new Set(states.map((state) => state.organizationId))).toEqual(
      new Set(['org-a', 'org-b'])
    )
  })
})
