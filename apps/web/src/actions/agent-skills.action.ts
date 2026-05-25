'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'

export async function toggleOrgSkill(organizationId: string, skillId: string, enabled: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  // Verificar que el usuario es admin de esta org
  const { data: member } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .single()

  if (!member || member.role !== 'admin') {
    return { success: false, error: 'No autorizado' }
  }

  // Verificar que la skill no es is_system (no se puede deshabilitar)
  const { data: skill } = await supabase
    .from('agent_skills')
    .select('is_system, slug')
    .eq('id', skillId)
    .single()

  if (!skill) return { success: false, error: 'Skill no encontrada' }
  if (skill.is_system && !enabled) {
    return { success: false, error: 'Las skills del sistema no se pueden deshabilitar' }
  }

  // Upsert en org_skill_configs
  const { error } = await supabase.from('org_skill_configs').upsert(
    {
      organization_id: organizationId,
      skill_id: skillId,
      enabled,
      enabled_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,skill_id' }
  )

  if (error) {
    logger.error({ error, skillId, organizationId }, 'toggle_skill_failed')
    return { success: false, error: 'Error al actualizar skill' }
  }

  revalidatePath('/agente/skills')
  return { success: true }
}
