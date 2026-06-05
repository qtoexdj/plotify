import { getLotsByProject } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const lots = await getLotsByProject(projectId)

    return Response.json({
      lots,
      count: lots.length,
    })
  } catch (error) {
    console.error('Error in GET /api/onboarding/[projectId]/lots:', error)
    return Response.json({ error: 'Error al obtener lotes' }, { status: 500 })
  }
}
