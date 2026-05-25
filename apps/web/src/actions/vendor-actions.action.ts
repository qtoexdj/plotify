'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getOrganizationMembers } from '@/lib/services/vendors.service'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/services/audit.service'

interface ActionResult {
  success: boolean
  message?: string
  error?: string
}

/**
 * Reenvía el email de invitación a un vendedor.
 * Usa admin.inviteUserByEmail() nuevamente con el email del usuario.
 */
export async function resendVendorInvite(
  vendorEmail: string,
  organizationId: string
): Promise<ActionResult> {
  if (!vendorEmail) {
    return { success: false, error: 'Email del vendedor no proporcionado' }
  }

  try {
    // Verificar que el usuario actual es admin
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'No autenticado' }
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'admin') {
      return { success: false, error: 'Solo los administradores pueden reenviar invitaciones' }
    }

    // Reenviar invitación
    const serviceClient = createServiceClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(vendorEmail, {
      redirectTo: `${appUrl}/auth/callback`,
      data: {
        organization_id: organizationId,
        invited_by: user.id,
        role: 'vendor',
      },
    })

    if (inviteError) {
      logger.error({ email: vendorEmail, error: inviteError }, 'resend_vendor_invite_failed')
      return { success: false, error: `Error al reenviar: ${inviteError.message}` }
    }

    // Auditar reenvío
    await logAudit({
      actor: user.id,
      action: 'INVITE',
      entity: 'vendors',
      entity_id: vendorEmail,
      payload: { email: vendorEmail, type: 'resend', organizationId },
    })

    return {
      success: true,
      message: `Invitación reenviada a ${vendorEmail}`,
    }
  } catch (err) {
    logger.error({ email: vendorEmail, error: err }, 'resend_vendor_invite_error')
    return { success: false, error: 'Error inesperado del servidor' }
  }
}

/**
 * Elimina un vendedor de la organización y borra su cuenta de auth.
 */
export async function removeVendor(
  vendorId: string,
  organizationId: string
): Promise<ActionResult> {
  if (!vendorId || !organizationId) {
    return { success: false, error: 'Datos incompletos' }
  }

  try {
    // Verificar que el usuario actual es admin
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'No autenticado' }
    }

    // No permitir eliminarse a sí mismo
    if (user.id === vendorId) {
      return { success: false, error: 'No puedes eliminarte a ti mismo' }
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'admin') {
      return { success: false, error: 'Solo los administradores pueden eliminar miembros' }
    }

    // Verificar que el vendedor a eliminar no sea admin
    const { data: vendorMembership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', vendorId)
      .single()

    if (vendorMembership?.role === 'admin') {
      return { success: false, error: 'No puedes eliminar a otro administrador' }
    }

    const serviceClient = createServiceClient()

    // 1. Eliminar de organization_members
    const { error: deleteOrgError } = await serviceClient
      .from('organization_members')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', vendorId)

    if (deleteOrgError) {
      logger.error({ vendorId, organizationId, error: deleteOrgError }, 'remove_vendor_org_failed')
      return { success: false, error: 'Error al eliminar de la organización' }
    }

    // 2. Eliminar el usuario de auth
    const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(vendorId)

    if (deleteAuthError) {
      logger.error({ vendorId, error: deleteAuthError }, 'remove_vendor_auth_failed')
      // No es crítico, ya se eliminó de la org
      return {
        success: true,
        message: 'Vendedor eliminado de la organización (la cuenta de auth no pudo eliminarse)',
      }
    }

    // Auditar eliminación
    await logAudit({
      actor: user.id,
      action: 'REMOVE',
      entity: 'vendors',
      entity_id: vendorId,
      payload: { vendorId, organizationId },
    })

    revalidatePath('/vendors')

    return {
      success: true,
      message: 'Vendedor eliminado correctamente',
    }
  } catch (err) {
    logger.error({ vendorId, organizationId, error: err }, 'remove_vendor_server_error')
    return { success: false, error: 'Error inesperado del servidor' }
  }
}

/**
 * Asigna múltiples vendedores a un proyecto.
 */
export async function assignVendorsToProjectAction(
  projectId: string,
  assignmentsData: { vendorId?: string; userId?: string }[],
  organizationId: string
): Promise<ActionResult> {
  if (!projectId || !assignmentsData || assignmentsData.length === 0) {
    return { success: false, error: 'Datos de asignación incompletos' }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'No autenticado' }
    }

    // Verificar permisos de admin
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (!membership || membership.role !== 'admin') {
      return {
        success: false,
        error: 'Solo los administradores pueden asignar vendedores a proyectos',
      }
    }

    // 1. Asegurar que todos los usuarios tengan un registro en la tabla 'vendors'
    const finalVendorIds: string[] = []
    const serviceClient = createServiceClient()

    for (const item of assignmentsData) {
      if (item.vendorId) {
        finalVendorIds.push(item.vendorId)
      } else if (item.userId) {
        // Buscar si ya existe por si acaso
        const { data: existingVendor } = await serviceClient
          .from('vendors')
          .select('id')
          .eq('user_id', item.userId)
          .eq('organization_id', organizationId)
          .maybeSingle()

        if (existingVendor) {
          finalVendorIds.push(existingVendor.id)
        } else {
          // Obtener datos del perfil para el registro de vendor
          const { data: profile } = await serviceClient
            .from('profiles')
            .select('*')
            .eq('id', item.userId)
            .single()

          // Crear registro en vendors
          // IMPORTANTE: Ponemos owner_id: null para cumplir con el CHECK XOR (owner_id vs organization_id)
          const { data: newVendor, error: createError } = await serviceClient
            .from('vendors')
            .insert({
              user_id: item.userId,
              organization_id: organizationId,
              owner_id: null,
              nombre: profile
                ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
                  profile.username
                : 'Nuevo Vendedor',
              email: profile?.username || '',
            })
            .select('id')
            .single()

          if (createError) {
            logger.error(
              { userId: item.userId, organizationId, error: createError },
              'assign_vendors_create_vendor_failed'
            )
            continue
          }
          if (newVendor) finalVendorIds.push(newVendor.id)
        }
      }
    }

    if (finalVendorIds.length === 0) {
      return {
        success: false,
        error: 'No se pudieron mapear los usuarios a registros de vendedores',
      }
    }

    // 2. Realizar las asignaciones finales
    const assignments = finalVendorIds.map((vId) => ({
      project_id: projectId,
      vendor_id: vId,
      rol: 'vendedor',
    }))

    const { error: assignError } = await supabase.from('vendor_projects').upsert(assignments, {
      onConflict: 'vendor_id, project_id',
    })

    if (assignError) {
      logger.error({ projectId, error: assignError }, 'assign_vendors_upsert_failed')
      return { success: false, error: 'Error al procesar las asignaciones' }
    }

    // Auditar asignación
    await logAudit({
      actor: user.id,
      action: 'ASSIGN',
      entity: 'vendor_projects',
      entity_id: projectId,
      payload: { projectId, vendorIds: finalVendorIds },
    })

    revalidatePath(`/projects/${projectId}`)

    return {
      success: true,
      message: `${finalVendorIds.length} vendedores asignados correctamente`,
    }
  } catch (err) {
    logger.error({ projectId, organizationId, error: err }, 'assign_vendors_server_error')
    return { success: false, error: 'Error inesperado del servidor' }
  }
}

/**
 * Obtiene los miembros de la organización (Server Action).
 */
export async function getOrganizationMembersAction(organizationId: string) {
  try {
    const members = await getOrganizationMembers(organizationId)
    return { success: true, data: members }
  } catch (err) {
    logger.error({ organizationId, error: err }, 'get_organization_members_error')
    return { success: false, error: 'Error al obtener miembros' }
  }
}

/**
 * Elimina la asignación de un vendedor de un proyecto específico.
 * Solo puede ser ejecutada por administradores de la organización.
 */
export async function removeVendorFromProjectAction(projectId: string, vendorId: string) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) throw new Error('No autenticado')

    // 1. Obtener la organización del proyecto
    const { data: project } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single()

    if (!project) throw new Error('Proyecto no encontrado')

    // 2. Verificar rol de administrador en la organización
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', project.organization_id)
      .eq('user_id', user.id)
      .single()

    if (!member || member.role !== 'admin') {
      throw new Error('No tienes permisos de administrador para realizar esta acción')
    }

    // 3. Eliminar la relación
    const { error: deleteError } = await supabase
      .from('vendor_projects')
      .delete()
      .eq('project_id', projectId)
      .eq('vendor_id', vendorId)

    if (deleteError) {
      logger.error({ projectId, vendorId, error: deleteError }, 'remove_vendor_from_project_failed')
      throw new Error('No se pudo eliminar la asignación del vendedor')
    }

    // Auditar desasignación
    await logAudit({
      actor: user.id,
      action: 'UNASSIGN',
      entity: 'vendor_projects',
      entity_id: projectId,
      payload: { projectId, vendorId },
    })

    revalidatePath(`/projects/${projectId}`)

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    logger.error({ projectId, vendorId, error }, 'remove_vendor_from_project_error')
    return { success: false, error: message }
  }
}
