import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return Response.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idempotencyKey = request.headers.get('X-Idempotency-Key')
    const body = await request.json()

    const { data, error, status } = await microserviceFetch('/api/v1/miniapp/reservas', {
      method: 'POST',
      body,
      headers: {
        Authorization: authHeader,
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
      },
    })

    if (error || !data) {
      return Response.json(
        { error: error || 'Error al crear la reserva en el microservicio' },
        { status: status || 400 }
      )
    }

    return Response.json(data, { status })
  } catch (error) {
    console.error('Error en POST /api/miniapp/reservas proxy:', error)
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
