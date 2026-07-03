import buffer from '@turf/buffer'
import intersect from '@turf/intersect'
import { union } from '@turf/union'
import { featureCollection } from '@turf/helpers'
import type { Feature, LineString, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson'
import type { GeoJSONGeometry } from '@/types/database.types'
import { computeM2FromGeoJSON } from './compute-m2'

export type RoadInputMode = 'centerline' | 'footprint' | 'edge'

export interface RoadSegmentInput {
  id: string
  geometry: GeoJSONGeometry
  mode: RoadInputMode
  widthM?: number
  edgeSide?: 'left' | 'right' | 'both'
}

export interface RoadFootprint {
  segmentId: string
  widthM: number | null
  widthLabel: string | null
  geometry: Feature<Polygon | MultiPolygon> | null
  status: 'ready' | 'needs_review' | 'invalid'
  warnings: string[]
}

export interface LotServitudeInput {
  lotId: string
  lotGeometry: GeoJSONGeometry
  totalAreaM2: number | null
  roadSegments: RoadSegmentInput[]
}

export interface LotServitudeResult {
  lotId: string
  servidumbreM2: number
  superficieNetaM2: number | null
  widthsM: number[]
  widthLabel: string | null
  intersectionGeometry: Feature<Polygon | MultiPolygon> | null
  sourceSegmentIds: string[]
  status: 'calculated' | 'needs_review' | 'error'
  warnings: string[]
}

export function normalizeRoadSegmentToFootprint(segment: RoadSegmentInput): RoadFootprint {
  const warnings: string[] = []

  if (segment.mode === 'centerline') {
    if (!isPositiveWidth(segment.widthM)) {
      return invalidFootprint(
        segment.id,
        segment.widthM ?? null,
        'centerline requires positive widthM'
      )
    }

    const roadFeature = toLineFeature(segment.geometry)
    if (!roadFeature) {
      return invalidFootprint(
        segment.id,
        segment.widthM,
        'centerline requires LineString or MultiLineString'
      )
    }

    const footprint = buffer(roadFeature, segment.widthM / 2, { units: 'meters' })

    if (!footprint || !isPolygonGeometry(footprint.geometry)) {
      return invalidFootprint(
        segment.id,
        segment.widthM,
        'centerline buffer did not produce a footprint'
      )
    }

    return {
      segmentId: segment.id,
      widthM: segment.widthM,
      widthLabel: formatWidth(segment.widthM),
      geometry: footprint as Feature<Polygon | MultiPolygon>,
      status: 'ready',
      warnings,
    }
  }

  if (segment.mode === 'footprint') {
    const footprint = toPolygonFeature(segment.geometry)

    if (!footprint) {
      return invalidFootprint(
        segment.id,
        segment.widthM ?? null,
        'footprint requires Polygon or MultiPolygon'
      )
    }

    return {
      segmentId: segment.id,
      widthM: segment.widthM ?? null,
      widthLabel: segment.widthM ? formatWidth(segment.widthM) : null,
      geometry: footprint,
      status: 'ready',
      warnings,
    }
  }

  if (segment.mode === 'edge') {
    warnings.push('edge mode requires side-aware footprint confirmation before calculation')
    return {
      segmentId: segment.id,
      widthM: segment.widthM ?? null,
      widthLabel: segment.widthM ? formatWidth(segment.widthM) : null,
      geometry: null,
      status: 'needs_review',
      warnings,
    }
  }

  return invalidFootprint(
    segment.id,
    segment.widthM ?? null,
    `unsupported road mode: ${segment.mode}`
  )
}

export function calculateLotServitude(input: LotServitudeInput): LotServitudeResult {
  const lotFeature = toPolygonFeature(input.lotGeometry)
  const warnings: string[] = []

  if (!lotFeature) {
    return {
      lotId: input.lotId,
      servidumbreM2: 0,
      superficieNetaM2: input.totalAreaM2,
      widthsM: [],
      widthLabel: null,
      intersectionGeometry: null,
      sourceSegmentIds: [],
      status: 'error',
      warnings: ['lotGeometry must be Polygon or MultiPolygon'],
    }
  }

  const intersections: Feature<Polygon | MultiPolygon>[] = []
  const widths = new Set<number>()
  const sourceSegmentIds: string[] = []
  let hasReviewableSegment = false

  for (const segment of input.roadSegments) {
    const footprint = normalizeRoadSegmentToFootprint(segment)
    warnings.push(...footprint.warnings)

    if (footprint.status === 'needs_review') {
      hasReviewableSegment = true
    }

    if (footprint.status !== 'ready' || !footprint.geometry) {
      continue
    }

    const clipped = intersect(featureCollection([lotFeature, footprint.geometry]))

    if (!clipped || !isPolygonGeometry(clipped.geometry)) {
      continue
    }

    intersections.push(clipped as Feature<Polygon | MultiPolygon>)
    sourceSegmentIds.push(footprint.segmentId)

    if (footprint.widthM !== null) {
      widths.add(footprint.widthM)
    }
  }

  if (intersections.length === 0) {
    return {
      lotId: input.lotId,
      servidumbreM2: 0,
      superficieNetaM2: input.totalAreaM2,
      widthsM: [],
      widthLabel: null,
      intersectionGeometry: null,
      sourceSegmentIds: [],
      status: hasReviewableSegment ? 'needs_review' : 'calculated',
      warnings,
    }
  }

  const intersectionGeometry = unionIntersections(intersections)
  const servidumbreM2 = intersectionGeometry
    ? (computeM2FromGeoJSON(intersectionGeometry.geometry as GeoJSONGeometry) ?? 0)
    : 0
  const widthsM = [...widths].sort((a, b) => a - b)

  return {
    lotId: input.lotId,
    servidumbreM2,
    superficieNetaM2:
      input.totalAreaM2 === null ? null : Math.max(input.totalAreaM2 - servidumbreM2, 0),
    widthsM,
    widthLabel: formatServidumbreWidths(widthsM),
    intersectionGeometry,
    sourceSegmentIds,
    status: 'calculated',
    warnings,
  }
}

function unionIntersections(
  intersections: Feature<Polygon | MultiPolygon>[]
): Feature<Polygon | MultiPolygon> | null {
  if (intersections.length === 1) {
    return intersections[0]
  }

  return union(featureCollection(intersections)) as Feature<Polygon | MultiPolygon> | null
}

function invalidFootprint(
  segmentId: string,
  widthM: number | null,
  warning: string
): RoadFootprint {
  return {
    segmentId,
    widthM,
    widthLabel: widthM ? formatWidth(widthM) : null,
    geometry: null,
    status: 'invalid',
    warnings: [warning],
  }
}

function toLineFeature(geometry: GeoJSONGeometry): Feature<LineString | MultiLineString> | null {
  if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') {
    return null
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: geometry.type,
      coordinates: geometry.coordinates as Position[] | Position[][],
    },
  } as Feature<LineString | MultiLineString>
}

function toPolygonFeature(geometry: GeoJSONGeometry): Feature<Polygon | MultiPolygon> | null {
  if (!isPolygonGeometry(geometry)) {
    return null
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: JSON.parse(JSON.stringify(geometry)) as Polygon | MultiPolygon,
  }
}

function isPolygonGeometry(
  geometry: GeoJSONGeometry | Polygon | MultiPolygon
): geometry is GeoJSONGeometry & (Polygon | MultiPolygon) {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon'
}

function isPositiveWidth(widthM: number | undefined): widthM is number {
  return typeof widthM === 'number' && Number.isFinite(widthM) && widthM > 0
}

export function formatServidumbreWidths(widthsM: number[]): string | null {
  const normalized = [...new Set(widthsM.filter(Number.isFinite))].sort((a, b) => a - b)

  if (normalized.length === 0) {
    return null
  }

  return normalized.map(formatWidth).join(' y ')
}

function formatWidth(widthM: number): string {
  return Number.isInteger(widthM) ? widthM.toString() : widthM.toFixed(1)
}
