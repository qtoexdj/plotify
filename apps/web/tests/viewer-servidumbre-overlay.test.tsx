// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MapLotLayers } from '@/components/projects/geometry-viewer/MapLotLayers'
import { LotInfoView } from '@/components/projects/viewer/LotInfoView'
import { recalculateProjectServidumbres } from '@/lib/services/onboarding.service'
import { getFeatureCollection } from '@/lib/services/viewer.service'
import type { ViewerFeatureCollection } from '@/types/viewer.types'
import type { LotDetails } from '@/types/viewer.types'
import { rectanglePolygon } from './lib/geometry/servidumbre-fixtures'

const mapHarness = vi.hoisted(() => ({
  currentMap: null as ReturnType<typeof createMapMock> | null,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { promise: vi.fn() },
}))

vi.mock('@/actions/lot-process.action', () => ({
  updateLotStage: vi.fn(),
}))

vi.mock('@/components/projects/LotVerificationPanel', () => ({
  LotVerificationPanel: () => <div data-testid="lot-verification-panel" />,
}))

vi.mock('@/components/projects/StageStepper', () => ({
  StageStepper: () => <div data-testid="stage-stepper" />,
}))

vi.mock('@/components/ui/map', () => ({
  useMap: () => ({ map: mapHarness.currentMap, isLoaded: Boolean(mapHarness.currentMap) }),
}))

vi.mock('@/lib/services/onboarding.service', () => ({
  recalculateProjectServidumbres: vi.fn(),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mapHarness.currentMap = null
})

function createMapMock() {
  const layerIds = new Set<string>()
  const canvas = { style: { cursor: '' } }
  const handlers = new Map<string, (event: unknown) => void>()

  return {
    addLayer: vi.fn((layer: { id: string }) => {
      layerIds.add(layer.id)
    }),
    addSource: vi.fn(),
    getSource: vi.fn(() => undefined),
    getLayer: vi.fn((id: string) => (layerIds.has(id) ? { id } : undefined)),
    removeSource: vi.fn(),
    removeLayer: vi.fn((id: string) => {
      layerIds.delete(id)
    }),
    on: vi.fn((eventName: string, layerId: string, handler: (event: unknown) => void) => {
      handlers.set(`${eventName}:${layerId}`, handler)
    }),
    off: vi.fn((eventName: string, layerId: string) => {
      handlers.delete(`${eventName}:${layerId}`)
    }),
    triggerLayerEvent: (eventName: string, layerId: string, event: unknown) => {
      handlers.get(`${eventName}:${layerId}`)?.(event)
    },
    getCanvas: vi.fn(() => canvas),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
  }
}

function lotDetailsWithMultipleWidths(): LotDetails {
  return {
    id: 'lot-5-10',
    project_id: 'project-1',
    numero_lote: '5',
    estado: 'disponible',
    vendedor_id: null,
    observaciones: null,
    precio: null,
    valor_reserva: null,
    m2: 10_000,
    servidumbre_m2: 1_450,
    servidumbre_ancho_m: 5,
    servidumbre_ancho_label: '5 y 10',
    servidumbre_widths_m: [5, 10],
    servidumbre_geometry: null,
    servidumbre_sources: null,
    servidumbre_calculation_status: 'calculated',
    servidumbre_calculated_at: '2026-07-03T00:00:00.000Z',
    servidumbre_calculation_version: 'sdd14.v1',
    superficie_neta_m2: 8_550,
    area_official_m2: 10_000,
    perimeter_official_m: null,
    boundaries_official: null,
    verified_status: 'draft',
    verified_at: null,
    verified_by: null,
    etapa_proceso: null,
  }
}

function createViewerSupabaseMock() {
  const lotGeometry = rectanglePolygon(0, 0, 100, 100)
  const roadGeometry = rectanglePolygon(40, 0, 20, 100)
  const servidumbreGeometry = rectanglePolygon(45, 0, 10, 100)
  let geometriesCall = 0

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'geometries') {
          geometriesCall += 1

          if (geometriesCall === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  not: vi.fn(async () => ({
                    data: [
                      {
                        id: 'geom-lot-1',
                        project_id: 'project-1',
                        lot_id: 'lot-1',
                        geometry_type: 'lot',
                        source_type: 'kmz',
                        name: 'Lote 1',
                        geometry: lotGeometry,
                        lots: {
                          id: 'lot-1',
                          numero_lote: '1',
                          estado: 'disponible',
                          observaciones: null,
                          vendedor_id: null,
                          precio: null,
                          valor_reserva: null,
                          m2: 10_000,
                          servidumbre_m2: 1_000,
                          servidumbre_ancho_m: 5,
                          servidumbre_widths_m: [5, 10],
                          servidumbre_ancho_label: '5 y 10',
                          servidumbre_geometry: servidumbreGeometry,
                          servidumbre_sources: [
                            {
                              road_segment_id: 'road-5',
                              width_m: 5,
                            },
                            {
                              road_segment_id: 'road-10',
                              width_m: 10,
                            },
                          ],
                          servidumbre_calculation_status: 'calculated',
                          superficie_neta_m2: 9_000,
                          area_official_m2: 10_000,
                          perimeter_official_m: null,
                          boundaries_official: null,
                          verified_status: 'draft',
                          verified_at: null,
                          verified_by: null,
                        },
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            }
          }

          const canonicalInfraQuery = {
            select: vi.fn(() => canonicalInfraQuery),
            eq: vi.fn(() => canonicalInfraQuery),
            is: vi.fn(() => canonicalInfraQuery),
            in: vi.fn(() => canonicalInfraQuery),
            then: vi.fn((resolve) =>
              resolve({
                data: [
                  {
                    id: 'geom-road-1',
                    project_id: 'project-1',
                    lot_id: null,
                    geometry_type: 'road',
                    source_type: 'kmz',
                    name: 'Camino canónico',
                    geometry: roadGeometry,
                    is_assigned: true,
                  },
                ],
                error: null,
              })
            ),
          }

          return canonicalInfraQuery
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    },
    lotGeometry,
    roadGeometry,
    servidumbreGeometry,
  }
}

function createViewerSupabaseMockWithMissingSdd14Columns() {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'geometries') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(async () => ({
                  data: null,
                  error: {
                    code: '42703',
                    details: null,
                    hint: null,
                    message: 'column lots_1.servidumbre_widths_m does not exist',
                  },
                })),
              })),
            })),
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    },
  }
}

function createViewerSupabaseMockWithServitudeBackfill() {
  const lotGeometry = rectanglePolygon(0, 0, 100, 100)
  const servidumbreGeometry = rectanglePolygon(45, 0, 10, 100)
  let geometriesCall = 0

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'geometries') {
          geometriesCall += 1

          if (geometriesCall === 1) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  not: vi.fn(async () => ({
                    data: [
                      {
                        id: 'geom-lot-needs-backfill',
                        project_id: 'project-1',
                        lot_id: 'lot-needs-backfill',
                        geometry_type: 'lot',
                        source_type: 'kmz',
                        name: 'Lote 24',
                        geometry: lotGeometry,
                        lots: {
                          id: 'lot-needs-backfill',
                          numero_lote: '24',
                          estado: 'disponible',
                          observaciones: null,
                          vendedor_id: null,
                          precio: null,
                          valor_reserva: null,
                          m2: 5_062,
                          servidumbre_m2: null,
                          servidumbre_ancho_m: null,
                          servidumbre_widths_m: null,
                          servidumbre_ancho_label: null,
                          servidumbre_geometry: null,
                          servidumbre_sources: null,
                          servidumbre_calculation_status: 'not_calculated',
                          superficie_neta_m2: null,
                          area_official_m2: null,
                          perimeter_official_m: null,
                          boundaries_official: null,
                          verified_status: 'draft',
                          verified_at: null,
                          verified_by: null,
                        },
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            }
          }

          if (geometriesCall === 2) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  not: vi.fn(async () => ({
                    data: [
                      {
                        id: 'geom-lot-needs-backfill',
                        project_id: 'project-1',
                        lot_id: 'lot-needs-backfill',
                        geometry_type: 'lot',
                        source_type: 'kmz',
                        name: 'Lote 24',
                        geometry: lotGeometry,
                        lots: {
                          id: 'lot-needs-backfill',
                          numero_lote: '24',
                          estado: 'disponible',
                          observaciones: null,
                          vendedor_id: null,
                          precio: null,
                          valor_reserva: null,
                          m2: 5_062,
                          servidumbre_m2: 319.69,
                          servidumbre_ancho_m: 6,
                          servidumbre_widths_m: [6],
                          servidumbre_ancho_label: '6',
                          servidumbre_geometry: servidumbreGeometry,
                          servidumbre_sources: [
                            { segment_id: 'segment-road-6', width_m: 6, input_mode: 'centerline' },
                          ],
                          servidumbre_calculation_status: 'calculated',
                          superficie_neta_m2: 4_742.31,
                          area_official_m2: null,
                          perimeter_official_m: null,
                          boundaries_official: null,
                          verified_status: 'draft',
                          verified_at: null,
                          verified_by: null,
                        },
                      },
                    ],
                    error: null,
                  })),
                })),
              })),
            }
          }

          const emptyCommonAreasQuery = {
            select: vi.fn(() => emptyCommonAreasQuery),
            eq: vi.fn(() => emptyCommonAreasQuery),
            is: vi.fn(() => emptyCommonAreasQuery),
            in: vi.fn(() => emptyCommonAreasQuery),
            then: vi.fn((resolve) => resolve({ data: [], error: null })),
          }

          return emptyCommonAreasQuery
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    },
    lotGeometry,
    servidumbreGeometry,
  }
}

describe('viewer servidumbre overlay', () => {
  it('shows multiple servitude widths in the lot info panel', () => {
    render(
      <LotInfoView
        projectId="project-1"
        lotDetails={lotDetailsWithMultipleWidths()}
        onEditClick={vi.fn()}
        onOpenReservation={vi.fn()}
      />
    )

    expect(screen.getByText('Servidumbre:')).toBeTruthy()
    expect(screen.getByText('-1.450 m²')).toBeTruthy()
    expect(screen.getByText('5 y 10 m')).toBeTruthy()
    expect(screen.getByText('8.550 m²')).toBeTruthy()
  })

  it('exposes persisted servitude geometry as an overlay feature collection entry', async () => {
    const { supabase, servidumbreGeometry } = createViewerSupabaseMock()

    const collection = await getFeatureCollection('project-1', supabase as never)

    expect(collection.features).toContainEqual(
      expect.objectContaining({
        type: 'Feature',
        geometry: servidumbreGeometry,
        properties: expect.objectContaining({
          geometry_id: 'servitude-lot-1',
          lot_id: 'lot-1',
          geometry_type: 'servitude',
          source_type: 'kmz',
          name: 'Servidumbre Lote 1',
          numero_lote: '1',
          estado: 'disponible',
          servidumbre_m2: 1_000,
          servidumbre_widths_m: [5, 10],
          servidumbre_ancho_label: '5 y 10',
          superficie_neta_m2: 9_000,
        }),
      })
    )
  })

  it('exposes canonical road geometries from assigned infrastructure', async () => {
    const { supabase, roadGeometry } = createViewerSupabaseMock()

    const collection = await getFeatureCollection('project-1', supabase as never)

    expect(collection.features).toContainEqual(
      expect.objectContaining({
        type: 'Feature',
        geometry: roadGeometry,
        properties: expect.objectContaining({
          geometry_id: 'geom-road-1',
          geometry_type: 'road',
          source_type: 'kmz',
          name: 'Camino canónico',
        }),
      })
    )
  })

  it('fails explicitly when SDD14 servitude columns are missing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = createViewerSupabaseMockWithMissingSdd14Columns()

    await expect(getFeatureCollection('project-1', supabase as never)).rejects.toThrow(
      'Error al obtener feature collection'
    )
    expect(errorSpy).toHaveBeenCalledWith(
      'Error fetching lot geometries:',
      expect.objectContaining({ code: '42703' })
    )
    errorSpy.mockRestore()
  })

  it('backfills pending servitudes before returning viewer features', async () => {
    const recalculateProjectServidumbresMock = vi.mocked(recalculateProjectServidumbres)
    recalculateProjectServidumbresMock.mockResolvedValueOnce({
      projectId: 'project-1',
      roadSegments: 1,
      lotsMatched: 1,
      lotsUpdated: 1,
      lotsSkipped: 0,
    })
    const { supabase, servidumbreGeometry } = createViewerSupabaseMockWithServitudeBackfill()

    const collection = await getFeatureCollection('project-1', supabase as never)

    expect(recalculateProjectServidumbresMock).toHaveBeenCalledWith('project-1', supabase)
    expect(collection.features).toContainEqual(
      expect.objectContaining({
        type: 'Feature',
        geometry: servidumbreGeometry,
        properties: expect.objectContaining({
          geometry_id: 'servitude-lot-needs-backfill',
          lot_id: 'lot-needs-backfill',
          geometry_type: 'servitude',
          numero_lote: '24',
          servidumbre_m2: 319.69,
          servidumbre_ancho_m: 6,
          servidumbre_ancho_label: '6',
          servidumbre_calculation_status: 'calculated',
          superficie_neta_m2: 4_742.31,
        }),
      })
    )
  })

  it('adds MapLibre fill and outline layers filtered to servitude overlays', () => {
    const map = createMapMock()
    mapHarness.currentMap = map
    const servitudeGeometry = rectanglePolygon(45, 0, 10, 100)
    const featureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: servitudeGeometry,
          properties: {
            geometry_id: 'servitude-lot-1',
            lot_id: 'lot-1',
            geometry_type: 'servitude',
            source_type: 'kmz',
            name: 'Servidumbre Lote 1',
            numero_lote: '1',
            estado: 'disponible',
            servidumbre_m2: 1_000,
            servidumbre_widths_m: [5, 10],
            servidumbre_ancho_label: '5 y 10',
          },
        },
      ],
    } satisfies ViewerFeatureCollection

    render(
      <MapLotLayers
        featureCollection={featureCollection}
        selectedIds={new Set()}
        hoveredFeatureId={null}
        onFeatureClick={vi.fn()}
        onFeatureHover={vi.fn()}
      />
    )

    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'fill',
        source: 'viewer-features',
        filter: ['==', ['get', 'geometry_type'], 'servitude'],
      })
    )
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'line',
        source: 'viewer-features',
        filter: ['==', ['get', 'geometry_type'], 'servitude'],
      })
    )
  })

  it('resolves servitude overlay hover and click to the owner lot feature', () => {
    const map = createMapMock()
    mapHarness.currentMap = map
    const onFeatureHover = vi.fn()
    const onFeatureClick = vi.fn()
    const featureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: rectanglePolygon(0, 0, 100, 100),
          properties: {
            geometry_id: 'geom-lot-1',
            lot_id: 'lot-1',
            geometry_type: 'lot',
            source_type: 'kmz',
            name: 'Lote 1',
            numero_lote: '1',
            estado: 'disponible',
          },
        },
        {
          type: 'Feature',
          geometry: rectanglePolygon(45, 0, 10, 100),
          properties: {
            geometry_id: 'servitude-lot-1',
            lot_id: 'lot-1',
            geometry_type: 'servitude',
            source_type: 'kmz',
            name: 'Servidumbre Lote 1',
            numero_lote: '1',
            estado: 'disponible',
          },
        },
      ],
    } satisfies ViewerFeatureCollection

    render(
      <MapLotLayers
        featureCollection={featureCollection}
        selectedIds={new Set()}
        hoveredFeatureId={null}
        onFeatureClick={onFeatureClick}
        onFeatureHover={onFeatureHover}
      />
    )

    const servitudeFeatureEvent = {
      features: [
        {
          properties: {
            geometry_id: 'servitude-lot-1',
            lot_id: 'lot-1',
            geometry_type: 'servitude',
          },
        },
      ],
      originalEvent: { shiftKey: false, ctrlKey: false, metaKey: false },
    }

    map.triggerLayerEvent('mousemove', 'servitude-fill', servitudeFeatureEvent)
    map.triggerLayerEvent('click', 'servitude-fill', servitudeFeatureEvent)

    expect(onFeatureHover).toHaveBeenCalledWith('geom-lot-1')
    expect(onFeatureClick).toHaveBeenCalledWith('geom-lot-1', false)
  })
})
