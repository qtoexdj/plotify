import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ResolvedFile = {
  organizationId: string
  projectId: string
  bucket: 'project-files' | 'documents'
  objectName: string
  filename: string
  contentType: string
  visibility: 'admin_only' | 'assigned_project'
}

function notFound() {
  return new Response('Archivo no encontrado', { status: 404 })
}

function safeDownloadName(value: string) {
  return value.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'archivo'
}

async function resolveFile(fileId: string): Promise<ResolvedFile | null> {
  const service = createServiceClient()
  const { data: projectFile } = await service
    .from('project_file_objects')
    .select(
      'organization_id, project_id, bucket, object_path, original_filename, content_type, visibility, status'
    )
    .eq('id', fileId)
    .eq('status', 'ready')
    .maybeSingle()

  if (projectFile) {
    return {
      organizationId: projectFile.organization_id,
      projectId: projectFile.project_id,
      bucket: projectFile.bucket as ResolvedFile['bucket'],
      objectName: projectFile.object_path,
      filename: projectFile.original_filename,
      contentType: projectFile.content_type,
      visibility: projectFile.visibility as ResolvedFile['visibility'],
    }
  }

  // Generated minutas use the generation UUID as their canonical opaque ID.
  // The Storage coordinate remains internal to this resolver.
  const { data: generation } = await service
    .from('escritura_minuta_generations')
    .select('organization_id, project_id, storage_path')
    .eq('id', fileId)
    .maybeSingle()
  if (!generation) return null

  return {
    organizationId: generation.organization_id,
    projectId: generation.project_id,
    bucket: 'documents',
    objectName: generation.storage_path,
    filename: `minuta-${fileId}.docx`,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    visibility: 'assigned_project',
  }
}

async function canRead(
  request: NextRequest,
  file: ResolvedFile
): Promise<{ allowed: boolean; userId?: string }> {
  const session = await createClient()
  const {
    data: { user },
  } = await session.auth.getUser()
  if (!user) return { allowed: false }

  const { data: membership } = await session
    .from('organization_members')
    .select('role')
    .eq('organization_id', file.organizationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membership?.role === 'admin') return { allowed: true, userId: user.id }
  if (!membership || file.visibility === 'admin_only') return { allowed: false, userId: user.id }

  const service = createServiceClient()
  const { data: vendor } = await service
    .from('vendors')
    .select('id')
    .eq('organization_id', file.organizationId)
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()
  if (!vendor) return { allowed: false, userId: user.id }

  const { data: assignment } = await service
    .from('vendor_projects')
    .select('project_id')
    .eq('project_id', file.projectId)
    .eq('vendor_id', vendor.id)
    .maybeSingle()

  return { allowed: Boolean(assignment), userId: user.id }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) return notFound()

    const file = await resolveFile(fileId)
    if (!file) return notFound()
    const access = await canRead(request, file)
    if (!access.allowed) return notFound()

    const service = createServiceClient()
    const { data, error } = await service.storage.from(file.bucket).download(file.objectName)
    if (error || !data) return notFound()

    return new Response(data.stream(), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${safeDownloadName(file.filename)}"`,
        'Content-Type': file.contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    console.error('file_stream_failed', { code: 'FILE_STREAM_FAILED' })
    return notFound()
  }
}
