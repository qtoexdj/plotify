import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database.types'

export interface OrganizationMemberWithProfile extends Profile {
    role: 'admin' | 'user'
    vendor_id?: string
}

/**
 * Obtiene todos los miembros de una organización con su información de perfil.
 */
export async function getOrganizationMembers(organizationId: string): Promise<OrganizationMemberWithProfile[]> {
    const supabase = await createClient()

    // 1. Obtener miembros de la organización con sus perfiles
    const { data: membersData, error: membersError } = await supabase
        .from('organization_members')
        .select(`
            role,
            profiles:user_id (
                id,
                updated_at,
                username,
                first_name,
                last_name,
                phone,
                avatar_url,
                website,
                is_super_admin
            )
        `)
        .eq('organization_id', organizationId)

    if (membersError) {
        console.error('Error fetching organization members:', membersError)
        throw new Error('No se pudieron obtener los miembros de la organización.')
    }

    // 2. Obtener todos los vendedores de la organización para mapear IDs
    const { data: vendorsData, error: vendorsError } = await supabase
        .from('vendors')
        .select('id, user_id')
        .eq('organization_id', organizationId)

    if (vendorsError) {
        console.error('Error fetching vendors for mapping:', vendorsError)
        // No lanzamos error si falla esto, solo no tendremos vendor_id
    }

    if (!membersData) return []

    // Crear un mapa de user_id -> vendor_id
    const vendorMap = new Map((vendorsData || []).map(v => [v.user_id, v.id]))

    interface MemberRecord {
        role: 'admin' | 'user'
        profiles: Profile | null
    }

    return (membersData as unknown as MemberRecord[]).map(item => ({
        ...(item.profiles as Profile),
        role: item.role,
        vendor_id: vendorMap.get(item.profiles?.id)
    }))
}

export interface ProjectVendorAssignment {
    rol: string
    vendor: {
        id: string
        nombre: string
        email: string
        phone: string | null
        user_id: string | null
        user_profile?: {
            id: string
            avatar_url: string | null
        }
    }
}

/**
 * Obtiene todos los vendedores asignados a un proyecto.
 */
export async function getProjectVendors(projectId: string): Promise<ProjectVendorAssignment[]> {
    const supabase = await createClient()

    const { data: assignments, error: assignmentsError } = await supabase
        .from('vendor_projects')
        .select(`
            rol,
            vendor:vendor_id (
                id,
                nombre,
                email,
                phone,
                user_id
            )
        `)
        .eq('project_id', projectId)

    if (assignmentsError) {
        console.error('Error fetching project vendors:', assignmentsError)
        throw new Error('No se pudieron obtener los vendedores del proyecto.')
    }

    if (!assignments || assignments.length === 0) return []

    const typedAssignments = assignments as unknown as ProjectVendorAssignment[]

    // Obtener los perfiles para todos los user_id involucrados
    const userIds = typedAssignments
        .map(a => a.vendor?.user_id)
        .filter(Boolean) as string[]

    if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, avatar_url')
            .in('id', userIds)

        if (!profilesError && profiles) {
            const profileMap = new Map(profiles.map(p => [p.id, p]))
            
            return typedAssignments.map(a => ({
                ...a,
                vendor: {
                    ...a.vendor,
                    user_profile: profileMap.get(a.vendor.user_id!)
                }
            }))
        }
    }

    return typedAssignments
}

/**
 * Asigna un vendedor a un proyecto.
 */
export async function assignVendorToProject(projectId: string, vendorId: string, rol: string = 'vendedor') {
    const supabase = await createClient()

    const { error } = await supabase
        .from('vendor_projects')
        .upsert({
            project_id: projectId,
            vendor_id: vendorId,
            rol: rol
        }, {
            onConflict: 'vendor_id, project_id'
        })

    if (error) {
        console.error('Error assigning vendor to project:', error)
        throw new Error('No se pudo asignar el vendedor al proyecto.')
    }

    return { success: true }
}

/**
 * Elimina la asignación de un vendedor a un proyecto.
 */
export async function unassignVendorFromProject(projectId: string, vendorId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('vendor_projects')
        .delete()
        .eq('project_id', projectId)
        .eq('vendor_id', vendorId)

    if (error) {
        console.error('Error unassigning vendor from project:', error)
        throw new Error('No se pudo eliminar la asignación del vendedor.')
    }

    return { success: true }
}
