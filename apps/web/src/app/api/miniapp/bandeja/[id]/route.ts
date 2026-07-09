import { microserviceFetch } from '@/lib/services/microservice.client'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return Response.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo')

    if (!tipo) {
      return Response.json({ error: 'Falta el parámetro de consulta tipo' }, { status: 400 })
    }

    const { data, error, status } = await microserviceFetch(
      `/api/v1/miniapp/bandeja/${id}?tipo=${tipo}`,
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
        },
      }
    )

    if (error || !data) {
      return Response.json(
        { error: error || 'Error al obtener el detalle en el microservicio' },
        { status: status || 400 }
      )
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error en GET /api/miniapp/bandeja/[id] proxy:', error)
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
