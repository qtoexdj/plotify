import { createClient } from '@/lib/supabase/server'
import type { ViewerFeatureCollection, ViewerFeature } from '@/types/viewer.types'
import type { Geometry, Lot, EstadoLote } from '@/types/database.types'

interface GeometryWithLot extends Geometry {
  lots: Pick<Lot, 'id' | 'numero_lote' | 'estado' | 'observaciones' | 'vendedor_id' | 'precio' | 'valor_reserva' | 'm2' | 'servidumbre_m2' | 'superficie_neta_m2' | 'area_official_m2' | 'perimeter_official_m' | 'boundaries_official' | 'verified_status' | 'verified_at' | 'verified_by'> | null
}

export async function getFeatureCollection(projectId: string): Promise<ViewerFeatureCollection> {
  const supabase = await createClient()

  // 1) Geometrías asignadas a un lote (lot_id NOT NULL)
  const { data: lotData, error: lotError } = await supabase
    .from('geometries')
    .select(`
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
        superficie_neta_m2,
        area_official_m2,
        perimeter_official_m,
        boundaries_official,
        verified_status,
        verified_at,
        verified_by
      )
    `)
    .eq('project_id', projectId)
    .not('lot_id', 'is', null)

  if (lotError) {
    console.error('Error fetching lot geometries:', lotError)
    throw new Error('Error al obtener feature collection')
  }

  // 2) Obtener el camino unificado del proyecto
  const { data: projectData, error: projectError } = await supabase
    .from('projects')
    .select('road_geometry')
    .eq('id', projectId)
    .single()

  if (projectError) {
    console.warn('Error fetching project road geometry:', projectError)
  }

  // 3) Áreas comunes (is_assigned = true)
  const { data: infraData, error: infraError } = await supabase
    .from('geometries')
    .select('*')
    .eq('project_id', projectId)
    .is('lot_id', null)
    .eq('geometry_type', 'common_area')
    .eq('is_assigned', true)

  if (infraError) {
    console.error('Error fetching common_area geometries:', infraError)
    throw new Error('Error al obtener infraestructura')
  }

  const assigned = (lotData as unknown as GeometryWithLot[]) || []
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

  // ── Features de áreas comunes ──
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

  // ── Feature del camino del proyecto ──
  const roadFeatures: ViewerFeature[] = []
  if (projectData?.road_geometry) {
    roadFeatures.push({
      type: 'Feature',
      geometry: projectData.road_geometry,
      properties: {
        geometry_id: `road-project-${projectId}`,
        geometry_type: 'road',
        source_type: 'kmz',
        name: 'Camino Principal',
        estado: 'sin_asignar' as EstadoLote,
      }
    })
  }

  return {
    type: 'FeatureCollection',
    features: [...lotFeatures, ...infraFeatures, ...roadFeatures],
  }
}

