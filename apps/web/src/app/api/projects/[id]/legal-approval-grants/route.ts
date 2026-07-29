import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

async function adminScope(request: NextRequest, projectId: string) {
  const supabase = createRouteHandlerClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const project = await getProjectById(projectId, user.id, supabase)
  if (!project?.organization_id) {
    return { error: Response.json({ error: 'Proyecto no encontrado' }, { status: 404 }) }
  }
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'admin' && membership?.role !== 'owner') {
    return { error: Response.json({ error: 'Solo administradores' }, { status: 403 }) }
  }
  return { userId: user.id, organizationId: project.organization_id }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await adminScope(request, id)
  if ('error' in scope) return scope.error
  const query = new URLSearchParams({ project_id: id })
  const { data, error, status } = await microserviceFetch(
    `/api/v1/organizations/${scope.organizationId}/legal-approval-grants?${query}`
  )
  return error ? Response.json({ error }, { status }) : Response.json(data)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await adminScope(request, id)
  if ('error' in scope) return scope.error
  const body = await request.json()
  const { data, error, status } = await microserviceFetch(
    `/api/v1/organizations/${scope.organizationId}/legal-approval-grants`,
    {
      method: 'POST',
      body: {
        ...body,
        operation_key: body.operation_key ?? crypto.randomUUID(),
        granted_by: scope.userId,
        project_id: id,
      },
    }
  )
  return error ? Response.json({ error }, { status }) : Response.json(data, { status: 201 })
}
