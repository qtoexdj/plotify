import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fileTypeFromBuffer } from 'file-type'
import { logger } from '@/lib/logger'
import {
  PROJECT_LEGAL_DOCUMENT_FIELDS,
  registerProjectLegalDocuments,
  type ProjectLegalDocumentField,
} from '@/lib/services/projects.service'
import { isLegalDocumentsFeatureEnabled } from '@/lib/features/legal-documents'

export const runtime = 'nodejs'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_DOC_TYPES = ['application/pdf']
// Campos con columna propia en projects (compatibilidad con la UI legacy).
const PROJECT_COLUMN_DOC_FIELDS = [
  'doc_dominio_vigente',
  'doc_hipoteca_gravamen',
  'doc_roles',
  'doc_subdivision',
  'doc_plano_oficial',
  'doc_otros',
]
// doc_personeria vive solo en legal_documents (FR-033), sin columna en projects.
const ALLOWED_PROJECT_DOC_FIELDS = [...PROJECT_COLUMN_DOC_FIELDS, 'doc_personeria']
const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el límite de 15MB' }, { status: 413 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const projectId = formData.get('projectId') as string | null
    const type = formData.get('type') as string | null
    const replacesLegalDocumentId =
      (formData.get('replacesLegalDocumentId') as string | null)?.trim() || null

    if (!file || !projectId || !type) {
      return NextResponse.json(
        { error: 'Datos incompletos. Se requiere file, projectId y type.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el límite de 15MB' }, { status: 413 })
    }

    // Validación por type
    if (type === 'images') {
      // Permitido para imágenes
    } else if (ALLOWED_PROJECT_DOC_FIELDS.includes(type)) {
      // Permitido para documentos legales
    } else {
      return NextResponse.json(
        { error: 'Tipo de carga no reconocido o no permitido.' },
        { status: 400 }
      )
    }

    // Validación Server-Side con Magic Bytes
    const chunk = file.slice(0, 4096)
    const headerBuffer = Buffer.from(await chunk.arrayBuffer())
    const typeInfo = await fileTypeFromBuffer(headerBuffer)

    if (!typeInfo) {
      logger.warn({ fileName: file.name }, 'upload_invalid_file_signature')
      return NextResponse.json(
        { error: 'El archivo no tiene un formato reconocido.' },
        { status: 400 }
      )
    }

    if (type === 'images') {
      if (!ALLOWED_IMAGE_TYPES.includes(typeInfo.mime)) {
        return NextResponse.json(
          { error: 'Formato de imagen inválido. Solo se permiten JPEG, PNG o WEBP.' },
          { status: 400 }
        )
      }
    } else {
      if (!ALLOWED_DOC_TYPES.includes(typeInfo.mime)) {
        return NextResponse.json(
          { error: 'Formato de documento inválido. Solo se permiten PDFs.' },
          { status: 400 }
        )
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership, error: membershipError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (membershipError || !membership) {
      logger.warn({ userId: user.id, membershipError }, 'upload_membership_not_found')
      return NextResponse.json({ error: 'No tienes una organización activa' }, { status: 403 })
    }

    if (membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tienes permisos para subir documentos del proyecto' },
        { status: 403 }
      )
    }

    // 1. Validar la existencia del proyecto ANTES de subir el archivo al Storage
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('organization_id', membership.organization_id)
      .single()

    if (fetchError || !project) {
      logger.error({ projectId, fetchError }, 'upload_project_not_found')
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })
    }

    // 2. Proceder con la subida a Supabase Storage ahora que sabemos que el proyecto existe
    const fileExt = file.name.split('.').pop()
    const fileName = `${type}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `${projectId}/docs/${fileName}`

    const { data, error } = await supabase.storage.from('project-files').upload(filePath, file)

    if (error) {
      logger.error({ projectId, error }, 'upload_supabase_storage_error')
      throw new Error('Error al subir a Storage')
    }

    const hasProjectColumn = type === 'images' || PROJECT_COLUMN_DOC_FIELDS.includes(type)
    let updatedProject = project
    if (hasProjectColumn) {
      const updates =
        type === 'images'
          ? { images: [...(project.images || []), data.path] }
          : { [type]: data.path }

      const { data: refreshedProject, error: dbError } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId)
        .eq('organization_id', membership.organization_id)
        .select()
        .single()

      if (dbError) {
        logger.error({ projectId, error: dbError }, 'upload_db_update_error')
        // Intentar remover el archivo subido en caso de error en base de datos para no dejarlo huérfano
        await supabase.storage.from('project-files').remove([filePath])
        throw dbError
      }
      updatedProject = refreshedProject
    }

    if (
      type !== 'images' &&
      isLegalDocumentsFeatureEnabled({
        organizationId: membership.organization_id,
        projectId,
      })
    ) {
      const sourceField = type as ProjectLegalDocumentField
      if (sourceField in PROJECT_LEGAL_DOCUMENT_FIELDS) {
        await registerProjectLegalDocuments({
          project: updatedProject,
          documents: [
            {
              source_field: sourceField,
              storage_path: data.path,
              original_filename: file.name,
              mime_type: typeInfo.mime,
              file_size_bytes: file.size,
              sha256_hash: await sha256Hex(file),
              replaces_legal_document_id: replacesLegalDocumentId,
            },
          ],
          uploadSource: 'project_documents',
          uploadedBy: user.id,
        })
      }
    }

    return NextResponse.json({
      message: 'Archivo subido y validado exitosamente',
      project: updatedProject,
      path: data.path,
    })
  } catch (error) {
    logger.error({ error }, 'upload_project_file_error')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno al procesar archivo' },
      { status: 500 }
    )
  }
}
