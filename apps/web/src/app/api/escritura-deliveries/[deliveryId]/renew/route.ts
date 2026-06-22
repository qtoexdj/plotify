import { microserviceFetch } from '@/lib/services/microservice.client'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import type { EscrituraDeliveryView } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ deliveryId: string }> }

/**
 * SDD 011 T017 — el vendedor renueva el enlace vencido de SU entrega (FR-010).
 * FastAPI acota la renovación al vendedor destinatario: no puede tocar otra.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { deliveryId } = await params
    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership?.organization_id) {
      return Response.json({ error: 'Sin organización asignada' }, { status: 403 })
    }

    const { data, error, status } = await microserviceFetch<EscrituraDeliveryView>(
      `/api/v1/escritura-deliveries/${encodeURIComponent(deliveryId)}/renew`,
      {
        method: 'POST',
        headers: {
          'X-User-Id': user.id,
          'X-Organization-Id': membership.organization_id,
        },
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'No se pudo renovar el enlace' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in POST /api/escritura-deliveries/[deliveryId]/renew:', error)
    return Response.json({ error: 'No se pudo renovar el enlace' }, { status: 500 })
  }
}
