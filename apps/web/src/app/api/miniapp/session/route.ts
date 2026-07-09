import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { org_id, init_data } = body

    if (!org_id || !init_data) {
      return Response.json(
        { error: 'Faltan parámetros requeridos: org_id, init_data' },
        { status: 400 }
      )
    }

    const { data, error, status } = await microserviceFetch('/api/v1/miniapp/session', {
      method: 'POST',
      body: { org_id, init_data },
    })

    if (error || !data) {
      return Response.json(
        { error: error || 'Error autenticando en el microservicio' },
        { status: status || 401 }
      )
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error en POST /api/miniapp/session proxy:', error)
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
