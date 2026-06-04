import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import type { LegalDocument } from '@/lib/legal/variable-resolution-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

interface LegalDocumentListResponse {
  project_id: string
  documents: LegalDocument[]
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const project = await getProjectById(id, user.id, supabase)
    if (!project) {
      return Response.json({ error: 'Proyecto no encontrado' }, { status: 404 })
    }
    if (!project.organization_id) {
      return Response.json({ error: 'Proyecto sin organización asociada' }, { status: 422 })
    }

    const { data, error, status } = await microserviceFetch<LegalDocumentListResponse>(
      `/api/v1/legal-documents/project/${encodeURIComponent(id)}?organization_id=${encodeURIComponent(
        project.organization_id
      )}`
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al obtener documentos legales' }, { status })
    }

    return Response.json(data)
  } catch (error) {
    console.error('Error in GET /api/projects/[id]/legal-documents:', error)
    return Response.json({ error: 'Error al obtener documentos legales' }, { status: 500 })
  }
}
