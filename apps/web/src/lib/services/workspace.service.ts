import { createClient } from '@/lib/supabase/server'
import type { Organization } from '@/types/database.types'

export interface WorkspaceDetails {
    organization: Organization
    role: 'admin' | 'user'
}

/**
 * Obtiene el Workspace activo del usuario validando la membresía.
 */
export async function getActiveWorkspace(userId: string): Promise<WorkspaceDetails | null> {
    const supabase = await createClient()

    // Dado que un usuario ahora puede pertenecer a más de una org, traemos la más reciente 
    // o a la que es dueño (is_personal = true). Por simplicidad actual traemos a la que es admin.
    // En un sistema multi-workspace maduro habría un selector en la UI.
    const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('role, organization_id, organizations(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (memberError || !memberData) {
        if (memberError && memberError.code !== 'PGRST116') {
            console.error('Error fetching workspace membership:', memberError)
        }
        return null
    }

    // organizations es retornado entero por la FK
    const org = memberData.organizations as unknown as Organization

    return {
        organization: org,
        role: memberData.role as 'admin' | 'user',
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
