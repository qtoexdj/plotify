import { createHash, randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { fileTypeFromBuffer } from 'file-type'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseHardOffValue } from '@/lib/config/release-flags'
import { canonicalRequestHash } from '@/lib/idempotency/operations'
import {
  extractKmlFromKmz,
  GEOMETRY_LIMITS,
  GeometryLimitError,
  inspectKmlLimits,
} from '@/lib/services/kmz-parser.service'
import { kmlToGeoJSON, normalizeGeoJSON } from '@/lib/services/kml-to-geojson.service'
import { geometryImportMetadataSchema } from '@/lib/validations/geometry-operation.schema'

export const runtime = 'nodejs'
const MULTIPART_OVERHEAD = 1024 * 1024
const fail = (status: number, code: string) => NextResponse.json({ error: code, code }, { status })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const session = await createClient()
  const {
    data: { user },
  } = await session.auth.getUser()
  if (!user) return fail(401, 'UNAUTHORIZED')
  const { data: project } = await session
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return fail(404, 'RESOURCE_NOT_FOUND')
  const { data: membership } = await session
    .from('organization_members')
    .select('role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'admin') return fail(404, 'RESOURCE_NOT_FOUND')

  const service = createServiceClient()
  const hardOff = parseHardOffValue(process.env.PLOTIFY_HARD_OFF_CANONICAL_GEOMETRY_IMPORT)
  const { data: enabled, error: controlError } = await service.rpc('resolve_feature_rollout', {
    p_feature_key: 'canonical_geometry_import',
    p_organization_id: project.organization_id,
    p_project_id: projectId,
  })
  // Authorization and the fail-closed control are deliberately resolved before formData/body.
  if (hardOff || controlError || enabled !== true) return fail(503, 'FEATURE_DISABLED')
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > GEOMETRY_LIMITS.compressedBytes + MULTIPART_OVERHEAD)
    return fail(413, 'ARCHIVE_EXPANDED_LIMIT')

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size < 1 || file.size > GEOMETRY_LIMITS.compressedBytes)
      return fail(413, 'FILE_SIZE_LIMIT')
    const metadata = geometryImportMetadataSchema.safeParse({
      idempotencyKey: String(
        form.get('idempotencyKey') ?? request.headers.get('idempotency-key') ?? ''
      ),
      expectedSourceSha256: String(form.get('expectedSourceSha256') ?? '') || undefined,
      confirmReplacement: String(form.get('confirmReplacement') ?? '') === 'true' || undefined,
    })
    if (!metadata.success) return fail(400, 'INVALID_GEOMETRY_OPERATION')
    if (metadata.data.expectedSourceSha256 && metadata.data.confirmReplacement !== true)
      return fail(400, 'REPLACEMENT_CONFIRMATION_REQUIRED')

    const bytes = Buffer.from(await file.arrayBuffer())
    const detected = await fileTypeFromBuffer(bytes.subarray(0, 4100))
    const lowerName = file.name.toLowerCase()
    const sourceType =
      detected?.ext === 'zip' && lowerName.endsWith('.kmz')
        ? 'kmz'
        : lowerName.endsWith('.kml')
          ? 'kml'
          : null
    if (!sourceType) return fail(400, 'FILE_TYPE_NOT_ALLOWED')
    const xml = sourceType === 'kmz' ? await extractKmlFromKmz(bytes) : bytes.toString('utf8')
    inspectKmlLimits(xml)
    const features = normalizeGeoJSON(kmlToGeoJSON(xml)).map((feature, index) => ({
      featureKey: createHash('sha256')
        .update(
          `${index}:${JSON.stringify(feature.geometry)}:${JSON.stringify(feature.properties ?? {})}`
        )
        .digest('hex'),
      geometry: feature.geometry,
      properties: feature.properties ?? {},
      geometryType: feature.geometryType,
      name: feature.properties?.name ?? feature.properties?.layer ?? `Feature ${index + 1}`,
    }))
    if (!features.some((feature) => feature.geometryType === 'lot'))
      return fail(400, 'LOT_FEATURE_REQUIRED')
    const sourceSha256 = createHash('sha256').update(bytes).digest('hex')
    const requestHash = (
      await canonicalRequestHash({
        projectId,
        sourceSha256,
        expectedSourceSha256: metadata.data.expectedSourceSha256 ?? null,
      })
    ).replace('sha256:', '')
    const operationType = metadata.data.expectedSourceSha256
      ? 'geometry.replace'
      : 'geometry.import'
    const { data: operation, error: claimError } = await service.rpc(
      'claim_idempotency_operation',
      {
        p_organization_id: project.organization_id,
        p_principal_type: 'user',
        p_principal_subject: user.id,
        p_operation_type: operationType,
        p_resource_scope: `project:${projectId}`,
        p_idempotency_key: metadata.data.idempotencyKey,
        p_request_hash: requestHash,
        p_source_kind: 'web',
        p_provider_event_key: null,
      }
    )
    if (claimError || !operation) return fail(409, 'IDEMPOTENCY_CONFLICT')
    if (operation.status === 'succeeded')
      return NextResponse.json({ ...operation.response_summary, replay: true })

    let { data: sourceFile } = await service
      .from('project_file_objects')
      .select('id')
      .eq('project_id', projectId)
      .eq('category', 'geometry_source')
      .eq('source_sha256', sourceSha256)
      .eq('status', 'ready')
      .maybeSingle()
    let createdSource = false
    if (!sourceFile) {
      const fileId = randomUUID()
      const objectPath = `${projectId}/geometry/${sourceSha256}`
      const { error: uploadError } = await service.storage
        .from('project-files')
        .upload(objectPath, bytes, {
          contentType:
            sourceType === 'kmz'
              ? 'application/vnd.google-earth.kmz'
              : 'application/vnd.google-earth.kml+xml',
          upsert: false,
        })
      if (uploadError) return fail(502, 'STORAGE_UPLOAD_FAILED')
      const inserted = await service
        .from('project_file_objects')
        .insert({
          id: fileId,
          organization_id: project.organization_id,
          project_id: projectId,
          category: 'geometry_source',
          bucket: 'project-files',
          object_path: objectPath,
          source_sha256: sourceSha256,
          size_bytes: bytes.byteLength,
          content_type:
            sourceType === 'kmz'
              ? 'application/vnd.google-earth.kmz'
              : 'application/vnd.google-earth.kml+xml',
          original_filename: file.name
            .normalize('NFKC')
            .replace(/[^a-zA-Z0-9._ -]/g, '_')
            .slice(0, 180),
          visibility: 'admin_only',
          status: 'ready',
          retention_class: 'geometry_source',
          operation_id: operation.id,
          created_by: user.id,
        })
        .select('id')
        .single()
      if (inserted.error || !inserted.data) {
        await service.storage.from('project-files').remove([objectPath])
        return fail(500, 'STORAGE_METADATA_COMPENSATED')
      }
      sourceFile = inserted.data
      createdSource = true
    }
    const rpc = metadata.data.expectedSourceSha256
      ? 'supersede_geometry_import'
      : 'commit_geometry_import'
    const args = metadata.data.expectedSourceSha256
      ? {
          p_organization_id: project.organization_id,
          p_project_id: projectId,
          p_expected_source_sha256: metadata.data.expectedSourceSha256,
          p_source_file_id: sourceFile.id,
          p_source_sha256: sourceSha256,
          p_source_type: sourceType,
          p_features: features,
          p_operation_id: operation.id,
          p_actor_user_id: user.id,
        }
      : {
          p_organization_id: project.organization_id,
          p_project_id: projectId,
          p_source_file_id: sourceFile.id,
          p_source_sha256: sourceSha256,
          p_source_type: sourceType,
          p_features: features,
          p_operation_id: operation.id,
          p_actor_user_id: user.id,
        }
    const committed = await service.rpc(rpc, args)
    if (committed.error || !committed.data) {
      if (createdSource)
        await service
          .from('project_file_objects')
          .update({ status: 'repair_required' })
          .eq('id', sourceFile.id)
      return fail(
        409,
        committed.error?.message.includes('IMPORT_VERSION_CONFLICT')
          ? 'IMPORT_VERSION_CONFLICT'
          : 'GEOMETRY_COMMIT_FAILED'
      )
    }
    const response = {
      ...committed.data,
      sourceType,
      totalFeatures: features.length,
      summary: {
        lots: features.filter((f) => f.geometryType === 'lot').length,
        roads: features.filter((f) => f.geometryType === 'road').length,
        commonAreas: features.filter((f) => f.geometryType === 'common_area').length,
      },
      features: features.map((feature, index) => ({
        tempId: committed.data.features[index].geometryId,
        ...feature,
      })),
    }
    await service.rpc('complete_idempotency_operation', {
      p_operation_id: operation.id,
      p_request_hash: requestHash,
      p_status: 'succeeded',
      p_resource_type: 'geometry_imports',
      p_resource_id: committed.data.importId,
      p_response_summary: response,
      p_error_code: null,
    })
    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    if (error instanceof GeometryLimitError) return fail(413, error.code)
    return fail(400, 'GEOMETRY_PARSE_FAILED')
  }
}
