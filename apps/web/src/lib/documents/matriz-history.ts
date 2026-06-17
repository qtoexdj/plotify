import { createClient } from '@/lib/supabase/server'
import type { MinutaGeneration } from './matriz-types'

export async function listOrganizationMinutaGenerations(
  organizationId: string
): Promise<MinutaGeneration[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('escritura_minuta_generations')
    .select(
      'id, escritura_case_id, matriz_id, matriz_version, template_id, snapshot_hash, content_hash, storage_path, warning_acknowledged_by, warning_acknowledged_at, generated_by, generated_at'
    )
    .eq('organization_id', organizationId)
    .order('generated_at', { ascending: false })

  const rows = (data ?? []) as Array<Omit<MinutaGeneration, 'download_url'>>

  return Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await supabase.storage
        .from('documents')
        .createSignedUrl(row.storage_path, 60 * 60 * 24 * 7)
      return {
        ...row,
        download_url: signed?.signedUrl ?? null,
      }
    })
  )
}
