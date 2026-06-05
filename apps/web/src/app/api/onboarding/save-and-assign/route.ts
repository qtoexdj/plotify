import { saveAndAssignGeometry } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null)
    if (!payload?.projectId || !payload?.lotId || !payload?.geometry) {
      return Response.json({ error: 'projectId, lotId y geometry son requeridos' }, { status: 400 })
    }

    const geometry = await saveAndAssignGeometry(payload)

    return Response.json({
      message: 'Geometría asignada correctamente',
      geometry,
    })
  } catch (error) {
    console.error('Error in POST /api/onboarding/save-and-assign:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Error al asignar geometría' },
      { status: 500 }
    )
  }
}
