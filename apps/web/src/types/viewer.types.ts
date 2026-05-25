import type {
  GeoJSONGeometry,
  GeometryType,
  SourceType,
  EstadoLote,
  VerifiedStatus,
  OfficialBoundaries,
} from './database.types'

// Feature for viewer (combines geometry with lot data)
export interface ViewerFeature {
  type: 'Feature'
  geometry: GeoJSONGeometry
  properties: {
    geometry_id: string
    lot_id?: string
    geometry_type: GeometryType
    source_type: SourceType
    name?: string
    numero_lote?: string
    estado?: EstadoLote | 'sin_asignar'
    observaciones?: string
    vendedor_id?: string | null
    precio?: number
    valor_reserva?: number
    m2?: number
  }
}

export interface ViewerFeatureCollection {
  type: 'FeatureCollection'
  features: ViewerFeature[]
}

// Bounds for canvas calculations
export interface GeometryBounds {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

// Canvas configuration
export interface CanvasConfig {
  width: number
  height: number
  padding: number
  scale: number
  offsetX: number
  offsetY: number
}

export interface LotDetails {
  id: string
  project_id: string
  numero_lote: string
  estado: EstadoLote
  vendedor_id: string | null
  observaciones: string | null
  precio: number | null
  valor_reserva: number | null
  m2: number | null
  servidumbre_m2: number | null
  servidumbre_ancho_m: number | null
  superficie_neta_m2: number | null
  area_official_m2: number | null
  perimeter_official_m: number | null
  boundaries_official: OfficialBoundaries | null
  verified_status: VerifiedStatus
  verified_at: string | null
  verified_by: string | null
  etapa_proceso?: import('./database.types').ProcessStage | null
}
