import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; grantId: string }> }
) {
  const { id, grantId } = await params
  const supabase = createRouteHandlerClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const project = await getProjectById(id, user.id, supabase)
  if (!project?.organization_id)
    return Response.json({ error: 'Proyecto no encontrado' }, { status: 404 })
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'admin' && membership?.role !== 'owner') {
    return Response.json({ error: 'Solo administradores' }, { status: 403 })
  }
  const body = await request.json()
  const { data, error, status } = await microserviceFetch(
    `/api/v1/organizations/${project.organization_id}/legal-approval-grants/${encodeURIComponent(grantId)}/revoke`,
    {
      method: 'POST',
      body: {
        reason: body.reason,
        revoked_by: user.id,
        operation_key: body.operation_key ?? crypto.randomUUID(),
      },
    }
  )
  return error ? Response.json({ error }, { status }) : Response.json(data)
}
