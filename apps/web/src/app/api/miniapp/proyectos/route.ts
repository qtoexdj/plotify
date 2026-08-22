import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return Response.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data, error, status } = await microserviceFetch('/api/v1/miniapp/proyectos', {
      method: 'GET',
      headers: {
        Authorization: authHeader,
      },
    })

    if (error || !data) {
      return Response.json(
        { error: error || 'Error al obtener proyectos en el microservicio' },
        { status: status || 400 }
      )
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error en GET /api/miniapp/proyectos proxy:', error)
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
