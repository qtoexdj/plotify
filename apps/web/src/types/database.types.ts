// Enums
export type GeometryType = 'lot' | 'road' | 'common_area'
export type SourceType = 'kmz' | 'kml' | 'dxf' | 'dwg'
export type EstadoLote = 'disponible' | 'reservado' | 'vendido'
export type VerifiedStatus = 'draft' | 'verified_exact' | 'verified_override'

export interface NeighborMetadata {
    name: string
    is_partial: boolean
}

export interface OfficialBoundary {
    label: string        // Orientación (e.g. "Suroriente")
    description: string  // Texto libre (legacy compat)
    distance?: number    // Distancia en metros (editable)
    colinda?: string     // Con quién colinda (editable, refleja plano oficial)
    es_servidumbre?: boolean  // true = este deslinde toca el camino/servidumbre
    neighbors_metadata?: NeighborMetadata[]
}

export type OfficialBoundaries = OfficialBoundary[]

// ─── Servidumbre Analysis Types ──────────────────────────────────────────────

/** Tipo de frontera de una arista del mini-polígono de servidumbre */
export type ServidumbreFrontierType =
    | 'internal'    // Colinda con el área útil del propio lote
    | 'neighbor'    // Colinda con la servidumbre que grava a un lote vecino
    | 'external'    // Colinda con algo fuera de la subdivisión

/** Una arista clasificada del mini-polígono de servidumbre */
export interface ServidumbreEdge {
    direction: string           // Cardinal: "Norte", "Suroriente", etc.
    distance: number            // Longitud en metros
    frontierType: ServidumbreFrontierType
    /** Número del lote propio (para fronteras internas) */
    selfLotNumber?: string
    /** Vecinos detectados (para fronteras externas/neighbor) */
    neighbors: NeighborMetadata[]
    /** Nombre externo si colinda fuera de subdivisión */
    externalName?: string
    /** Bearing promedio del segmento fusionado */
    bearing: number
    /** Coordenadas inicio y fin del segmento */
    p1: number[]
    p2: number[]
}

/** Un tramo agrupa aristas consecutivas bajo una misma dirección cardinal dominante */
export interface ServidumbreTramo {
    /** Dirección cardinal dominante del tramo (ej. "Norte", "Norponiente") */
    direction: string
    /** Aristas clasificadas que componen este tramo */
    edges: ServidumbreEdge[]
}

/** Resultado completo del análisis de servidumbre para un lote */
export interface ServidumbreAnalysis {
    /** Número del lote analizado */
    lotNumber: string
    /** Área total de la servidumbre en m2 */
    areaM2: number
    /** true si el resultado tiene más de un tramo */
    isMultiTramo: boolean
    /** Tramos de la servidumbre (1 = simple, >1 = multi-geometría) */
    tramos: ServidumbreTramo[]
    /** Todas las aristas clasificadas (flat, para debug) */
    allEdges: ServidumbreEdge[]
}

export type ProcessStage =
    | 'espera_firma_reserva'
    | 'reserva_firmada'
    | 'espera_firma_escritura'
    | 'escritura_firmada'

// ─── Approval Request Types ─────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type VendorPlatform = 'telegram' | 'whatsapp'

/** Payload almacenado en approval_requests.payload (JSONB) */
export interface ApprovalRequestPayload {
    cliente_nombre: string
    cliente_run: string
    valor_reserva: number
    notaria: string
    fecha_firma?: string
    // Campos extra para popular lot_records al aprobar
    cliente_direccion?: string
    cliente_estado_civil?: string
    cliente_ocupacion?: string
    cliente_email?: string
    cliente_telefono?: string
}

/** Registro de la tabla approval_requests */
export interface ApprovalRequest {
    id: string
    lot_id: string
    organization_id: string
    vendor_id: string
    vendor_name: string
    vendor_phone: string
    vendor_platform: VendorPlatform
    payload: ApprovalRequestPayload
    status: ApprovalStatus
    admin_phone: string | null
    created_at: string
    resolved_at: string | null
}

// GeoJSON Types
export interface GeoJSONGeometry {
    type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString' | 'Point' | 'MultiPoint' | 'GeometryCollection'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coordinates: any
    geometries?: GeoJSONGeometry[]
}

export interface GeoJSONFeature {
    type: 'Feature'
    geometry: GeoJSONGeometry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Record<string, any>
}

export interface GeoJSONFeatureCollection {
    type: 'FeatureCollection'
    features: GeoJSONFeature[]
}

// Database Tables
export interface Project {
    id: string
    name: string
    region: string | null
    comuna: string | null
    descripcion: string | null
    total_lotes: number
    estado: string
    owner_id: string | null
    organization_id: string | null
    road_geometry: GeoJSONGeometry | null
    road_width_m: number
    images: string[] | null
    doc_dominio_vigente: string | null
    doc_hipoteca_gravamen: string | null
    doc_roles: string | null
    doc_subdivision: string | null
    doc_plano_oficial: string | null
    doc_otros: string | null
    created_at: string
    updated_at: string
}

export interface Lot {
    id: string
    project_id: string
    numero_lote: string
    estado: EstadoLote
    observaciones: string | null
    vendedor_id: string | null
    precio: number | null
    valor_reserva: number | null
    m2: number | null
    servidumbre_m2: number | null
    servidumbre_ancho_m: number | null
    superficie_neta_m2: number | null
    reserved_at: string | null
    sold_at: string | null
    geometry_id: string | null
    area_official_m2: number | null
    perimeter_official_m: number | null
    boundaries_official: OfficialBoundaries | null
    verified_status: VerifiedStatus
    verified_at: string | null
    verified_by: string | null
    created_at: string
    updated_at: string
}

export interface Geometry {
    id: string
    project_id: string
    lot_id: string | null
    geometry_type: GeometryType
    source_type: SourceType
    geometry: GeoJSONGeometry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Record<string, any> | null
    name: string | null
    is_assigned: boolean
    created_at: string
    updated_at: string
}

export interface LotRecord {
    id: string
    lot_id: string
    cliente_nombre: string | null
    cliente_run: string | null
    cliente_run_normalizado: string | null
    cliente_direccion: string | null
    cliente_estado_civil: string | null
    cliente_ocupacion: string | null
    cliente_telefono: string | null
    cliente_email: string | null
    valor: number | null
    abono: number | null
    saldo: number | null
    detalle_deuda: string | null
    firma_estado: string | null
    firma_fecha: string | null
    firma_lugar: string | null
    gasto_notaria: number | null
    gasto_cbr: number | null
    gasto_abogado: number | null
    cbr_estado: string | null
    cbr_numero_petitorio: string | null
    cbr_fecha_salida_estimada: string | null
    cbr_reparo: string | null
    comision_monto: number | null
    comision_pagada_at: string | null
    etapa_proceso: ProcessStage | null
    created_at: string
    updated_at: string
}

export interface Vendor {
    id: string
    nombre: string
    email: string | null
    phone: string | null
    active: boolean
    notas: string | null
    owner_id: string | null
    organization_id: string | null
    user_id: string | null
    created_at: string
    updated_at: string
}

export interface Profile {
    id: string
    updated_at: string | null
    username: string | null
    first_name: string | null
    last_name: string | null
    phone: string | null
    avatar_url: string | null
    website: string | null
    telegram_chat_id: string | null
    is_super_admin: boolean
}

export interface Organization {
    id: string
    name: string
    slug: string
    created_by: string
    is_personal: boolean
    created_at: string
    updated_at: string
}

export interface OrganizationMember {
    organization_id: string
    user_id: string
    role: 'admin' | 'user'
    created_at: string
    updated_at: string
}

// Extended types with relations
export interface ProjectWithMetrics extends Project {
    lotes_libres: number
    lotes_reservados: number
    lotes_vendidos: number
    vendedores?: { id: string; nombre: string }[]
}
