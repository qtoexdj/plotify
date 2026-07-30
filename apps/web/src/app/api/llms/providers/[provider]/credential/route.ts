import { NextRequest } from 'next/server'
import { requireSuperAdminRoute } from '@/lib/auth/require-super-admin-route'
import { microserviceFetch } from '@/lib/services/microservice.client'

type RouteParams = { params: Promise<{ provider: string }> }

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await requireSuperAdminRoute(request)
  if ('response' in auth) return auth.response
  const { provider } = await params
  const body = await request.json()

  const { data, error, status } = await microserviceFetch(
    `/api/v1/llms/providers/${encodeURIComponent(provider)}/credential`,
    {
      method: 'PUT',
      body,
      headers: { 'X-User-Id': auth.user.id },
    }
  )
  if (error || !data) {
    return Response.json({ error: error || 'No se pudo guardar la clave' }, { status })
  }
  return Response.json(data)
}
