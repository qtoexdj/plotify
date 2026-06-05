import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectById } from '@/lib/services/projects.service'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'
import type { LegalDocument } from '@/lib/legal/variable-resolution-types'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

interface LegalDocumentListResponse {
  project_id: string
  documents: LegalDocument[]
}

interface LegalDocumentRetryResponse {
  legal_document_id: string
  ingestion_job_id: string
  extraction_status: string
  attempt_number: number
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
    if (
      !isLegalDocumentsFeatureEnabled({
        organizationId: project.organization_id,
        projectId: id,
      })
    ) {
      return Response.json(
        { error: 'Los documentos legales no están habilitados para este proyecto' },
        { status: 403 }
      )
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as {
      legal_document_id?: string
    }
    if (!body.legal_document_id) {
      return Response.json({ error: 'legal_document_id es requerido' }, { status: 400 })
    }

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
    if (
      !isLegalDocumentsFeatureEnabled({
        organizationId: project.organization_id,
        projectId: id,
      })
    ) {
      return Response.json(
        { error: 'Los documentos legales no están habilitados para este proyecto' },
        { status: 403 }
      )
    }

    const upstreamParams = new URLSearchParams({
      organization_id: project.organization_id,
      project_id: id,
    })

    const { data, error, status } = await microserviceFetch<LegalDocumentRetryResponse>(
      `/api/v1/legal-documents/${encodeURIComponent(
        body.legal_document_id
      )}/retry?${upstreamParams.toString()}`,
      { method: 'POST' }
    )

    if (error || !data) {
      return Response.json({ error: error || 'Error al reintentar extracción legal' }, { status })
    }

    return Response.json(data, { status: 202 })
  } catch (error) {
    console.error('Error in POST /api/projects/[id]/legal-documents:', error)
    return Response.json({ error: 'Error al reintentar extracción legal' }, { status: 500 })
  }
}
