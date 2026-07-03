import type { GeoJSONGeometry } from '@/types/database.types'

export type Wgs84Position = [number, number]
export type MeterPoint = [number, number]

export interface MetricFixtureOrigin {
  lat: number
  lon: number
}

export const TENO_FIXTURE_ORIGIN: MetricFixtureOrigin = {
  lat: -34.87,
  lon: -71.16,
}

export const SANTIAGO_FIXTURE_ORIGIN: MetricFixtureOrigin = {
  lat: -33.45,
  lon: -70.66,
}

export function degreesPerMeterLat(): number {
  return 1 / 111_132
}

export function degreesPerMeterLon(origin: MetricFixtureOrigin = TENO_FIXTURE_ORIGIN): number {
  return 1 / (111_320 * Math.cos((origin.lat * Math.PI) / 180))
}

export function offsetWgs84(
  dxMeters: number,
  dyMeters: number,
  origin: MetricFixtureOrigin = TENO_FIXTURE_ORIGIN
): Wgs84Position {
  return [
    origin.lon + dxMeters * degreesPerMeterLon(origin),
    origin.lat + dyMeters * degreesPerMeterLat(),
  ]
}

export function ringFromMeters(
  points: MeterPoint[],
  origin: MetricFixtureOrigin = TENO_FIXTURE_ORIGIN
): Wgs84Position[] {
  const ring = points.map(([x, y]) => offsetWgs84(x, y, origin))
  const first = ring[0]
  const last = ring[ring.length - 1]

  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    return [...ring, first]
  }

  return ring
}

export function rectangleRingFromMeters(
  x: number,
  y: number,
  widthM: number,
  heightM: number,
  origin: MetricFixtureOrigin = TENO_FIXTURE_ORIGIN
): Wgs84Position[] {
  return ringFromMeters(
    [
      [x, y],
      [x + widthM, y],
      [x + widthM, y + heightM],
      [x, y + heightM],
    ],
    origin
  )
}

export function polygonFromMeterRings(
  rings: MeterPoint[][],
  origin: MetricFixtureOrigin = TENO_FIXTURE_ORIGIN
): GeoJSONGeometry {
  return {
    type: 'Polygon',
    coordinates: rings.map((ring) => ringFromMeters(ring, origin)),
  }
}

export function rectanglePolygon(
  x: number,
  y: number,
  widthM: number,
  heightM: number,
  origin: MetricFixtureOrigin = TENO_FIXTURE_ORIGIN
): GeoJSONGeometry {
  return {
    type: 'Polygon',
    coordinates: [rectangleRingFromMeters(x, y, widthM, heightM, origin)],
  }
}

export function multiPolygonFromMeterRings(
  polygons: MeterPoint[][][],
  origin: MetricFixtureOrigin = TENO_FIXTURE_ORIGIN
): GeoJSONGeometry {
  return {
    type: 'MultiPolygon',
    coordinates: polygons.map((rings) => rings.map((ring) => ringFromMeters(ring, origin))),
  }
}

export function lineStringFromMeters(
  points: MeterPoint[],
  origin: MetricFixtureOrigin = TENO_FIXTURE_ORIGIN
): GeoJSONGeometry {
  return {
    type: 'LineString',
    coordinates: points.map(([x, y]) => offsetWgs84(x, y, origin)),
  }
}

export function multiLineStringFromMeters(
  lines: MeterPoint[][],
  origin: MetricFixtureOrigin = TENO_FIXTURE_ORIGIN
): GeoJSONGeometry {
  return {
    type: 'MultiLineString',
    coordinates: lines.map((line) => line.map(([x, y]) => offsetWgs84(x, y, origin))),
  }
}

export const metricServidumbreFixtures = {
  lot100x100: rectanglePolygon(0, 0, 100, 100),
  lotWithHole: polygonFromMeterRings([
    [
      [0, 0],
      [120, 0],
      [120, 120],
      [0, 120],
    ],
    [
      [40, 40],
      [80, 40],
      [80, 80],
      [40, 80],
    ],
  ]),
  multiLot: multiPolygonFromMeterRings([
    [
      [
        [0, 0],
        [60, 0],
        [60, 60],
        [0, 60],
      ],
    ],
    [
      [
        [80, 0],
        [140, 0],
        [140, 60],
        [80, 60],
      ],
    ],
  ]),
  centerline5m: lineStringFromMeters([
    [-10, 25],
    [110, 25],
  ]),
  centerline10m: lineStringFromMeters([
    [50, -10],
    [50, 110],
  ]),
  footprint20x30: rectanglePolygon(10, 10, 20, 30),
} satisfies Record<string, GeoJSONGeometry>
