'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Profile } from '@/types/database.types'

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient()

  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()

  if (error) {
    console.error('Error fetching profile:', error)
    return null
  }

  return data
}

export async function updateProfileAction(
  userId: string,
  data: {
    username: string | null
    website: string | null
    first_name: string | null
    last_name: string | null
    phone: string | null
    avatar_url?: string | null
  }
) {
  const supabase = await createClient()

  // Validate caller identity
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== userId) {
    return { error: 'No autorizado para editar este perfil' }
  }

  try {
    const { data: updated, error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error

    revalidatePath('/settings/profile')
    return { success: true, data: updated }
  } catch (error) {
    console.error('Profile update error:', error)
    return { error: error instanceof Error ? error.message : 'Error al actualizar perfil' }
  }
}
