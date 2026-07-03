import { describe, expect, it, vi } from 'vitest'
import {
  recalculateProjectServidumbres,
  saveAndAssignGeometry,
  saveInfrastructure,
  updateRoadSegmentWidthAndRecalculateServidumbres,
} from '@/lib/services/onboarding.service'
import type { GeoJSONGeometry } from '@/types/database.types'
import { lineStringFromMeters, rectanglePolygon } from './lib/geometry/servidumbre-fixtures'

function queryResult<T>(result: { data: T; error: null }) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    not: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result),
    then: (
      resolve: (value: { data: T; error: null }) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  }

  return query
}

function buildSupabaseForRoadSave() {
  const roadGeometry = lineStringFromMeters([
    [50, 0],
    [50, 100],
  ])
  const lotGeometry = rectanglePolygon(0, 0, 100, 100)
  const roadFootprint = rectanglePolygon(45, 0, 10, 100)
  const segmentInserts: unknown[] = []
  const segmentRows: unknown[] = []
  const lotUpdates: unknown[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'geometries') {
        return {
          insert: vi.fn((payload: unknown) =>
            queryResult({
              data: { id: 'geometry-road-1', ...(payload as object) },
              error: null,
            })
          ),
          select: vi.fn(() =>
            queryResult({ data: [{ id: 'geometry-lot-1', geometry: lotGeometry }], error: null })
          ),
        }
      }

      if (table === 'project_road_segments') {
        return {
          insert: vi.fn((payload: unknown) => {
            segmentInserts.push(payload)
            segmentRows.push({ id: 'segment-1', ...(payload as object) })
            return queryResult({
              data: { id: 'segment-1', ...(payload as object) },
              error: null,
            })
          }),
          select: vi.fn(() => queryResult({ data: segmentRows, error: null })),
        }
      }

      if (table === 'lots') {
        return {
          select: vi.fn(() =>
            queryResult({
              data: [
                {
                  id: 'lot-1',
                  m2: 10000,
                  geometry_id: 'geometry-lot-1',
                  servidumbre_calculation_status: 'not_calculated',
                },
              ],
              error: null,
            })
          ),
          update: vi.fn((payload: unknown) => {
            lotUpdates.push(payload)
            return queryResult({ data: null, error: null })
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, roadGeometry, roadFootprint, segmentInserts, lotUpdates }
}

function buildSupabaseForMultipleRoadWidthsSave() {
  const lotGeometry = rectanglePolygon(0, 0, 100, 100)
  const road5Footprint = rectanglePolygon(0, 20, 100, 5)
  const road10Footprint = rectanglePolygon(45, 0, 10, 100)
  const segmentRows: unknown[] = [
    {
      id: 'segment-existing-5',
      name: 'Huella existente 5 m',
      input_geometry: road5Footprint,
      input_mode: 'footprint',
      width_m: 5,
      edge_side: null,
      footprint_geometry: road5Footprint,
      status: 'ready',
    },
  ]
  const lotUpdates: unknown[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'geometries') {
        return {
          insert: vi.fn((payload: unknown) =>
            queryResult({
              data: { id: 'geometry-road-10', ...(payload as object) },
              error: null,
            })
          ),
          select: vi.fn(() =>
            queryResult({ data: [{ id: 'geometry-lot-1', geometry: lotGeometry }], error: null })
          ),
        }
      }

      if (table === 'project_road_segments') {
        return {
          insert: vi.fn((payload: unknown) => {
            segmentRows.push({ id: 'segment-new-10', ...(payload as object) })
            return queryResult({
              data: { id: 'segment-new-10', ...(payload as object) },
              error: null,
            })
          }),
          select: vi.fn(() => queryResult({ data: segmentRows, error: null })),
        }
      }

      if (table === 'lots') {
        return {
          select: vi.fn(() =>
            queryResult({
              data: [
                {
                  id: 'lot-multiple-widths',
                  m2: 10_000,
                  geometry_id: 'geometry-lot-1',
                  servidumbre_calculation_status: 'not_calculated',
                },
              ],
              error: null,
            })
          ),
          update: vi.fn((payload: unknown) => {
            lotUpdates.push(payload)
            return queryResult({ data: null, error: null })
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, road10Footprint, lotUpdates }
}

function buildSupabaseForProjectWithoutRoadSegmentsRecalculate() {
  const lotUpdates: unknown[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'project_road_segments') {
        return {
          select: vi.fn(() => queryResult({ data: [], error: null })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, lotUpdates }
}

function buildSupabaseForLotAssignWithoutRoadSegments() {
  const lotGeometry = rectanglePolygon(0, 0, 100, 100)
  const lotUpdates: unknown[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'lots') {
        return {
          select: vi.fn(() => queryResult({ data: { geometry_id: null }, error: null })),
          update: vi.fn((payload: unknown) => {
            lotUpdates.push(payload)
            return queryResult({ data: null, error: null })
          }),
        }
      }

      if (table === 'geometries') {
        return {
          insert: vi.fn((payload: unknown) =>
            queryResult({
              data: { id: 'geometry-lot-1', ...(payload as object) },
              error: null,
            })
          ),
          delete: vi.fn(() => queryResult({ data: null, error: null })),
        }
      }

      if (table === 'project_road_segments') {
        return {
          select: vi.fn(() => queryResult({ data: [], error: null })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, lotGeometry, lotUpdates }
}

function buildSupabaseForCanonicalRoadAssign() {
  const roadFootprint = rectanglePolygon(45, 0, 10, 100)
  const lotGeometry = rectanglePolygon(0, 0, 100, 100)
  const lotUpdates: unknown[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'lots') {
        return {
          select: vi.fn(() => queryResult({ data: { geometry_id: null }, error: null })),
          update: vi.fn((payload: unknown) => {
            lotUpdates.push(payload)
            return queryResult({ data: null, error: null })
          }),
        }
      }

      if (table === 'geometries') {
        return {
          insert: vi.fn((payload: unknown) =>
            queryResult({
              data: { id: 'geometry-lot-2', ...(payload as object) },
              error: null,
            })
          ),
          delete: vi.fn(() => queryResult({ data: null, error: null })),
        }
      }

      if (table === 'project_road_segments') {
        return {
          select: vi.fn(() =>
            queryResult({
              data: [
                {
                  id: 'segment-existing-10',
                  name: 'Huella existente 10 m',
                  input_geometry: roadFootprint,
                  input_mode: 'footprint',
                  width_m: 10,
                  edge_side: null,
                  footprint_geometry: roadFootprint,
                  status: 'ready',
                },
              ],
              error: null,
            })
          ),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, lotGeometry, lotUpdates }
}

function buildSupabaseForRoadSegmentWidthUpdate() {
  const roadGeometry = lineStringFromMeters([
    [50, 0],
    [50, 100],
  ])
  const lotGeometry = rectanglePolygon(0, 0, 100, 100)
  const segmentUpdates: unknown[] = []
  const lotUpdates: unknown[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'project_road_segments') {
        return {
          select: vi.fn(() => {
            const query = {
              eq: vi.fn(() => query),
              single: vi.fn(async () => ({
                data: {
                  id: 'segment-existing-10',
                  input_geometry: roadGeometry,
                  input_mode: 'centerline',
                  edge_side: null,
                },
                error: null,
              })),
              then: (
                resolve: (value: { data: unknown[]; error: null }) => unknown,
                reject?: (reason: unknown) => unknown
              ) =>
                Promise.resolve({
                  data: [
                    {
                      id: 'segment-existing-10',
                      name: 'Camino ajustado 5 m',
                      input_geometry: roadGeometry,
                      input_mode: 'centerline',
                      width_m: 5,
                      edge_side: null,
                      footprint_geometry: null,
                      status: 'ready',
                    },
                  ],
                  error: null,
                }).then(resolve, reject),
            }
            return query
          }),
          update: vi.fn((payload: unknown) => {
            segmentUpdates.push(payload)
            return queryResult({ data: null, error: null })
          }),
        }
      }

      if (table === 'lots') {
        return {
          select: vi.fn(() =>
            queryResult({
              data: [
                {
                  id: 'lot-1',
                  m2: 10_000,
                  geometry_id: 'geometry-lot-1',
                  servidumbre_calculation_status: 'not_calculated',
                },
              ],
              error: null,
            })
          ),
          update: vi.fn((payload: unknown) => {
            lotUpdates.push(payload)
            return queryResult({ data: null, error: null })
          }),
        }
      }

      if (table === 'geometries') {
        return {
          select: vi.fn(() =>
            queryResult({ data: [{ id: 'geometry-lot-1', geometry: lotGeometry }], error: null })
          ),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, segmentUpdates, lotUpdates }
}

describe('onboarding servidumbre persistence', () => {
  it('stores explicit centerline road metadata and calculated footprint when infrastructure is saved', async () => {
    const { supabase, roadGeometry, segmentInserts } = buildSupabaseForRoadSave()

    await saveInfrastructure(
      {
        projectId: 'project-1',
        geometry: roadGeometry,
        properties: { name: 'Camino 10 m' },
        sourceType: 'kmz',
        geometryType: 'road',
        name: 'Camino 10 m',
        inputMode: 'centerline',
        widthM: 10,
      },
      supabase as never
    )

    expect(segmentInserts).toHaveLength(1)
    expect(segmentInserts[0]).toMatchObject({
      project_id: 'project-1',
      geometry_id: 'geometry-road-1',
      name: 'Camino 10 m',
      input_geometry: roadGeometry,
      input_mode: 'centerline',
      width_m: 10,
      source_type: 'kmz',
      status: 'ready',
    })
    expect(segmentInserts[0]).toHaveProperty('footprint_geometry')
  })

  it('persists lot servitude geometry, widths and traceability from road segments', async () => {
    const { supabase, roadFootprint, lotUpdates } = buildSupabaseForRoadSave()

    await saveInfrastructure(
      {
        projectId: 'project-1',
        geometry: roadFootprint as GeoJSONGeometry,
        properties: { name: 'Huella camino 10 m' },
        sourceType: 'kmz',
        geometryType: 'road',
        name: 'Huella camino 10 m',
        inputMode: 'footprint',
        widthM: 10,
      },
      supabase as never
    )

    expect(lotUpdates).toContainEqual(
      expect.objectContaining({
        servidumbre_widths_m: [10],
        servidumbre_ancho_label: '10',
        servidumbre_calculation_status: 'calculated',
        servidumbre_calculation_version: expect.any(String),
        servidumbre_geometry: expect.objectContaining({ type: 'Feature' }),
        servidumbre_sources: [
          expect.objectContaining({
            segment_id: 'segment-1',
            width_m: 10,
            input_mode: 'footprint',
          }),
        ],
      })
    )
  })

  it('persists multiple servitude widths and their legal label from recalculation', async () => {
    const { supabase, road10Footprint, lotUpdates } = buildSupabaseForMultipleRoadWidthsSave()

    await saveInfrastructure(
      {
        projectId: 'project-1',
        geometry: road10Footprint as GeoJSONGeometry,
        properties: { name: 'Huella camino 10 m' },
        sourceType: 'kmz',
        geometryType: 'road',
        name: 'Huella camino 10 m',
        inputMode: 'footprint',
        widthM: 10,
      },
      supabase as never
    )

    expect(lotUpdates).toContainEqual(
      expect.objectContaining({
        servidumbre_widths_m: [5, 10],
        servidumbre_ancho_label: '5 y 10',
        servidumbre_ancho_m: 5,
        servidumbre_calculation_status: 'calculated',
        servidumbre_sources: [
          expect.objectContaining({
            segment_id: 'segment-existing-5',
            width_m: 5,
            input_mode: 'footprint',
          }),
          expect.objectContaining({
            segment_id: 'segment-new-10',
            width_m: 10,
            input_mode: 'footprint',
          }),
        ],
      })
    )
  })

  it('does not calculate servitude when assigning a lot without canonical road segments', async () => {
    const { supabase, lotGeometry, lotUpdates } = buildSupabaseForLotAssignWithoutRoadSegments()

    await saveAndAssignGeometry(
      {
        projectId: 'project-1',
        lotId: 'lot-1',
        geometry: lotGeometry,
        properties: { name: 'Lote 1' },
        sourceType: 'kmz',
        geometryType: 'lot',
      },
      supabase as never
    )

    expect(lotUpdates).toHaveLength(1)
    expect(lotUpdates[0]).toMatchObject({
      geometry_id: 'geometry-lot-1',
      m2: expect.any(Number),
    })
    expect(lotUpdates).not.toContainEqual(
      expect.objectContaining({
        servidumbre_calculation_status: 'calculated',
      })
    )
  })

  it('recalculates servitude when assigning a lot after canonical road segments already exist', async () => {
    const { supabase, lotGeometry, lotUpdates } = buildSupabaseForCanonicalRoadAssign()

    await saveAndAssignGeometry(
      {
        projectId: 'project-1',
        lotId: 'lot-2',
        geometry: lotGeometry,
        properties: { name: 'Lote 2' },
        sourceType: 'kmz',
        geometryType: 'lot',
      },
      supabase as never
    )

    expect(lotUpdates).toContainEqual(
      expect.objectContaining({
        servidumbre_widths_m: [10],
        servidumbre_ancho_label: '10',
        servidumbre_calculation_status: 'calculated',
        servidumbre_calculation_version: expect.any(String),
        servidumbre_geometry: expect.objectContaining({ type: 'Feature' }),
        servidumbre_sources: [
          expect.objectContaining({
            segment_id: 'segment-existing-10',
            width_m: 10,
            input_mode: 'footprint',
          }),
        ],
      })
    )
  })

  it('updates a canonical road segment width and recalculates project servitudes', async () => {
    const { supabase, segmentUpdates, lotUpdates } = buildSupabaseForRoadSegmentWidthUpdate()

    const result = await updateRoadSegmentWidthAndRecalculateServidumbres(
      'project-1',
      'segment-existing-10',
      5,
      supabase as never
    )

    expect(segmentUpdates).toContainEqual(
      expect.objectContaining({
        width_m: 5,
        status: 'ready',
        footprint_geometry: expect.any(Object),
      })
    )
    expect(result).toMatchObject({
      projectId: 'project-1',
      roadSegments: 1,
      lotsMatched: 1,
      lotsUpdated: 1,
      lotsSkipped: 0,
    })
    expect(lotUpdates).toContainEqual(
      expect.objectContaining({
        servidumbre_widths_m: [5],
        servidumbre_ancho_label: '5',
        servidumbre_calculation_status: 'calculated',
        servidumbre_sources: [
          expect.objectContaining({
            segment_id: 'segment-existing-10',
            width_m: 5,
            input_mode: 'centerline',
          }),
        ],
      })
    )
  })

  it('does not recalculate a project without canonical road segments', async () => {
    const { supabase, lotUpdates } = buildSupabaseForProjectWithoutRoadSegmentsRecalculate()

    const result = await recalculateProjectServidumbres('project-1', supabase as never)

    expect(result).toMatchObject({
      projectId: 'project-1',
      roadSegments: 0,
      lotsMatched: 0,
      lotsUpdated: 0,
      lotsSkipped: 0,
    })
    expect(lotUpdates).toHaveLength(0)
  })
})
