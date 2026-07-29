import { NextRequest } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { microserviceFetch } from '@/lib/services/microservice.client'

export async function POST(request: NextRequest) {
  const session = createRouteHandlerClient(request)
  const {
    data: { user },
  } = await session.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: membership } = await session
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()
  if (!membership) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error, status } = await microserviceFetch('/api/v1/bots/setup', {
    method: 'POST',
    headers: { 'X-User-Id': user.id, 'X-Organization-Id': membership.organization_id },
  })
  if (error) return Response.json({ error }, { status })
  return Response.json(data)
}
