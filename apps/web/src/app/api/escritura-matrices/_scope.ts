import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import type { NextRequest } from 'next/server'

type Scope = {
  organizationId: string
  projectId: string
  userId: string
  role: string
}

type ScopeResult = Scope | { error: Response }

type AuthResult =
  | { supabase: ReturnType<typeof createRouteHandlerClient>; user: { id: string } }
  | { error: Response }

function featureDisabledResponse() {
  return Response.json(
    { error: 'El creador de matriz no está habilitado para este proyecto' },
    { status: 403 }
  )
}

async function resolveUser(request: NextRequest): Promise<AuthResult> {
  const supabase = createRouteHandlerClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  return { supabase, user }
}

export async function resolveCaseScope(request: NextRequest, caseId: string): Promise<ScopeResult> {
  const auth = await resolveUser(request)
  if ('error' in auth) return { error: auth.error }

  const { data: caseRow, error } = await auth.supabase
    .from('escritura_cases')
    .select('id, organization_id, project_id')
    .eq('id', caseId)
    .maybeSingle()

  if (error || !caseRow) {
    return { error: Response.json({ error: 'Caso de escritura no encontrado' }, { status: 404 }) }
  }
  if (!caseRow.organization_id || !caseRow.project_id) {
    return {
      error: Response.json({ error: 'Caso de escritura sin scope de proyecto' }, { status: 422 }),
    }
  }
  if (
    !isLegalDocumentsFeatureEnabled({
      organizationId: caseRow.organization_id,
      projectId: caseRow.project_id,
    })
  ) {
    return { error: featureDisabledResponse() }
  }
  const { data: membership } = await auth.supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', caseRow.organization_id)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  return {
    organizationId: caseRow.organization_id,
    projectId: caseRow.project_id,
    userId: auth.user.id,
    role: membership?.role || 'user',
  }
}

export async function resolveMatrizScope(
  request: NextRequest,
  matrizId: string
): Promise<ScopeResult> {
  const auth = await resolveUser(request)
  if ('error' in auth) return { error: auth.error }

  const { data: matrizRow, error } = await auth.supabase
    .from('escritura_matrices')
    .select('id, organization_id, project_id')
    .eq('id', matrizId)
    .maybeSingle()

  if (error || !matrizRow) {
    return { error: Response.json({ error: 'Matriz no encontrada' }, { status: 404 }) }
  }
  if (!matrizRow.organization_id || !matrizRow.project_id) {
    return { error: Response.json({ error: 'Matriz sin scope de proyecto' }, { status: 422 }) }
  }
  if (
    !isLegalDocumentsFeatureEnabled({
      organizationId: matrizRow.organization_id,
      projectId: matrizRow.project_id,
    })
  ) {
    return { error: featureDisabledResponse() }
  }
  const { data: membership } = await auth.supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', matrizRow.organization_id)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  return {
    organizationId: matrizRow.organization_id,
    projectId: matrizRow.project_id,
    userId: auth.user.id,
    role: membership?.role || 'user',
  }
}
