'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import { logAudit } from '@/lib/services/audit.service'

interface InviteResult {
  success: boolean
  message?: string
  error?: string
}

/**
 * Invita a un vendedor a la organización enviándole un email.
 *
 * Flujo:
 * 1. Valida que el usuario actual sea admin de la organización
 * 2. Usa admin.inviteUserByEmail() para crear el usuario y enviar email
 * 3. Inserta el registro en organization_members con rol 'user'
 */
export async function inviteVendor(email: string, organizationId: string): Promise<InviteResult> {
  // Validación básica del email
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Email inválido' }
  }

  if (!organizationId) {
    return { success: false, error: 'Organización no encontrada' }
  }

  try {
    // 1. Verificar que el usuario actual es admin de la organización
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'No autenticado' }
    }

    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (memberError || !membership || membership.role !== 'admin') {
      return { success: false, error: 'Solo los administradores pueden invitar vendedores' }
    }

    // 2. Crear el usuario con invitación via admin API
    const serviceClient = createServiceClient()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const { data: inviteData, error: inviteError } =
      await serviceClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${appUrl}/auth/callback`,
        data: {
          organization_id: organizationId,
          invited_by: user.id,
          role: 'vendor',
        },
      })

    if (inviteError) {
      logger.error({ email, organizationId, error: inviteError }, 'invite_vendor_invite_failed')

      // Manejar caso de email ya registrado
      if (
        inviteError.message?.includes('already been registered') ||
        inviteError.message?.includes('already exists')
      ) {
        return { success: false, error: 'Este email ya está registrado en el sistema' }
      }

      return { success: false, error: `Error al enviar invitación: ${inviteError.message}` }
    }

    if (!inviteData?.user) {
      return { success: false, error: 'No se pudo crear el usuario invitado' }
    }

    // 3. Insertar en organization_members con rol 'user' (vendedor)
    const { error: insertError } = await serviceClient.from('organization_members').insert({
      organization_id: organizationId,
      user_id: inviteData.user.id,
      role: 'user',
    })

    if (insertError) {
      logger.error(
        { organizationId, userId: inviteData.user.id, error: insertError },
        'invite_vendor_insert_member_failed'
      )

      // Si ya es miembro, no es un error crítico
      if (insertError.code === '23505') {
        return { success: false, error: 'Este usuario ya es miembro de la organización' }
      }

      return { success: false, error: 'Usuario invitado pero error al agregar a la organización' }
    }

    // 4. También crear el registro en la tabla profiles si no existe
    // El trigger de auth.users debería crear el perfil automáticamente,
    // pero verificamos por seguridad
    const { error: profileError } = await serviceClient.from('profiles').upsert(
      {
        id: inviteData.user.id,
        username: email,
      },
      { onConflict: 'id' }
    )

    if (profileError) {
      logger.warn(
        { userId: inviteData.user.id, error: profileError },
        'invite_vendor_profile_create_warning'
      )
    }

    // Auditar la acción
    await logAudit({
      actor: user.id,
      action: 'INVITE',
      entity: 'vendors',
      entity_id: inviteData.user.id,
      payload: { email, organizationId },
    })

    revalidatePath('/vendors')

    return {
      success: true,
      message: `Invitación enviada a ${email}. El vendedor recibirá un email para completar su registro.`,
    }
  } catch (err) {
    logger.error({ email, organizationId, error: err }, 'invite_vendor_server_error')
    return { success: false, error: 'Error inesperado del servidor' }
  }
}
