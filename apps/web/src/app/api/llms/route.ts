import { NextRequest } from 'next/server'
import { requireSuperAdminRoute } from '@/lib/auth/require-super-admin-route'
import { microserviceFetch } from '@/lib/services/microservice.client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdminRoute(request)
  if ('response' in auth) return auth.response

  const { data, error, status } = await microserviceFetch('/api/v1/llms/', {
    headers: { 'X-User-Id': auth.user.id },
  })
  if (error || !data) {
    return Response.json({ error: error || 'No se pudo cargar la configuración' }, { status })
  }
  return Response.json(data)
}
