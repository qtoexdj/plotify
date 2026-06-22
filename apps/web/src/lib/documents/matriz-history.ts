import { createClient } from '@/lib/supabase/server'
import type { MinutaGeneration } from './matriz-types'

export interface MinutaHistoryProject {
  id: string
  name: string
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

type MinutaGenerationRow = Omit<MinutaGeneration, 'download_url'> & {
  organization_id: string
  project_id: string
}

type EscrituraCaseRow = {
  id: string
  project_id: string
  lot_id: string | null
}

type LotRow = {
  id: string
  numero_lote: string | null
}

type ListOrganizationMinutaGenerationsFilters = {
  projectId?: string | null
}

async function listHistoryProjects(
  supabase: SupabaseClient,
  organizationId: string
): Promise<MinutaHistoryProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching history projects:', error)
    return []
  }

  return (data ?? []).map((project) => ({
    id: String(project.id),
    name: String(project.name ?? 'Proyecto sin nombre'),
  }))
}

export async function listOrganizationHistoryProjects(
  organizationId: string
): Promise<MinutaHistoryProject[]> {
  const supabase = await createClient()
  return listHistoryProjects(supabase, organizationId)
}

export async function listOrganizationMinutaGenerations(
  organizationId: string,
  filters: ListOrganizationMinutaGenerationsFilters = {}
): Promise<MinutaGeneration[]> {
  const supabase = await createClient()

  let query = supabase
    .from('escritura_minuta_generations')
    .select(
      'id, organization_id, project_id, escritura_case_id, matriz_id, matriz_version, template_id, snapshot_hash, content_hash, storage_path, warning_acknowledged_by, warning_acknowledged_at, generated_by, generated_at'
    )
    .eq('organization_id', organizationId)

  if (filters.projectId) {
    query = query.eq('project_id', filters.projectId)
  }

  const { data, error } = await query.order('generated_at', { ascending: false })

  if (error) {
    console.error('Error fetching minuta generations history:', error)
    return []
  }

  const rows = (data ?? []) as MinutaGenerationRow[]
  const projects = await listHistoryProjects(supabase, organizationId)
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const caseIds = Array.from(new Set(rows.map((row) => row.escritura_case_id)))

  let casesById = new Map<string, EscrituraCaseRow>()
  if (caseIds.length > 0) {
    const { data: caseRows, error: caseError } = await supabase
      .from('escritura_cases')
      .select('id, project_id, lot_id')
      .in('id', caseIds)

    if (caseError) {
      console.error('Error fetching escritura cases for history:', caseError)
    } else {
      casesById = new Map((caseRows ?? []).map((row) => [String(row.id), row as EscrituraCaseRow]))
    }
  }

  const lotIds = Array.from(
    new Set(
      Array.from(casesById.values())
        .map((row) => row.lot_id)
        .filter((lotId): lotId is string => Boolean(lotId))
    )
  )

  let lotsById = new Map<string, LotRow>()
  if (lotIds.length > 0) {
    const { data: lotRows, error: lotError } = await supabase
      .from('lots')
      .select('id, numero_lote')
      .in('id', lotIds)

    if (lotError) {
      console.error('Error fetching lots for history:', lotError)
    } else {
      lotsById = new Map((lotRows ?? []).map((row) => [String(row.id), row as LotRow]))
    }
  }

  return Promise.all(
    rows.map(async (row) => {
      const escrituraCase = casesById.get(row.escritura_case_id)
      const lot = escrituraCase?.lot_id ? lotsById.get(escrituraCase.lot_id) : null
      const project = projectsById.get(row.project_id)
      const { data: signed } = await supabase.storage
        .from('documents')
        .createSignedUrl(row.storage_path, 60 * 60 * 24 * 7)
      return {
        ...row,
        project_name: project?.name ?? 'Proyecto sin nombre',
        lot_id: escrituraCase?.lot_id ?? null,
        lot_label: lot?.numero_lote ? `Lote ${lot.numero_lote}` : null,
        download_url: signed?.signedUrl ?? null,
      }
    })
  )
}
