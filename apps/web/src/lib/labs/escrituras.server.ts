import { createServiceClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import type { LabPayload } from './escrituras'

export const emptyLabPayload: LabPayload = {
  documents: [],
  variables: [],
  templates: [],
  sourceMap: [],
  embeddingStats: {
    totalChunks: 0,
    embeddedChunks: 0,
    pendingChunks: 0,
  },
  documentStats: {
    totalDocuments: 0,
    pendingDocuments: 0,
  },
  setupRequired: false,
}

export async function getEscriturasLabPayload(): Promise<LabPayload> {
  const supabase = createServiceClient().schema('lab_escrituras')

  const [
    documents,
    variables,
    templates,
    sourceMap,
    totalDocuments,
    pendingDocuments,
    totalChunks,
    embeddedChunks,
  ] = await Promise.all([
    supabase
      .from('source_documents')
      .select(
        'id, run_id, original_filename, document_type, source_format, content_type, size_bytes, sha256, storage_bucket, storage_path, processing_status, detected_pdf_type, detection_confidence, page_count, error_message, created_at, updated_at'
      )
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('extracted_variable_candidates')
      .select(
        'id, canonical_variable, proposed_value, confidence, evidence, future_source, source_table, source_field, status, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('template_candidates')
      .select('id, name, document_type, draft_markdown, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('source_map_entries')
      .select(
        'id, canonical_variable, future_source, source_table, source_field, rationale, status, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(80),
    supabase.from('source_documents').select('id', { count: 'exact', head: true }),
    supabase
      .from('source_documents')
      .select('id', { count: 'exact', head: true })
      .in('processing_status', ['uploaded', 'pending']),
    supabase.from('document_chunks').select('id', { count: 'exact', head: true }),
    supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null),
  ])

  const firstError =
    documents.error ??
    variables.error ??
    templates.error ??
    sourceMap.error ??
    totalDocuments.error ??
    pendingDocuments.error ??
    totalChunks.error ??
    embeddedChunks.error
  if (firstError) {
    logger.warn({ error: firstError }, 'lab_escrituras_schema_unavailable')
    return {
      ...emptyLabPayload,
      setupRequired: true,
      error:
        'Laboratorio no disponible. Ejecuta labs/labs_escrituras/sql/001_bootstrap_lab.sql y confirma que el schema lab_escrituras este expuesto para el acceso REST local.',
    }
  }

  return {
    documents: documents.data ?? [],
    variables: variables.data ?? [],
    templates: templates.data ?? [],
    sourceMap: sourceMap.data ?? [],
    embeddingStats: {
      totalChunks: totalChunks.count ?? 0,
      embeddedChunks: embeddedChunks.count ?? 0,
      pendingChunks: Math.max((totalChunks.count ?? 0) - (embeddedChunks.count ?? 0), 0),
    },
    documentStats: {
      totalDocuments: totalDocuments.count ?? documents.data?.length ?? 0,
      pendingDocuments:
        pendingDocuments.count ??
        documents.data?.filter((document) =>
          ['uploaded', 'pending'].includes(document.processing_status)
        ).length ??
        0,
    },
    setupRequired: false,
  } as LabPayload
}
