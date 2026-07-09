import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return Response.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { decision } = body

    if (!decision) {
      return Response.json({ error: 'Falta la propiedad decision en el cuerpo' }, { status: 400 })
    }

    const { data, error, status } = await microserviceFetch(
      `/api/v1/miniapp/bandeja/${id}/decidir`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
        },
        body: { decision },
      }
    )

    if (error) {
      return Response.json(
        { error: error || 'Error al procesar la decisión en el microservicio' },
        { status: status || 400 }
      )
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error en POST /api/miniapp/bandeja/[id]/decidir proxy:', error)
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
