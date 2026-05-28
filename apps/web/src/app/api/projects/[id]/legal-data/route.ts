import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params
    const supabase = await createClient()

    const { data: legalData, error } = await supabase
      .from('project_legal_data')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) {
      logger.error({ projectId, error }, 'fetch_project_legal_data_failed')
      return NextResponse.json(
        { error: 'Error al obtener datos legales del proyecto' },
        { status: 500 }
      )
    }

    return NextResponse.json(legalData || null)
  } catch (error) {
    logger.error({ error }, 'get_project_legal_data_route_error')
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
