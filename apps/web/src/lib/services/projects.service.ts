import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { Project, ProjectWithMetrics, Lot } from '@/types/database.types'
import type { CreateProjectInput } from '@/lib/validations/project.schema'
import { canonicalRequestHash } from '@/lib/idempotency/operations'
import { groupProjectImageIds } from '@/lib/projects/project-media'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

type OrganizationMembership = {
  organization_id: string
  role: 'admin' | 'user'
}

async function resolveProjectVendedores(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ id: string; nombre: string; avatar_url: string | null }[]> {
  const uniqueVendorsMap = new Map<string, { id: string; nombre: string; user_id: string | null }>()

  const { data: projectVendors } = await supabase
    .from('vendor_projects')
    .select('vendor:vendor_id!inner (id, nombre, user_id, active)')
    .eq('project_id', projectId)
    .eq('vendor.active', true)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectVendors?.forEach((row: any) => {
    if (row.vendor && row.vendor.id && row.vendor.nombre) {
      uniqueVendorsMap.set(row.vendor.id, {
        id: row.vendor.id,
        nombre: row.vendor.nombre,
        user_id: row.vendor.user_id ?? null,
      })
    }
  })

  const vendors = Array.from(uniqueVendorsMap.values())
  const userIds = vendors.map((v) => v.user_id).filter((id): id is string => Boolean(id))

  const avatarByUserId = new Map<string, string | null>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, avatar_url')
      .in('id', userIds)

    profiles?.forEach((profile) => avatarByUserId.set(profile.id, profile.avatar_url))
  }

  return vendors.map(({ id, nombre, user_id }) => ({
    id,
    nombre,
    avatar_url: (user_id && avatarByUserId.get(user_id)) ?? null,
  }))
}

async function assignedProjectIds(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string
): Promise<string[]> {
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle()
  if (!vendor) return []
  const { data: assignments } = await supabase
    .from('vendor_projects')
    .select('project_id')
    .eq('vendor_id', vendor.id)
  return assignments?.map((assignment) => assignment.project_id) ?? []
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

async function getReadyProjectImageIds(projectIds: string[]): Promise<Map<string, string[]>> {
  if (projectIds.length === 0) return new Map()
  const service = createServiceClient()
  const { data, error } = await service
    .from('project_file_objects')
    .select('id, project_id, created_at')
    .in('project_id', projectIds)
    .eq('category', 'project_image')
    .eq('status', 'ready')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Error fetching project image metadata:', error)
    throw new Error('Error al obtener imágenes de proyectos')
  }
  return groupProjectImageIds(data ?? [])
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
    if (membership.role !== 'admin') {
      const projectIds = await assignedProjectIds(supabase, membership.organization_id, userId)
      if (projectIds.length === 0) return []
      projectsQuery = projectsQuery.in('id', projectIds)
    }
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

  const imageIdsByProject = await getReadyProjectImageIds(projects.map(({ id }) => id))

  // Obtener métricas de lotes para cada proyecto
  const projectsWithMetrics: ProjectWithMetrics[] = await Promise.all(
    projects.map(async (project) => {
      const { data: lots, error: lotsError } = await supabase
        .from('lots')
        .select('estado, vendedor_id, vendors(id, nombre, user_id)')
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

      const vendedores = await resolveProjectVendedores(supabase, project.id)

      return {
        ...project,
        images: imageIdsByProject.get(project.id) ?? [],
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
    if (membership.role !== 'admin') {
      const projectIds = await assignedProjectIds(supabase, membership.organization_id, userId)
      if (!projectIds.includes(projectId)) return null
    }
  }

  const { data: project, error } = await projectQuery.single()

  if (error) {
    console.error('Error fetching project:', error)
    return null
  }

  const { data: lots, error: lotsError } = await supabase
    .from('lots')
    .select('estado, vendedor_id, vendors(id, nombre, user_id)')
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

  const vendedores = await resolveProjectVendedores(supabase, project.id)
  const imageIdsByProject = await getReadyProjectImageIds([project.id])

  return {
    ...project,
    images: imageIdsByProject.get(project.id) ?? [],
    lotes_libres,
    lotes_reservados,
    lotes_vendidos,
    vendedores,
  }
}

export async function createProject(
  payload: CreateProjectInput,
  userId: string,
  organizationId: string,
  idempotencyKey: string
): Promise<{ project: Project; lots: Lot[] }> {
  const service = createServiceClient()
  const requestHash = (await canonicalRequestHash(payload)).replace('sha256:', '')
  const { data: operation, error: claimError } = await service.rpc('claim_idempotency_operation', {
    p_organization_id: organizationId,
    p_principal_type: 'user',
    p_principal_subject: userId,
    p_operation_type: 'project.create',
    p_resource_scope: `organization:${organizationId}`,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_source_kind: 'web',
    p_provider_event_key: null,
  })
  if (claimError || !operation) throw new Error('IDEMPOTENCY_CONFLICT')
  if (operation.status === 'succeeded' && operation.response_summary) {
    return operation.response_summary as unknown as { project: Project; lots: Lot[] }
  }
  const { data, error } = await service.rpc('create_project_with_lots', {
    p_organization_id: organizationId,
    p_actor_user_id: userId,
    p_operation_id: operation.id,
    p_name: payload.name,
    p_region: payload.region,
    p_comuna: payload.comuna,
    p_descripcion: payload.descripcion ?? '',
    p_total_lotes: payload.total_lotes,
    p_lot_prefix: payload.lotPrefix ?? 'Lote ',
    p_precio: payload.precio ?? null,
    p_valor_reserva: payload.valor_reserva ?? null,
  })
  if (error || !data) throw new Error(error?.message ?? 'PROJECT_CREATE_FAILED')
  const result = data as unknown as { project: Project; lots: Lot[] }
  await service.rpc('complete_idempotency_operation', {
    p_operation_id: operation.id,
    p_request_hash: requestHash,
    p_status: 'succeeded',
    p_resource_type: 'projects',
    p_resource_id: result.project.id,
    p_response_summary: result,
    p_error_code: null,
  })
  return result
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
