import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getLotById, updateLot } from '@/lib/services/onboarding.service'
import { NextRequest } from 'next/server'
import { lotUpdateSchema } from '@/lib/validations/lot-update.schema'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> }
) {
  try {
    const { lotId } = await params
    const supabase = createRouteHandlerClient(request)
    const lot = await getLotById(lotId, supabase)

    if (!lot) {
      return Response.json({ error: 'Lote no encontrado' }, { status: 404 })
    }

    return Response.json({ lot })
  } catch (error) {
    console.error('Error in GET /api/onboarding/lot/[lotId]:', error)
    return Response.json({ error: 'Error al obtener lote' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ lotId: string }> }
) {
  try {
    const { lotId } = await params
    const body = await request.json()

    // Validar con schema estricto (rechaza campos no declarados)
    const validation = lotUpdateSchema.safeParse(body)
    if (!validation.success) {
      return Response.json(
        { error: 'Datos inválidos: ' + validation.error.issues[0].message },
        { status: 400 }
      )
    }

    const safeData = validation.data

    if (Object.keys(safeData).length === 0) {
      return Response.json({ error: 'No hay campos para actualizar' }, { status: 400 })
    }

    // Sync bidireccional: si viene m2, también actualizar area_official_m2
    const updateData: Record<string, unknown> = { ...safeData }
    if (safeData.m2 !== undefined) {
      updateData.area_official_m2 = safeData.m2
    }

    const supabase = createRouteHandlerClient(request)
    const lot = await updateLot(lotId, updateData, supabase)

    return Response.json({
      message: 'Lote actualizado correctamente',
      lot,
    })
  } catch (error) {
    console.error('Error in PATCH /api/onboarding/lot/[lotId]:', error)
    return Response.json({ error: 'Error al actualizar lote' }, { status: 500 })
  }
}
