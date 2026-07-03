import { recalculateProjectServidumbres } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => null)

    if (!payload?.projectId || typeof payload.projectId !== 'string') {
      return Response.json({ error: 'projectId es requerido' }, { status: 400 })
    }

    const result = await recalculateProjectServidumbres(payload.projectId)

    return Response.json({
      message: 'Servidumbres recalculadas correctamente',
      result,
    })
  } catch (error) {
    console.error('Error in POST /api/onboarding/recalculate-servidumbres:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Error al recalcular servidumbres' },
      { status: 500 }
    )
  }
}
