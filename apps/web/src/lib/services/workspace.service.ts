import { createClient } from '@/lib/supabase/server'
import type { Organization } from '@/types/database.types'
import { cookies } from 'next/headers'
import { resolveActiveWorkspace, type WorkspaceMembership } from '@/lib/auth/active-workspace'

export const ACTIVE_WORKSPACE_COOKIE = 'plotify_active_workspace'

export interface WorkspaceDetails {
  organization: Organization
  role: 'admin' | 'user'
}

export interface WorkspaceOption {
  organizationId: string
  organizationName: string
  role: 'admin' | 'user'
}

async function listWorkspaceMemberships(userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organization_members')
    .select('role, organization_id, created_at, organizations(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw new Error('No se pudieron validar los workspaces del usuario.')
  return (data ?? []).map((row) => ({
    membership: {
      organizationId: row.organization_id,
      role: row.role as 'admin' | 'user',
      joinedAt: row.created_at,
      active: true,
    } satisfies WorkspaceMembership,
    organization: row.organizations as unknown as Organization,
  }))
}

export async function getWorkspaceOptions(userId: string): Promise<WorkspaceOption[]> {
  const rows = await listWorkspaceMemberships(userId)
  return rows.map(({ membership, organization }) => ({
    organizationId: membership.organizationId,
    organizationName: organization.name,
    role: membership.role,
  }))
}

/**
 * Obtiene el Workspace activo del usuario validando la membresía.
 */
export async function getActiveWorkspace(userId: string): Promise<WorkspaceDetails | null> {
  const rows = await listWorkspaceMemberships(userId)
  const cookieStore = await cookies()
  const resolution = resolveActiveWorkspace({
    memberships: rows.map((row) => row.membership),
    selectedOrganizationId: cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value,
  })
  if (resolution.status !== 'selected') return null
  const selected = rows.find(
    (row) => row.membership.organizationId === resolution.membership.organizationId
  )
  if (!selected) return null

  return {
    organization: selected.organization,
    role: selected.membership.role,
  }
}

/**
 * Actualiza el detalle del Workspace. Solo el Admin puede hacer esto.
 */
export async function updateWorkspace(
  orgId: string,
  userId: string,
  updates: Partial<Organization>
): Promise<Organization> {
  const supabase = await createClient()

  // RLS asegura que solo org_admin pueda hacer update (verificamos si acaso en el JWT o la sesion)
  const { data, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', orgId)
    .select()
    .single()

  if (error) {
    console.error('Error updating workspace:', error)
    throw new Error('No se pudo actualizar la configuración del Workspace.')
  }

  return data
}
