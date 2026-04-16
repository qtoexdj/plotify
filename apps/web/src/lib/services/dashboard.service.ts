import { createClient } from '@/lib/supabase/server'
import type { Vendor } from '@/types/database.types'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

type OrganizationMembership = {
    organization_id: string
    role: 'admin' | 'user'
}

export interface GlobalKPIs {
    totalProjects: number
    totalLots: number
    availableLots: number
    reservedLots: number
    soldLots: number
}

export interface VendorPerformance extends Vendor {
    projectsCount: number
    soldLots: number
    reservedLots: number
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

export async function getGlobalKPIs(userId: string): Promise<GlobalKPIs> {
    const supabase = await createClient()
    const membership = await getOrganizationMembership(supabase, userId)

    const kpis: GlobalKPIs = {
        totalProjects: 0,
        totalLots: 0,
        availableLots: 0,
        reservedLots: 0,
        soldLots: 0,
    }

    // 1. Obtener los proyectos a los que el usuario tiene acceso
    let projectsQuery = supabase.from('projects').select('id, total_lotes')

    if (membership) {
        projectsQuery = projectsQuery.eq('organization_id', membership.organization_id)
    }

    const { data: projects, error: projectsError } = await projectsQuery

    if (projectsError) {
        console.error('Error fetching projects for KPIs:', projectsError)
        throw new Error('Error al obtener proyectos')
    }

    if (!projects || projects.length === 0) {
        return kpis
    }

    kpis.totalProjects = projects.length
    kpis.totalLots = projects.reduce((acc, p) => acc + (p.total_lotes || 0), 0)

    const projectIds = projects.map((p) => p.id)

    // 2. Obtener los lotes de esos proyectos para contar los estados
    const { data: lots, error: lotsError } = await supabase
        .from('lots')
        .select('estado')
        .in('project_id', projectIds)

    if (lotsError) {
        console.error('Error fetching lots for KPIs:', lotsError)
        return kpis
    }

    if (lots) {
        lots.forEach((lot) => {
            if (lot.estado === 'disponible') kpis.availableLots++
            else if (lot.estado === 'reservado') kpis.reservedLots++
            else if (lot.estado === 'vendido') kpis.soldLots++
        })
    }

    return kpis
}

export async function getVendorsPerformance(userId: string): Promise<VendorPerformance[]> {
    const supabase = await createClient()
    const membership = await getOrganizationMembership(supabase, userId)

    // Obtener los vendedores activos
    let vendorsQuery = supabase.from('vendors').select('*').eq('active', true)

    if (membership) {
        vendorsQuery = vendorsQuery.eq('organization_id', membership.organization_id)
    }

    const { data: vendors, error: vendorsError } = await vendorsQuery.order('nombre')

    if (vendorsError) {
        console.error('Error fetching vendors:', vendorsError)
        throw new Error('Error al obtener vendedores')
    }

    if (!vendors || vendors.length === 0) {
        return []
    }

    // Obtener counts en vendor_projects para cada vendedor
    // Dado que no hay aggregations sencillas en supabase-js, hacemos una serie de subqueries
    const vendorIds = vendors.map(v => v.id)

    const { data: vendorProjects, error: vpError } = await supabase
        .from('vendor_projects')
        .select('vendor_id')
        .in('vendor_id', vendorIds)

    // Obtener lotes para ver vendidos y reservados
    const { data: vendorLots, error: vlError } = await supabase
        .from('lots')
        .select('vendedor_id, estado')
        .in('vendedor_id', vendorIds)
        .in('estado', ['vendido', 'reservado'])

    const performanceMap: Record<string, VendorPerformance> = {}
    vendors.forEach(v => {
        performanceMap[v.id] = {
            ...v,
            projectsCount: 0,
            soldLots: 0,
            reservedLots: 0
        }
    })

    if (vendorProjects && !vpError) {
        vendorProjects.forEach(vp => {
            if (performanceMap[vp.vendor_id]) {
                performanceMap[vp.vendor_id].projectsCount++
            }
        })
    }

    if (vendorLots && !vlError) {
        vendorLots.forEach(vl => {
            if (vl.vendedor_id && performanceMap[vl.vendedor_id]) {
                if (vl.estado === 'vendido') {
                    performanceMap[vl.vendedor_id].soldLots++
                } else if (vl.estado === 'reservado') {
                    performanceMap[vl.vendedor_id].reservedLots++
                }
            }
        })
    }

    return Object.values(performanceMap).sort((a, b) => {
        // Ordenar principalmente por lotes vendidos, luego reservados
        if (a.soldLots !== b.soldLots) return b.soldLots - a.soldLots
        return b.reservedLots - a.reservedLots
    })
}
