import { saveInfrastructure } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null)
    if (!payload?.projectId || !payload?.geometry || !payload?.geometryType) {
      return Response.json(
        { error: 'projectId, geometry y geometryType son requeridos' },
        { status: 400 }
      )
    }

    const geometry = await saveInfrastructure(payload)

    return Response.json({
      message: 'Infraestructura guardada correctamente',
      geometry,
    })
  } catch (error) {
    console.error('Error in POST /api/onboarding/save-infrastructure:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Error al guardar infraestructura' },
      { status: 500 }
    )
  }
}
