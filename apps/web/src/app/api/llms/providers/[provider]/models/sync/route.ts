import { NextRequest } from 'next/server'
import { requireSuperAdminRoute } from '@/lib/auth/require-super-admin-route'
import { microserviceFetch } from '@/lib/services/microservice.client'

type RouteParams = { params: Promise<{ provider: string }> }

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireSuperAdminRoute(request)
  if ('response' in auth) return auth.response
  const { provider } = await params

  const { data, error, status } = await microserviceFetch(
    `/api/v1/llms/providers/${encodeURIComponent(provider)}/models/sync`,
    {
      method: 'POST',
      headers: { 'X-User-Id': auth.user.id },
    }
  )
  if (error || !data) {
    return Response.json({ error: error || 'No se pudieron actualizar los modelos' }, { status })
  }
  return Response.json(data)
}
