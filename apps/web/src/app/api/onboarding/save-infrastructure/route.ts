import { saveInfrastructure } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const ROAD_INPUT_MODES = new Set(['centerline', 'footprint', 'edge'])
const ROAD_EDGE_SIDES = new Set(['left', 'right', 'both'])

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null)
    if (!payload?.projectId || !payload?.geometry || !payload?.geometryType) {
      return Response.json(
        { error: 'projectId, geometry y geometryType son requeridos' },
        { status: 400 }
      )
    }

    const validationError = validateInfrastructurePayload(payload)
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 })
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

function validateInfrastructurePayload(payload: Record<string, unknown>): string | null {
  if (payload.geometryType !== 'road') {
    return null
  }

  if (payload.inputMode !== undefined && !ROAD_INPUT_MODES.has(String(payload.inputMode))) {
    return 'inputMode debe ser centerline, footprint o edge'
  }

  if (payload.widthM !== undefined && !isPositiveNumber(payload.widthM)) {
    return 'widthM debe ser un número positivo para caminos centerline o edge'
  }

  if (
    (payload.inputMode === 'centerline' || payload.inputMode === 'edge') &&
    !isPositiveNumber(payload.widthM)
  ) {
    return 'widthM debe ser un número positivo para caminos centerline o edge'
  }

  if (payload.inputMode === 'edge' && !ROAD_EDGE_SIDES.has(String(payload.edgeSide))) {
    return 'edgeSide debe ser left, right o both para caminos edge'
  }

  return null
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
