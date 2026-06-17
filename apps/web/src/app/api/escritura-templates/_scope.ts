import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import type { NextRequest } from 'next/server'

type OrganizationScope = {
  organizationId: string
  userId: string
}

type ScopeResult = OrganizationScope | { error: Response }

export async function resolveOrganizationScope(request: NextRequest): Promise<ScopeResult> {
  const supabase = createRouteHandlerClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (error || !membership?.organization_id) {
    return { error: Response.json({ error: 'Organización no encontrada' }, { status: 403 }) }
  }
  if (!isLegalDocumentsFeatureEnabled({ organizationId: membership.organization_id })) {
    return {
      error: Response.json(
        { error: 'La biblioteca de matrices no está habilitada para esta organización' },
        { status: 403 }
      ),
    }
  }

  return {
    organizationId: membership.organization_id,
    userId: user.id,
  }
}
