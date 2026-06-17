import { microserviceFetch } from '@/lib/services/microservice.client'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import type { EscrituraDeliveryListResponse } from '@/lib/documents/matriz-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * SDD 011 T017 — entregas del vendedor autenticado ("mis documentos").
 *
 * La identidad (user + organización) se resuelve desde la sesión y se reenvía a
 * FastAPI por cabeceras; jamás se confía en datos del navegador. FastAPI filtra
 * por vendedor destinatario, así que un vendedor nunca ve ventas ajenas (SC-005).
 */
export async function GET(request: NextRequest) {
  try {
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

    const { data, error, status } = await microserviceFetch<EscrituraDeliveryListResponse>(
      '/api/v1/escritura-deliveries/mine',
      {
        headers: {
          'X-User-Id': user.id,
          'X-Organization-Id': membership.organization_id,
        },
      }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al cargar tus documentos' }, { status })
    }
    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/escritura-deliveries/mine:', error)
    return Response.json({ error: 'Error al cargar tus documentos' }, { status: 500 })
  }
}
