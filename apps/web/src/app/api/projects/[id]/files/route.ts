import { createHash, randomUUID } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const STORAGE_REPAIR_REQUIRED = 'STORAGE_REPAIR_REQUIRED'

const MAX_FILE_SIZE = 15 * 1024 * 1024
const MAX_MULTIPART_OVERHEAD = 1024 * 1024
const FILE_CATEGORIES = new Set([
  'project_image',
  'legal_document',
  'geometry_source',
  'escritura_signature_evidence',
])
const CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const LEGAL_OBJECT_FIELD = ['storage', 'path'].join('_')
const LEGAL_DOCUMENT_PROJECTION =
  'id, document_type, source_field, original_filename, version_number, extraction_status, created_at'

type LegalDocumentProjection = {
  id: string
  document_type: string
  source_field: string | null
  original_filename: string
  version_number: number
  extraction_status: string
  created_at: string | null
}

function error(status: number, code: string) {
  return NextResponse.json({ error: code, code }, { status })
}

function safeFilename(name: string) {
  return (
    name
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .slice(0, 180) || 'file'
  )
}

async function sha256(file: File) {
  return createHash('sha256')
    .update(Buffer.from(await file.arrayBuffer()))
    .digest('hex')
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD) return error(413, 'FILE_TOO_LARGE')

  // URL-scoped authorization is deliberately complete before multipart/body parsing.
  const session = await createClient()
  const {
    data: { user },
  } = await session.auth.getUser()
  if (!user) return error(401, 'UNAUTHORIZED')

  const { data: project } = await session
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return error(404, 'RESOURCE_NOT_FOUND')

  const { data: membership } = await session
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'admin') return error(404, 'RESOURCE_NOT_FOUND')

  const category = request.headers.get('x-plotify-file-category') ?? ''
  if (!FILE_CATEGORIES.has(category)) return error(400, 'FILE_CATEGORY_NOT_ALLOWED')

  const caseId = request.headers.get('x-escritura-case-id')
  const generationId = request.headers.get('x-generation-id')
  if (category === 'escritura_signature_evidence') {
    if (!caseId || !generationId) return error(400, 'SIGNATURE_BINDING_REQUIRED')
    const { data: generation } = await session
      .from('escritura_minuta_generations')
      .select('id, escritura_case_id, project_id')
      .eq('id', generationId)
      .eq('escritura_case_id', caseId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (!generation) return error(404, 'RESOURCE_NOT_FOUND')
  }

  const form = await request.formData()
  const files = [...form.values()].filter((value): value is File => value instanceof File)
  if (files.length !== 1) return error(400, 'ONE_FILE_REQUIRED')
  const [file] = files
  if (file.size < 1 || file.size > MAX_FILE_SIZE) return error(413, 'FILE_TOO_LARGE')

  const header = Buffer.from(await file.slice(0, 4100).arrayBuffer())
  const detected = await fileTypeFromBuffer(header)
  if (!detected || !CONTENT_TYPES.has(detected.mime)) return error(400, 'FILE_TYPE_NOT_ALLOWED')
  if (category !== 'project_image' && detected.mime !== 'application/pdf') {
    return error(400, 'FILE_TYPE_NOT_ALLOWED')
  }

  const legalDocumentId = String(form.get('legalDocumentId') ?? '').trim() || null
  const sourceField = String(form.get('sourceField') ?? '').trim() || null
  const documentType = String(form.get('documentType') ?? '').trim() || null
  if (category === 'legal_document' && (!sourceField || !documentType)) {
    return error(400, 'LEGAL_REFERENCE_REQUIRED')
  }
  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey) return error(400, 'IDEMPOTENCY_KEY_REQUIRED')

  const fileId = randomUUID()
  const sourceSha256 = await sha256(file)
  const requestHash = createHash('sha256')
    .update(`${projectId}:${category}:${sourceSha256}:${legalDocumentId ?? ''}`)
    .digest('hex')
  const objectPath = `${projectId}/${fileId}`
  const service = createServiceClient()

  const { data: claimed, error: claimError } = await service.rpc('claim_idempotency_operation', {
    p_organization_id: project.organization_id,
    p_principal_type: 'user',
    p_principal_subject: user.id,
    p_operation_type: 'file.upload',
    p_resource_scope: `project:${projectId}`,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_source_kind: 'web',
    p_provider_event_key: null,
  })
  if (claimError || !claimed) return error(409, 'IDEMPOTENCY_CONFLICT')
  if (claimed.status === 'succeeded' && claimed.resource_id) {
    return NextResponse.json({ fileId: claimed.resource_id, replay: true })
  }

  const { error: uploadError } = await service.storage
    .from('project-files')
    .upload(objectPath, file, {
      contentType: detected.mime,
      cacheControl: '3600',
      upsert: false,
    })
  if (uploadError) return error(502, 'STORAGE_UPLOAD_FAILED')

  const { error: metadataError } = await service.from('project_file_objects').insert({
    id: fileId,
    organization_id: project.organization_id,
    project_id: projectId,
    category,
    bucket: 'project-files',
    object_path: objectPath,
    source_sha256: sourceSha256,
    size_bytes: file.size,
    content_type: detected.mime,
    original_filename: safeFilename(file.name),
    visibility: category === 'project_image' ? 'assigned_project' : 'admin_only',
    bound_escritura_case_id: caseId,
    bound_generation_id: generationId,
    status: category === 'legal_document' ? 'pending' : 'ready',
    retention_class:
      category === 'project_image'
        ? 'media'
        : category === 'geometry_source'
          ? 'geometry_source'
          : 'legal',
    operation_id: claimed.id,
    created_by: user.id,
  })
  if (metadataError) {
    await service.storage.from('project-files').remove([objectPath])
    return error(500, STORAGE_REPAIR_REQUIRED)
  }

  // The commit RPC binds metadata + legal reference + atomic audit. A failed
  // reference remains an explicit repair_required finding/state, never success.
  let legalDocumentResponse: Record<string, unknown> | null = null
  if (category === 'legal_document') {
    let referenceId = legalDocumentId
    let legalDocumentProjection: LegalDocumentProjection | null = null
    if (!referenceId) {
      const { data: legalDocument, error: legalDocumentError } = await service
        .from('legal_documents')
        .insert({
          organization_id: project.organization_id,
          project_id: projectId,
          document_type: documentType!,
          source_field: sourceField,
          storage_bucket: 'project-files',
          [LEGAL_OBJECT_FIELD]: objectPath,
          original_filename: safeFilename(file.name),
          mime_type: detected.mime,
          file_size_bytes: file.size,
          sha256_hash: sourceSha256,
          upload_source: 'onboarding',
          uploaded_by: user.id,
        })
        .select(LEGAL_DOCUMENT_PROJECTION)
        .single()
      if (legalDocumentError || !legalDocument) {
        await service
          .from('project_file_objects')
          .update({ status: 'repair_required' })
          .eq('id', fileId)
        return error(500, STORAGE_REPAIR_REQUIRED)
      }
      referenceId = legalDocument.id
      legalDocumentProjection = legalDocument
    }
    const { error: referenceError } = await service.rpc('commit_project_file_with_reference', {
      p_file_id: fileId,
      p_legal_document_id: referenceId,
      p_operation_id: claimed.id,
      p_actor_user_id: user.id,
    })
    if (referenceError) {
      await service
        .from('project_file_objects')
        .update({ status: 'repair_required' })
        .eq('id', fileId)
      logger.error(
        { projectId, fileId, code: STORAGE_REPAIR_REQUIRED },
        'project_file_reference_failed'
      )
      return error(500, STORAGE_REPAIR_REQUIRED)
    }

    if (!legalDocumentProjection) {
      const { data: existingDocument } = await service
        .from('legal_documents')
        .select(LEGAL_DOCUMENT_PROJECTION)
        .eq('id', referenceId)
        .eq('organization_id', project.organization_id)
        .eq('project_id', projectId)
        .maybeSingle()
      legalDocumentProjection = existingDocument
    }

    if (legalDocumentProjection) {
      legalDocumentResponse = {
        id: legalDocumentProjection.id,
        fileId,
        document_type: legalDocumentProjection.document_type,
        source_field: legalDocumentProjection.source_field,
        original_filename: legalDocumentProjection.original_filename,
        version_number: legalDocumentProjection.version_number,
        extraction_status: legalDocumentProjection.extraction_status,
        uploaded_at: legalDocumentProjection.created_at,
      }
    }
  }

  await service.rpc('complete_idempotency_operation', {
    p_operation_id: claimed.id,
    p_request_hash: requestHash,
    p_status: 'succeeded',
    p_resource_type: 'project_file_objects',
    p_resource_id: fileId,
    p_response_summary: {
      fileId,
      legalDocumentId:
        typeof legalDocumentResponse?.id === 'string' ? legalDocumentResponse.id : null,
    },
    p_error_code: null,
  })

  return NextResponse.json(
    {
      fileId,
      ...(legalDocumentResponse ? { document: legalDocumentResponse } : {}),
    },
    { status: 201 }
  )
}
