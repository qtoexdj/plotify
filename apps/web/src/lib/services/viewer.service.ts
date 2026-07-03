import { createClient } from '@/lib/supabase/server'
import { recalculateProjectServidumbres } from '@/lib/services/onboarding.service'
import type { ViewerFeatureCollection, ViewerFeature } from '@/types/viewer.types'
import type {
  Geometry,
  Lot,
  EstadoLote,
  GeoJSONFeature,
  GeoJSONGeometry,
} from '@/types/database.types'

type LotProjection = Pick<
  Lot,
  | 'id'
  | 'numero_lote'
  | 'estado'
  | 'observaciones'
  | 'vendedor_id'
  | 'precio'
  | 'valor_reserva'
  | 'm2'
  | 'servidumbre_m2'
  | 'servidumbre_ancho_m'
  | 'superficie_neta_m2'
  | 'area_official_m2'
  | 'perimeter_official_m'
  | 'boundaries_official'
  | 'verified_status'
  | 'verified_at'
  | 'verified_by'
>

type Sdd14ServitudeProjection = Pick<
  Lot,
  | 'servidumbre_widths_m'
  | 'servidumbre_ancho_label'
  | 'servidumbre_geometry'
  | 'servidumbre_sources'
  | 'servidumbre_calculation_status'
>

type GeometryLotProjection = LotProjection & Sdd14ServitudeProjection

interface GeometryWithLot extends Geometry {
  lots: GeometryLotProjection | null
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

const LOT_GEOMETRIES_SELECT_WITH_SDD14 = `
  *,
  lots!geometries_lot_id_fkey (
    id,
    numero_lote,
    estado,
    observaciones,
    vendedor_id,
    precio,
    valor_reserva,
    m2,
    servidumbre_m2,
    servidumbre_ancho_m,
    servidumbre_widths_m,
    servidumbre_ancho_label,
    servidumbre_geometry,
    servidumbre_sources,
    servidumbre_calculation_status,
    superficie_neta_m2,
    area_official_m2,
    perimeter_official_m,
    boundaries_official,
    verified_status,
    verified_at,
    verified_by
  )
`

export async function getFeatureCollection(
  projectId: string,
  supabaseClient?: SupabaseClient
): Promise<ViewerFeatureCollection> {
  const supabase = supabaseClient || (await createClient())

  // 1) Geometrías asignadas a un lote (lot_id NOT NULL)
  const initialLotResult = await fetchAssignedLotGeometries(supabase, projectId)
  const { error: lotError } = initialLotResult
  let lotData = initialLotResult.data

  if (lotError) {
    console.error('Error fetching lot geometries:', lotError)
    throw new Error('Error al obtener feature collection')
  }

  let assigned = (lotData as unknown as GeometryWithLot[]) || []

  if (shouldBackfillServitudes(assigned)) {
    try {
      const recalculateResult = await recalculateProjectServidumbres(projectId, supabase)

      if (recalculateResult.lotsUpdated > 0) {
        const refreshed = await fetchAssignedLotGeometries(supabase, projectId)

        if (refreshed.error) {
          console.error(
            'Error refetching lot geometries after servitude backfill:',
            refreshed.error
          )
        } else {
          lotData = refreshed.data
          assigned = (lotData as unknown as GeometryWithLot[]) || []
        }
      }
    } catch (error) {
      console.error('[Viewer] Error recalculando servidumbres antes de renderizar:', error)
    }
  }

  // 2) Infraestructura canónica (caminos y áreas comunes asignadas)
  const { data: infraData, error: infraError } = await supabase
    .from('geometries')
    .select('*')
    .eq('project_id', projectId)
    .is('lot_id', null)
    .in('geometry_type', ['common_area', 'road'])
    .eq('is_assigned', true)

  if (infraError) {
    console.error('Error fetching common_area geometries:', infraError)
    throw new Error('Error al obtener infraestructura')
  }

  const commonAreas = (infraData as Geometry[]) || []

  // ── Features de lotes ──
  const lotFeatures: ViewerFeature[] = assigned.map((geom) => {
    const lot = geom.lots

    return {
      type: 'Feature',
      geometry: geom.geometry,
      properties: {
        geometry_id: geom.id,
        lot_id: lot?.id ?? undefined,
        geometry_type: geom.geometry_type,
        source_type: geom.source_type,
        name: geom.name ?? undefined,
        numero_lote: lot?.numero_lote ?? undefined,
        estado: (lot?.estado as EstadoLote) || 'sin_asignar',
        observaciones: lot?.observaciones ?? undefined,
        vendedor_id: lot?.vendedor_id,
        precio: lot?.precio ?? undefined,
        valor_reserva: lot?.valor_reserva ?? undefined,
        m2: lot?.m2 ?? undefined,
        servidumbre_m2: lot?.servidumbre_m2 ?? undefined,
        servidumbre_ancho_m: lot?.servidumbre_ancho_m ?? undefined,
        servidumbre_widths_m: lot?.servidumbre_widths_m ?? undefined,
        servidumbre_ancho_label: lot?.servidumbre_ancho_label ?? undefined,
        servidumbre_geometry: lot?.servidumbre_geometry ?? undefined,
        servidumbre_sources: lot?.servidumbre_sources ?? undefined,
        servidumbre_calculation_status: lot?.servidumbre_calculation_status ?? undefined,
        superficie_neta_m2: lot?.superficie_neta_m2 ?? undefined,
        area_official_m2: lot?.area_official_m2 ?? undefined,
        perimeter_official_m: lot?.perimeter_official_m ?? undefined,
        boundaries_official: lot?.boundaries_official ?? undefined,
        verified_status: lot?.verified_status ?? undefined,
        verified_at: lot?.verified_at ?? undefined,
        verified_by: lot?.verified_by ?? undefined,
      },
    }
  })

  // ── Features de servidumbre por lote ──
  const servitudeFeatures: ViewerFeature[] = assigned.flatMap((geom) => {
    const lot = geom.lots
    const servitudeGeometry = extractServitudeGeometry(lot?.servidumbre_geometry ?? null)

    if (!lot || !servitudeGeometry) {
      return []
    }

    return [
      {
        type: 'Feature',
        geometry: servitudeGeometry,
        properties: {
          geometry_id: `servitude-${lot.id}`,
          lot_id: lot.id,
          geometry_type: 'servitude',
          source_type: geom.source_type,
          name: `Servidumbre Lote ${lot.numero_lote}`,
          numero_lote: lot.numero_lote,
          estado: (lot.estado as EstadoLote) || 'sin_asignar',
          servidumbre_m2: lot.servidumbre_m2 ?? undefined,
          servidumbre_ancho_m: lot.servidumbre_ancho_m ?? undefined,
          servidumbre_widths_m: lot.servidumbre_widths_m ?? undefined,
          servidumbre_ancho_label: lot.servidumbre_ancho_label ?? undefined,
          servidumbre_geometry: lot.servidumbre_geometry ?? undefined,
          servidumbre_sources: lot.servidumbre_sources ?? undefined,
          servidumbre_calculation_status: lot.servidumbre_calculation_status ?? undefined,
          superficie_neta_m2: lot.superficie_neta_m2 ?? undefined,
        },
      },
    ]
  })

  // ── Features de infraestructura ──
  const infraFeatures: ViewerFeature[] = commonAreas.map((geom) => ({
    type: 'Feature',
    geometry: geom.geometry,
    properties: {
      geometry_id: geom.id,
      geometry_type: geom.geometry_type,
      source_type: geom.source_type,
      name: geom.name ?? undefined,
      estado: 'sin_asignar' as EstadoLote,
    },
  }))

  return {
    type: 'FeatureCollection',
    features: [...lotFeatures, ...servitudeFeatures, ...infraFeatures],
  }
}

function extractServitudeGeometry(
  servitude: GeoJSONFeature | GeoJSONGeometry | null
): GeoJSONGeometry | null {
  if (!servitude) {
    return null
  }

  if (servitude.type === 'Feature') {
    return servitude.geometry
  }

  return servitude
}

async function fetchAssignedLotGeometries(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ data: unknown; error: unknown }> {
  return supabase
    .from('geometries')
    .select(LOT_GEOMETRIES_SELECT_WITH_SDD14)
    .eq('project_id', projectId)
    .not('lot_id', 'is', null)
}

function shouldBackfillServitudes(assigned: GeometryWithLot[]): boolean {
  return assigned.some((geom) => {
    const lot = geom.lots

    if (!lot || lot.servidumbre_calculation_status === 'official_override') {
      return false
    }

    return lot.servidumbre_calculation_status !== 'calculated'
  })
}
