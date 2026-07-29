import { NextRequest } from 'next/server'
import { requireSuperAdminRoute } from '@/lib/auth/require-super-admin-route'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdminRoute(request)
  if ('response' in auth) return auth.response
  const service = createServiceClient()
  const [{ data: prompts, error }, { data: versions }] = await Promise.all([
    service.from('system_prompts').select('*').order('name'),
    service.from('prompt_versions').select('*').eq('is_active', true),
  ])
  if (error) return Response.json({ error: 'No se pudieron cargar los prompts' }, { status: 500 })
  return Response.json({
    prompts: (prompts ?? []).map((prompt) => ({
      ...prompt,
      active_version: versions?.find((version) => version.prompt_id === prompt.id) ?? null,
    })),
  })
}
