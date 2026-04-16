'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'

interface OnboardingResult {
    success: boolean
    error?: string
}

/**
 * Completa el onboarding de un vendedor invitado.
 * 
 * Actualiza la contraseña del usuario y su perfil (nombre, apellido, teléfono).
 * Luego redirige al dashboard.
 */
export async function completeOnboarding(formData: FormData): Promise<OnboardingResult> {
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string
    const firstName = formData.get('firstName') as string
    const lastName = formData.get('lastName') as string
    const phone = formData.get('phone') as string

    // Validaciones
    if (!password || password.length < 6) {
        return { success: false, error: 'La contraseña debe tener al menos 6 caracteres' }
    }

    if (password !== confirmPassword) {
        return { success: false, error: 'Las contraseñas no coinciden' }
    }

    if (!firstName || !lastName) {
        return { success: false, error: 'Nombre y apellido son obligatorios' }
    }

    try {
        const supabase = await createClient()

        // 1. Verificar que el usuario está autenticado
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !user) {
            return { success: false, error: 'No autenticado. Por favor usa el link de invitación nuevamente.' }
        }

        // 2. Actualizar contraseña
        const { error: passwordError } = await supabase.auth.updateUser({
            password: password,
        })

        if (passwordError) {
            logger.error({ error: passwordError }, 'complete_onboarding_password_failed')
            return { success: false, error: 'Error al establecer la contraseña' }
        }

        // 3. Actualizar perfil
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                first_name: firstName,
                last_name: lastName,
                phone: phone || null,
                username: user.email || user.id,
                updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)

        if (profileError) {
            logger.error({ error: profileError }, 'complete_onboarding_profile_failed')
            return { success: false, error: 'Error al guardar el perfil' }
        }

        revalidatePath('/vendors')

    } catch (err) {
        logger.error({ error: err }, 'complete_onboarding_server_error')
        return { success: false, error: 'Error inesperado del servidor' }
    }

    // Redirect fuera del try/catch porque lanza internamente
    redirect('/projects')
}
