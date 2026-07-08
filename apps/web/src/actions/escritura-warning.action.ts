'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/services/audit.service'
import { revalidatePath } from 'next/cache'

type AcknowledgeResult =
  | { success: true; acknowledgedBy: string; acknowledgedAt: string }
  | { error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkProjectAdminPermissions(supabase: any, projectId: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { allowed: false, userId: null as string | null }

  const [{ data: isProjectAdmin }, { data: isSuperAdmin }] = await Promise.all([
    supabase.rpc('is_project_admin', { target_project_id: projectId }),
    supabase.rpc('is_super_admin'),
  ])

  return { allowed: Boolean(isProjectAdmin || isSuperAdmin), userId: user.id as string }
}

/**
 * SDD 017 (T024, FR-009): confirma el aviso legal de borrador para el
 * proyecto UNA vez — no por cada minuta. Idempotente: si ya hay una
 * confirmación vigente, la devuelve tal cual en vez de sobre-escribirla
 * (contracts §3). `generate_case_minuta`/la cascada (FastAPI) leen estas
 * columnas para amparar cada generación (`warning_acknowledged_by/_at`).
 */
export async function acknowledgeMinutaWarningAction(
  projectId: string
): Promise<AcknowledgeResult> {
  const supabase = await createClient()
  const { allowed, userId } = await checkProjectAdminPermissions(supabase, projectId)
  if (!allowed || !userId) {
    return { error: 'No tienes permisos de administrador para realizar esta acción.' }
  }

  const { data: project, error: readError } = await supabase
    .from('projects')
    .select('minuta_warning_acknowledged_by, minuta_warning_acknowledged_at, organization_id')
    .eq('id', projectId)
    .maybeSingle()

  if (readError || !project) {
    return { error: 'No se pudo leer el estado del aviso legal del proyecto.' }
  }

  if (project.minuta_warning_acknowledged_by && project.minuta_warning_acknowledged_at) {
    return {
      success: true,
      acknowledgedBy: project.minuta_warning_acknowledged_by,
      acknowledgedAt: project.minuta_warning_acknowledged_at,
    }
  }

  const acknowledgedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('projects')
    .update({
      minuta_warning_acknowledged_by: userId,
      minuta_warning_acknowledged_at: acknowledgedAt,
    })
    .eq('id', projectId)

  if (updateError) {
    console.error('Error updating minuta_warning_acknowledged_*:', updateError)
    return { error: 'Error al confirmar el aviso legal.' }
  }

  await logAudit({
    actor: userId,
    action: 'UPDATE',
    entity: 'projects',
    entity_id: projectId,
    organization_id: project.organization_id ?? undefined,
    payload: { event: 'minuta_warning_acknowledged', acknowledged_at: acknowledgedAt },
  })

  revalidatePath(`/projects/${projectId}`)
  return { success: true, acknowledgedBy: userId, acknowledgedAt }
}
