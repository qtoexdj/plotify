import type {
  GeoJSONGeometry,
  GeometryType,
  SourceType,
  EstadoLote,
  VerifiedStatus,
  OfficialBoundaries,
  GeoJSONFeature,
  ServidumbreCalculationStatus,
  ServidumbreSource,
  LotRecord,
} from './database.types'

/** T042 (FR-016): datos de la última reserva aprobada para precargar el
 * formulario de venta. Solo los campos que el formulario edita. */
export type LotClientPrefill = Pick<
  LotRecord,
  | 'cliente_nombre'
  | 'cliente_run'
  | 'cliente_direccion'
  | 'cliente_region'
  | 'cliente_comuna'
  | 'cliente_estado_civil'
  | 'cliente_nacionalidad'
  | 'cliente_ocupacion'
  | 'cliente_telefono'
  | 'cliente_email'
>

export type ViewerGeometryType = GeometryType | 'servitude'

// Feature for viewer (combines geometry with lot data)
export interface ViewerFeature {
  type: 'Feature'
  geometry: GeoJSONGeometry
  properties: {
    geometry_id: string
    geometry_import_id?: string | null
    geometry_feature_key?: string | null
    geometry_active?: boolean
    enrichment_status?: 'pending' | 'leased' | 'retry_scheduled' | 'ready' | 'dead_letter'
    lot_id?: string
    geometry_type: ViewerGeometryType
    source_type: SourceType
    name?: string
    numero_lote?: string
    estado?: EstadoLote | 'sin_asignar'
    observaciones?: string
    vendedor_id?: string | null
    precio?: number
    valor_reserva?: number
    m2?: number
    servidumbre_m2?: number
    servidumbre_ancho_m?: number
    servidumbre_widths_m?: number[]
    servidumbre_ancho_label?: string
    servidumbre_geometry?: GeoJSONFeature
    servidumbre_sources?: ServidumbreSource[]
    servidumbre_calculation_status?: ServidumbreCalculationStatus
    superficie_neta_m2?: number
    area_official_m2?: number
    perimeter_official_m?: number
    boundaries_official?: OfficialBoundaries
    verified_status?: VerifiedStatus
    verified_at?: string | null
    verified_by?: string | null
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
  servidumbre_widths_m: number[] | null
  servidumbre_ancho_label: string | null
  servidumbre_geometry: GeoJSONFeature | null
  servidumbre_sources: ServidumbreSource[] | null
  servidumbre_calculation_status: ServidumbreCalculationStatus
  servidumbre_calculated_at: string | null
  servidumbre_calculation_version: string | null
  superficie_neta_m2: number | null
  area_official_m2: number | null
  perimeter_official_m: number | null
  boundaries_official: OfficialBoundaries | null
  verified_status: VerifiedStatus
  verified_at: string | null
  verified_by: string | null
  etapa_proceso?: import('./database.types').ProcessStage | null
  /** T042 (FR-016): datos de la reserva aprobada más reciente, para
   * precargar el formulario de venta. Solo se resuelve cuando estado es
   * "reservado" o "vendido". */
  client_prefill?: LotClientPrefill | null
}
