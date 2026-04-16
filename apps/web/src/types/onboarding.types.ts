import type { GeoJSONGeometry, GeometryType, SourceType, Lot, Geometry } from './database.types'

// Parsed feature from KMZ/KML upload (not yet saved to DB)
export interface ParsedFeature {
  tempId: string
  geometry: GeoJSONGeometry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>
  geometryType: GeometryType
}

// Upload response from API
export interface UploadResponse {
  message: string
  totalFeatures: number
  sourceType: SourceType
  summary: {
    lots: number
    roads: number
    commonAreas: number
  }
  features: ParsedFeature[]
}

// Request payload for saving and assigning geometry
export interface SaveAndAssignGeometryPayload {
  projectId: string
  lotId: string
  geometry: GeoJSONGeometry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>
  sourceType: SourceType
  geometryType: GeometryType
}

// Request payload for saving infrastructure
export interface SaveInfrastructurePayload {
  projectId: string
  geometry: GeoJSONGeometry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>
  sourceType: SourceType
  geometryType: 'road' | 'common_area'
  name: string
}

// Response from save operations
export interface SaveGeometryResponse {
  message: string
  geometry: Geometry
}

export interface AssignGeometryPayload {
  geometryId: string
  lotId: string
}

// Export Lot type for convenience
export type { Lot }
