import type { LotServitudeInput, RoadSegmentInput } from '@/lib/geometry/servidumbre-footprints'
import type { GeoJSONGeometry } from '@/types/database.types'
import {
  lineStringFromMeters,
  metricServidumbreFixtures,
  polygonFromMeterRings,
  rectanglePolygon,
} from './servidumbre-fixtures'

export type TenoServidumbreCaseKey =
  | 'width-5'
  | 'width-10'
  | 'width-5-and-10'
  | 'zero'
  | 'overlap'
  | 'hole'

export interface TenoServidumbreExpected {
  status: 'calculated'
  widthsM: number[]
  widthLabel: string | null
  servidumbreM2Range: readonly [number, number]
  superficieNetaM2Range: readonly [number, number]
  sourceSegmentIds: string[]
  hasIntersectionGeometry: boolean
}

export interface TenoServidumbreFixtureCase {
  key: TenoServidumbreCaseKey
  title: string
  note: string
  lotGeometry: GeoJSONGeometry
  totalAreaM2: number
  roadSegments: RoadSegmentInput[]
  input: LotServitudeInput
  expected: TenoServidumbreExpected
}

const lot100x100 = metricServidumbreFixtures.lot100x100
const lotWithInnerHole = polygonFromMeterRings([
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
])

const road5Horizontal: RoadSegmentInput = {
  id: 'teno-road-5-horizontal',
  geometry: lineStringFromMeters([
    [-20, 20],
    [120, 20],
  ]),
  mode: 'centerline',
  widthM: 5,
}

const road10Vertical: RoadSegmentInput = {
  id: 'teno-road-10-vertical',
  geometry: lineStringFromMeters([
    [70, -20],
    [70, 120],
  ]),
  mode: 'centerline',
  widthM: 10,
}

const roadOutside: RoadSegmentInput = {
  id: 'teno-road-outside',
  geometry: lineStringFromMeters([
    [-20, 150],
    [120, 150],
  ]),
  mode: 'centerline',
  widthM: 10,
}

const roadOverlapA: RoadSegmentInput = {
  id: 'teno-road-overlap-a',
  geometry: lineStringFromMeters([
    [-20, 50],
    [120, 50],
  ]),
  mode: 'centerline',
  widthM: 10,
}

const roadOverlapB: RoadSegmentInput = {
  id: 'teno-road-overlap-b',
  geometry: lineStringFromMeters([
    [-20, 54],
    [120, 54],
  ]),
  mode: 'centerline',
  widthM: 10,
}

const roadThroughHole: RoadSegmentInput = {
  id: 'teno-road-through-hole',
  geometry: lineStringFromMeters([
    [-20, 60],
    [140, 60],
  ]),
  mode: 'centerline',
  widthM: 10,
}

const footprint5Polygon: RoadSegmentInput = {
  id: 'teno-footprint-5-polygon',
  geometry: rectanglePolygon(0, 75, 100, 5),
  mode: 'footprint',
  widthM: 5,
}

function fixtureCase(
  key: TenoServidumbreCaseKey,
  title: string,
  note: string,
  lotGeometry: GeoJSONGeometry,
  totalAreaM2: number,
  roadSegments: RoadSegmentInput[],
  expected: TenoServidumbreExpected
): TenoServidumbreFixtureCase {
  return {
    key,
    title,
    note,
    lotGeometry,
    totalAreaM2,
    roadSegments,
    input: {
      lotId: `teno-${key}`,
      lotGeometry,
      totalAreaM2,
      roadSegments,
    },
    expected,
  }
}

export const tenoServidumbreFixtureCases = [
  fixtureCase(
    'width-5',
    'Teno-like lot affected by a 5 m footprint',
    'Direct polygon footprint keeps the 5 m label without buffering it again.',
    lot100x100,
    10_000,
    [footprint5Polygon],
    {
      status: 'calculated',
      widthsM: [5],
      widthLabel: '5',
      servidumbreM2Range: [475, 525],
      superficieNetaM2Range: [9_475, 9_525],
      sourceSegmentIds: ['teno-footprint-5-polygon'],
      hasIntersectionGeometry: true,
    }
  ),
  fixtureCase(
    'width-10',
    'Teno-like lot affected by a 10 m road axis',
    'Centerline input represents the full legal road width.',
    lot100x100,
    10_000,
    [road10Vertical],
    {
      status: 'calculated',
      widthsM: [10],
      widthLabel: '10',
      servidumbreM2Range: [975, 1_025],
      superficieNetaM2Range: [8_975, 9_025],
      sourceSegmentIds: ['teno-road-10-vertical'],
      hasIntersectionGeometry: true,
    }
  ),
  fixtureCase(
    'width-5-and-10',
    'Teno-like lot affected by 5 m and 10 m roads',
    'Mixed widths preserve the legal label and count the crossing only once.',
    lot100x100,
    10_000,
    [road5Horizontal, road10Vertical],
    {
      status: 'calculated',
      widthsM: [5, 10],
      widthLabel: '5 y 10',
      servidumbreM2Range: [1_425, 1_475],
      superficieNetaM2Range: [8_525, 8_575],
      sourceSegmentIds: ['teno-road-5-horizontal', 'teno-road-10-vertical'],
      hasIntersectionGeometry: true,
    }
  ),
  fixtureCase(
    'zero',
    'Teno-like lot without servitude intersection',
    'Road metadata exists, but the footprint does not touch the lot.',
    lot100x100,
    10_000,
    [roadOutside],
    {
      status: 'calculated',
      widthsM: [],
      widthLabel: null,
      servidumbreM2Range: [0, 0],
      superficieNetaM2Range: [10_000, 10_000],
      sourceSegmentIds: [],
      hasIntersectionGeometry: false,
    }
  ),
  fixtureCase(
    'overlap',
    'Teno-like lot with overlapping 10 m footprints',
    'Parallel nearby roads overlap, so the affected area must be unioned before measuring.',
    lot100x100,
    10_000,
    [roadOverlapA, roadOverlapB],
    {
      status: 'calculated',
      widthsM: [10],
      widthLabel: '10',
      servidumbreM2Range: [1_375, 1_425],
      superficieNetaM2Range: [8_575, 8_625],
      sourceSegmentIds: ['teno-road-overlap-a', 'teno-road-overlap-b'],
      hasIntersectionGeometry: true,
    }
  ),
  fixtureCase(
    'hole',
    'Teno-like lot with an inner hole crossed by a 10 m road',
    'The legal area excludes the interior ring before calculating usable area.',
    lotWithInnerHole,
    12_800,
    [roadThroughHole],
    {
      status: 'calculated',
      widthsM: [10],
      widthLabel: '10',
      servidumbreM2Range: [775, 825],
      superficieNetaM2Range: [11_975, 12_025],
      sourceSegmentIds: ['teno-road-through-hole'],
      hasIntersectionGeometry: true,
    }
  ),
] satisfies TenoServidumbreFixtureCase[]

export const tenoServidumbreFixtureByKey = Object.fromEntries(
  tenoServidumbreFixtureCases.map((fixture) => [fixture.key, fixture])
) as Record<TenoServidumbreCaseKey, TenoServidumbreFixtureCase>

export function getTenoServidumbreFixtureCase(
  key: TenoServidumbreCaseKey
): TenoServidumbreFixtureCase {
  return tenoServidumbreFixtureByKey[key]
}
