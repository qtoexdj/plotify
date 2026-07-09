import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, chat_id, org_id } = body

    if (!email || !chat_id || !org_id) {
      return Response.json(
        { error: 'Faltan parámetros requeridos: email, chat_id, org_id' },
        { status: 400 }
      )
    }

    const { data, error, status } = await microserviceFetch('/api/v1/miniapp/vincular/solicitar', {
      method: 'POST',
      body: { email, chat_id, org_id },
    })

    if (error || !data) {
      return Response.json(
        { error: error || 'Error solicitando código OTP' },
        { status: status || 400 }
      )
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error en POST /api/miniapp/vincular/solicitar:', error)
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
