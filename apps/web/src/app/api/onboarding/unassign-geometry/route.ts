import { deleteGeometryByLotId } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const projectId = searchParams.get('projectId')
        const lotId = searchParams.get('lotId')

        if (!projectId || !lotId) {
            return Response.json(
                { error: 'Faltan parámetros projectId o lotId requeridos' },
                { status: 400 }
            )
        }

        await deleteGeometryByLotId(lotId)

        return Response.json({
            message: 'Geometría desasignada y lote liberado exitosamente',
            lotId,
        })
    } catch (error) {
        console.error('Error in DELETE /api/onboarding/unassign-geometry:', error)
        return Response.json(
            {
                error: error instanceof Error ? error.message : 'Error al desasignar geometría',
            },
            { status: 500 }
        )
    }
}
