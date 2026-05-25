'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function unlinkTelegramAction(profileId: string) {
  const supabase = await createClient()

  // Validate caller identity
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== profileId) {
    return { error: 'No autorizado para editar este perfil' }
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ telegram_chat_id: null })
      .eq('id', profileId)

    if (error) throw error

    revalidatePath('/agente/integrations')
    return { success: true }
  } catch (error) {
    console.error('Unlink telegram error:', error)
    return { error: error instanceof Error ? error.message : 'Error al desvincular Telegram' }
  }
}
export async function checkTelegramStatusAction(profileId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('telegram_chat_id')
      .eq('id', profileId)
      .single()

    if (error) throw error

    return { telegram_chat_id: data?.telegram_chat_id || null }
  } catch (error) {
    console.error('Check telegram status error:', error)
    return { error: 'Error al consultar estado de Telegram' }
  }
}

export async function generateTelegramTokenAction(profileId: string, organizationId?: string) {
  const supabase = await createClient()

  // Auth validate
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.id !== profileId) {
    return { error: 'No autorizado para generar tokens' }
  }

  try {
    const CHAT_BASE_URL = process.env.NEXT_PUBLIC_PLOTIFY_CHAT_BASE_URL || 'http://127.0.0.1:8005'
    const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || ''

    const response = await fetch(`${CHAT_BASE_URL}/api/v1/users/telegram-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        profile_id: profileId,
        ...(organizationId ? { organization_id: organizationId } : {}),
      }),
    })

    if (!response.ok) {
      console.error('Microservice Error', response.status, await response.text())
      throw new Error('Error del microservicio de chat')
    }

    const data = await response.json()
    return { success: true, deep_link: data.deep_link, token: data.token }
  } catch (error) {
    console.error('Generar token error:', error)
    return { error: 'Error al generar el token temporal' }
  }
}
