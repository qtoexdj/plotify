'use server'

import { updateWorkspace } from '@/lib/services/workspace.service'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateWorkspaceAction(orgId: string, data: { name: string; slug: string }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  try {
    const updated = await updateWorkspace(orgId, user.id, data)
    revalidatePath('/settings/workspace')
    return { success: true, data: updated }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Error al actualizar' }
  }
}
