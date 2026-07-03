import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import {
  recalculateProjectServidumbres,
  saveAndAssignGeometry,
  saveInfrastructure,
} from '@/lib/services/onboarding.service'
import { POST as POSTSaveAndAssign } from '../src/app/api/onboarding/save-and-assign/route'
import { POST as POSTSaveInfrastructure } from '../src/app/api/onboarding/save-infrastructure/route'
import { POST as POSTRecalculateServidumbres } from '../src/app/api/onboarding/recalculate-servidumbres/route'

vi.mock('@/lib/services/onboarding.service', () => ({
  recalculateProjectServidumbres: vi.fn(),
  saveAndAssignGeometry: vi.fn(),
  saveInfrastructure: vi.fn(),
}))

const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
}

function buildPostRequest(payload: unknown): NextRequest {
  return new Request('http://localhost/api/onboarding/save-and-assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as NextRequest
}

describe('onboarding save routes', () => {
  const saveAndAssignGeometryMock = vi.mocked(saveAndAssignGeometry)
  const saveInfrastructureMock = vi.mocked(saveInfrastructure)
  const recalculateProjectServidumbresMock = vi.mocked(recalculateProjectServidumbres)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves and assigns parsed geometry to a lot', async () => {
    saveAndAssignGeometryMock.mockResolvedValue({ id: 'geometry-1' } as Awaited<
      ReturnType<typeof saveAndAssignGeometry>
    >)

    const payload = {
      projectId: 'project-1',
      lotId: 'lot-1',
      geometry,
      properties: { name: 'LOTE 1' },
      sourceType: 'kmz',
      geometryType: 'lot',
    }

    const response = await POSTSaveAndAssign(buildPostRequest(payload))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: 'Geometría asignada correctamente',
      geometry: { id: 'geometry-1' },
    })
    expect(saveAndAssignGeometryMock).toHaveBeenCalledWith(payload)
  })

  it('rejects save-and-assign requests without required fields', async () => {
    const response = await POSTSaveAndAssign(buildPostRequest({ projectId: 'project-1' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'projectId, lotId y geometry son requeridos',
    })
    expect(saveAndAssignGeometryMock).not.toHaveBeenCalled()
  })

  it('saves parsed infrastructure geometry', async () => {
    saveInfrastructureMock.mockResolvedValue({ id: 'geometry-road-1' } as Awaited<
      ReturnType<typeof saveInfrastructure>
    >)

    const payload = {
      projectId: 'project-1',
      geometry,
      properties: { name: 'Camino interior' },
      sourceType: 'kmz',
      geometryType: 'road',
      name: 'Camino interior',
    }

    const response = await POSTSaveInfrastructure(buildPostRequest(payload))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: 'Infraestructura guardada correctamente',
      geometry: { id: 'geometry-road-1' },
    })
    expect(saveInfrastructureMock).toHaveBeenCalledWith(payload)
  })

  it('saves road infrastructure with explicit interpretation metadata', async () => {
    saveInfrastructureMock.mockResolvedValue({ id: 'geometry-road-2' } as Awaited<
      ReturnType<typeof saveInfrastructure>
    >)

    const payload = {
      projectId: 'project-1',
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      properties: { name: 'Camino eje' },
      sourceType: 'kmz',
      geometryType: 'road',
      name: 'Camino eje',
      inputMode: 'centerline',
      widthM: 10,
    }

    const response = await POSTSaveInfrastructure(buildPostRequest(payload))

    expect(response.status).toBe(200)
    expect(saveInfrastructureMock).toHaveBeenCalledWith(payload)
  })

  it('rejects road infrastructure with unsupported input mode', async () => {
    const response = await POSTSaveInfrastructure(
      buildPostRequest({
        projectId: 'project-1',
        geometry,
        properties: { name: 'Camino raro' },
        sourceType: 'kmz',
        geometryType: 'road',
        name: 'Camino raro',
        inputMode: 'axis',
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'inputMode debe ser centerline, footprint o edge',
    })
    expect(saveInfrastructureMock).not.toHaveBeenCalled()
  })

  it('rejects explicit centerline road infrastructure without positive width', async () => {
    const response = await POSTSaveInfrastructure(
      buildPostRequest({
        projectId: 'project-1',
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        properties: { name: 'Camino sin ancho' },
        sourceType: 'kmz',
        geometryType: 'road',
        name: 'Camino sin ancho',
        inputMode: 'centerline',
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'widthM debe ser un número positivo para caminos centerline o edge',
    })
    expect(saveInfrastructureMock).not.toHaveBeenCalled()
  })

  it('recalculates persisted servitudes for an existing project', async () => {
    recalculateProjectServidumbresMock.mockResolvedValue({
      projectId: 'project-1',
      roadSegments: 1,
      lotsMatched: 24,
      lotsUpdated: 20,
      lotsSkipped: 4,
    })

    const response = await POSTRecalculateServidumbres(buildPostRequest({ projectId: 'project-1' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: 'Servidumbres recalculadas correctamente',
      result: {
        projectId: 'project-1',
        roadSegments: 1,
        lotsMatched: 24,
        lotsUpdated: 20,
        lotsSkipped: 4,
      },
    })
    expect(recalculateProjectServidumbresMock).toHaveBeenCalledWith('project-1')
  })

  it('rejects recalculate requests without project id', async () => {
    const response = await POSTRecalculateServidumbres(buildPostRequest({}))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'projectId es requerido',
    })
    expect(recalculateProjectServidumbresMock).not.toHaveBeenCalled()
  })
})
