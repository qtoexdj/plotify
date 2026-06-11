import { createClient } from '@/lib/supabase/server'
import type {
  LegalDocumentType,
  LegalUploadSource,
  RegisterLegalDocumentPayload,
} from '@/lib/legal/variable-resolution-types'
import { microserviceFetch } from '@/lib/services/microservice.client'
import { logger } from '@/lib/logger'
import type { Project, ProjectWithMetrics, Lot } from '@/types/database.types'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

type OrganizationMembership = {
  organization_id: string
  role: 'admin' | 'user'
}

export const PROJECT_LEGAL_DOCUMENT_FIELDS = {
  doc_dominio_vigente: 'dominio_vigente',
  doc_hipoteca_gravamen: 'hipoteca_gravamen',
  doc_roles: 'certificado_roles_sii',
  doc_subdivision: 'certificado_sag',
  doc_plano_oficial: 'plano_oficial',
  // Sin columna en projects: vive solo en legal_documents (FR-033).
  doc_personeria: 'personeria',
  doc_otros: 'otro',
} as const satisfies Record<string, LegalDocumentType>

export type ProjectLegalDocumentField = keyof typeof PROJECT_LEGAL_DOCUMENT_FIELDS

export interface ProjectLegalDocumentUploadMetadata {
  source_field: ProjectLegalDocumentField
  storage_path: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  sha256_hash: string
  replaces_legal_document_id?: string | null
}

export async function registerProjectLegalDocuments({
  project,
  documents,
  uploadSource,
  uploadedBy,
}: {
  project: Pick<Project, 'id' | 'organization_id'>
  documents?: ProjectLegalDocumentUploadMetadata[]
  uploadSource: LegalUploadSource
  uploadedBy: string
}): Promise<void> {
  if (!documents || documents.length === 0) return
  if (!project.organization_id) {
    logger.warn({ projectId: project.id }, 'legal_document_registration_missing_organization')
    return
  }
  const organizationId = project.organization_id

  const results = await Promise.allSettled(
    documents.map((document) => {
      const payload: RegisterLegalDocumentPayload = {
        organization_id: organizationId,
        project_id: project.id,
        lot_id: null,
        document_type: PROJECT_LEGAL_DOCUMENT_FIELDS[document.source_field],
        source_field: document.source_field,
        storage_bucket: 'project-files',
        storage_path: document.storage_path,
        original_filename: document.original_filename,
        mime_type: document.mime_type,
        file_size_bytes: document.file_size_bytes,
        sha256_hash: document.sha256_hash,
        upload_source: uploadSource,
        uploaded_by: uploadedBy,
        replaces_legal_document_id: document.replaces_legal_document_id ?? null,
      }

      return microserviceFetch('/api/v1/legal-documents/register', {
        method: 'POST',
        body: payload,
      })
    })
  )

  results.forEach((result, index) => {
    const sourceField = documents[index]?.source_field
    if (result.status === 'rejected') {
      logger.error(
        { projectId: project.id, sourceField, error: result.reason },
        'legal_document_registration_failed'
      )
      return
    }
    if (result.value.error) {
      logger.error(
        {
          projectId: project.id,
          sourceField,
          status: result.value.status,
          error: result.value.error,
        },
        'legal_document_registration_rejected'
      )
    }
  })
}

async function getOrganizationMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<OrganizationMembership | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error fetching organization membership:', error)
    throw new Error('Error al validar organización')
  }

  return data ?? null
}

export async function getProjectsWithMetrics(
  userId: string,
  supabaseClient?: SupabaseClient
): Promise<ProjectWithMetrics[]> {
  const supabase = supabaseClient || (await createClient())
  const membership = await getOrganizationMembership(supabase, userId)

  // Obtener proyectos del usuario
  let projectsQuery = supabase.from('projects').select('*')

  if (membership) {
    projectsQuery = projectsQuery.eq('organization_id', membership.organization_id)
  }

  const { data: projects, error } = await projectsQuery.order('created_at', {
    ascending: false,
  })

  if (error) {
    console.error('Error fetching projects:', error)
    throw new Error('Error al obtener proyectos')
  }

  if (!projects || projects.length === 0) {
    return []
  }

  // Obtener métricas de lotes para cada proyecto
  const projectsWithMetrics: ProjectWithMetrics[] = await Promise.all(
    projects.map(async (project) => {
      const { data: lots, error: lotsError } = await supabase
        .from('lots')
        .select('estado, vendedor_id, vendors(id, nombre)')
        .eq('project_id', project.id)

      if (lotsError) {
        console.error('Error fetching lots:', lotsError)
        return {
          ...project,
          lotes_libres: 0,
          lotes_reservados: 0,
          lotes_vendidos: 0,
          vendedores: [],
        }
      }

      const lotes_libres = lots?.filter((l) => l.estado === 'disponible').length || 0
      const lotes_reservados = lots?.filter((l) => l.estado === 'reservado').length || 0
      const lotes_vendidos = lots?.filter((l) => l.estado === 'vendido').length || 0

      const uniqueVendorsMap = new Map<string, { id: string; nombre: string }>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lots?.forEach((lot: any) => {
        if (lot.vendors && lot.vendors.id && lot.vendors.nombre) {
          uniqueVendorsMap.set(lot.vendors.id, { id: lot.vendors.id, nombre: lot.vendors.nombre })
        }
      })
      const vendedores = Array.from(uniqueVendorsMap.values())

      return {
        ...project,
        lotes_libres,
        lotes_reservados,
        lotes_vendidos,
        vendedores,
      }
    })
  )

  return projectsWithMetrics
}

export async function getProjectById(
  projectId: string,
  userId: string,
  supabaseClient?: SupabaseClient
): Promise<ProjectWithMetrics | null> {
  const supabase = supabaseClient || (await createClient())
  const membership = await getOrganizationMembership(supabase, userId)

  let projectQuery = supabase.from('projects').select('*').eq('id', projectId)

  if (membership) {
    projectQuery = projectQuery.eq('organization_id', membership.organization_id)
  }

  const { data: project, error } = await projectQuery.single()

  if (error) {
    console.error('Error fetching project:', error)
    return null
  }

  const { data: lots, error: lotsError } = await supabase
    .from('lots')
    .select('estado, vendedor_id, vendors(id, nombre)')
    .eq('project_id', project.id)

  if (lotsError) {
    console.error('Error fetching lots:', lotsError)
    return {
      ...project,
      lotes_libres: 0,
      lotes_reservados: 0,
      lotes_vendidos: 0,
      vendedores: [],
    }
  }

  const lotes_libres = lots?.filter((l) => l.estado === 'disponible').length || 0
  const lotes_reservados = lots?.filter((l) => l.estado === 'reservado').length || 0
  const lotes_vendidos = lots?.filter((l) => l.estado === 'vendido').length || 0

  const uniqueVendorsMap = new Map<string, { id: string; nombre: string }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lots?.forEach((lot: any) => {
    if (lot.vendors && lot.vendors.id && lot.vendors.nombre) {
      uniqueVendorsMap.set(lot.vendors.id, { id: lot.vendors.id, nombre: lot.vendors.nombre })
    }
  })
  const vendedores = Array.from(uniqueVendorsMap.values())

  return {
    ...project,
    lotes_libres,
    lotes_reservados,
    lotes_vendidos,
    vendedores,
  }
}

interface CreateProjectPayload {
  name: string
  region: string
  comuna: string
  descripcion?: string
  total_lotes: number
  lotPrefix?: string
  precio?: number | null
  valor_reserva?: number | null
  // Nuevos campos
  images?: string[]
  doc_dominio_vigente?: string
  doc_hipoteca_gravamen?: string
  doc_roles?: string
  doc_subdivision?: string
  doc_plano_oficial?: string
  doc_otros?: string | null
  legal_documents?: ProjectLegalDocumentUploadMetadata[]
}

export async function createProject(
  payload: CreateProjectPayload,
  userId: string
): Promise<{ project: Project; lots: Lot[] }> {
  const supabase = await createClient()
  const membership = await getOrganizationMembership(supabase, userId)

  if (membership && membership.role !== 'admin') {
    throw new Error('No tienes permisos para crear proyectos en la organización')
  }

  // Crear proyecto
  const projectInsert = {
    name: payload.name,
    region: payload.region,
    comuna: payload.comuna,
    descripcion: payload.descripcion || null,
    total_lotes: payload.total_lotes,
    organization_id: membership ? membership.organization_id : undefined,
    estado: 'draft' as const,
    // Nuevos campos
    images: payload.images || [],
    doc_dominio_vigente: payload.doc_dominio_vigente || null,
    doc_hipoteca_gravamen: payload.doc_hipoteca_gravamen || null,
    doc_roles: payload.doc_roles || null,
    doc_subdivision: payload.doc_subdivision || null,
    doc_plano_oficial: payload.doc_plano_oficial || null,
    doc_otros: payload.doc_otros || null,
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert(projectInsert)
    .select()
    .single()

  if (projectError) {
    console.error('Error creating project:', projectError)
    throw new Error('Error al crear proyecto')
  }

  // Crear lotes automáticamente
  const prefix = payload.lotPrefix !== undefined ? payload.lotPrefix : 'Lote '
  const lotsToCreate = Array.from({ length: payload.total_lotes }, (_, i) => ({
    project_id: project.id,
    numero_lote: `${prefix}${i + 1}`,
    estado: 'disponible' as const,
    precio: payload.precio ?? null,
    valor_reserva: payload.valor_reserva ?? null,
  }))

  const { data: lots, error: lotsError } = await supabase.from('lots').insert(lotsToCreate).select()

  if (lotsError) {
    console.error('Error creating lots:', lotsError)
    // Eliminar proyecto si falla la creación de lotes
    await supabase.from('projects').delete().eq('id', project.id)
    throw new Error('Error al crear lotes del proyecto')
  }

  return { project, lots: lots || [] }
}

export async function deleteProject(projectId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const membership = await getOrganizationMembership(supabase, userId)

  let deleteQuery = supabase.from('projects').delete().eq('id', projectId)

  if (membership) {
    deleteQuery = deleteQuery.eq('organization_id', membership.organization_id)
  }

  const { error } = await deleteQuery

  if (error) {
    console.error('Error deleting project:', error)
    if (error.code === '23503') {
      throw new Error(
        'El proyecto tiene registros relacionados (por ejemplo aprobaciones o documentos generados) que todavía bloquean su eliminación.'
      )
    }
    throw new Error('Error al eliminar proyecto')
  }
}

export async function updateProject(
  projectId: string,
  userId: string,
  updates: Partial<Project>
): Promise<Project> {
  const supabase = await createClient()
  const membership = await getOrganizationMembership(supabase, userId)

  let updateQuery = supabase.from('projects').update(updates).eq('id', projectId)

  if (membership) {
    updateQuery = updateQuery.eq('organization_id', membership.organization_id)
  }

  const { data, error } = await updateQuery.select().single()

  if (error) {
    console.error('Error updating project:', error)
    throw new Error('Error al actualizar proyecto')
  }

  return data
}
