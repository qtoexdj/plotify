import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}))

vi.mock('@/lib/services/onboarding.service', () => ({
  updateRoadSegmentWidthAndRecalculateServidumbres: vi.fn(),
}))

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateRoadSegmentWidthAndRecalculateServidumbres } from '@/lib/services/onboarding.service'
import { saveOfficialOverride } from '@/actions/lot-verification.action'

const PROJECT_ID = 'aad0fbf2-ceda-47bc-954a-b3f5f2ac8797'
const LOT_ID = '7076e83b-b695-467b-aed8-16698e62935f'
const ROAD_SEGMENT_6_ID = '33333333-3333-4333-8333-333333333333'
const ROAD_SEGMENT_5_ID = '11111111-1111-4111-8111-111111111111'
const ROAD_SEGMENT_10_ID = '22222222-2222-4222-8222-222222222222'

function buildSupabaseMock(
  currentLotOverrides: Partial<{
    servidumbre_ancho_m: number | null
    servidumbre_sources: unknown
  }> = {}
) {
  const lotUpdate = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: null })),
  }))
  const auditInsert = vi.fn(async () => ({ error: null }))

  const lotsSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: {
          area_official_m2: null,
          perimeter_official_m: null,
          boundaries_official: null,
          verified_status: 'draft',
          servidumbre_m2: 319.69,
          servidumbre_ancho_m: 6,
          servidumbre_sources: [
            { segment_id: ROAD_SEGMENT_6_ID, width_m: 6, input_mode: 'centerline' },
          ],
          ...currentLotOverrides,
        },
        error: null,
      })),
    })),
  }))

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    rpc: vi.fn((name: string) =>
      Promise.resolve({
        data: name === 'is_project_admin',
        error: null,
      })
    ),
    from: vi.fn((table: string) => {
      if (table === 'lots') {
        return {
          select: lotsSelect,
          update: lotUpdate,
        }
      }

      if (table === 'audit_logs') {
        return { insert: auditInsert }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, lotUpdate, auditInsert }
}

describe('lot verification width recalculation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateRoadSegmentWidthAndRecalculateServidumbres).mockResolvedValue({
      projectId: PROJECT_ID,
      roadSegments: 1,
      lotsMatched: 53,
      lotsUpdated: 53,
      lotsSkipped: 0,
    })
  })

  it('updates the canonical road segment width and recalculates project servitudes', async () => {
    const { supabase, lotUpdate } = buildSupabaseMock()
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await saveOfficialOverride({
      projectId: PROJECT_ID,
      lotId: LOT_ID,
      servidumbre_ancho_m: 5,
    })

    expect(result).toEqual({
      success: true,
      message: 'Ancho actualizado y servidumbres recalculadas correctamente',
    })
    expect(lotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        updated_at: expect.any(String),
      })
    )
    expect(updateRoadSegmentWidthAndRecalculateServidumbres).toHaveBeenCalledWith(
      PROJECT_ID,
      ROAD_SEGMENT_6_ID,
      5,
      supabase
    )
    expect(revalidatePath).toHaveBeenCalledWith(`/proyectos/${PROJECT_ID}`)
  })

  it('updates the requested road segment when multiple widths affect the lot', async () => {
    const { supabase } = buildSupabaseMock({
      servidumbre_ancho_m: 5,
      servidumbre_sources: [
        { segment_id: ROAD_SEGMENT_5_ID, width_m: 5, input_mode: 'footprint' },
        { segment_id: ROAD_SEGMENT_10_ID, width_m: 10, input_mode: 'footprint' },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const result = await saveOfficialOverride({
      projectId: PROJECT_ID,
      lotId: LOT_ID,
      servidumbre_ancho_m: 9.5,
      servidumbre_road_segment_id: ROAD_SEGMENT_10_ID,
    })

    expect(result).toEqual({
      success: true,
      message: 'Ancho actualizado y servidumbres recalculadas correctamente',
    })
    expect(updateRoadSegmentWidthAndRecalculateServidumbres).toHaveBeenCalledWith(
      PROJECT_ID,
      ROAD_SEGMENT_10_ID,
      9.5,
      supabase
    )
  })

  it('guarda el ancho como valor oficial cuando el lote no tiene ninguna fuente de servidumbre', async () => {
    const { supabase, lotUpdate } = buildSupabaseMock()
    vi.mocked(createClient).mockResolvedValue({
      ...supabase,
      from: vi.fn((table: string) => {
        if (table === 'lots') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    area_official_m2: null,
                    perimeter_official_m: null,
                    boundaries_official: null,
                    verified_status: 'draft',
                    servidumbre_m2: 319.69,
                    servidumbre_ancho_m: 6,
                    servidumbre_sources: null,
                  },
                  error: null,
                })),
              })),
            })),
            update: lotUpdate,
          }
        }

        return supabase.from(table)
      }),
    } as never)

    const result = await saveOfficialOverride({
      projectId: PROJECT_ID,
      lotId: LOT_ID,
      servidumbre_ancho_m: 5,
    })

    // Sin fuente no hay geometría que recalcular: el ancho es el del plano
    // oficial y se persiste tal cual, incluida la etiqueta que lee la minuta.
    expect(result.success).toBe(true)
    expect(lotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ servidumbre_ancho_m: 5, servidumbre_ancho_label: '5 m' })
    )
    expect(updateRoadSegmentWidthAndRecalculateServidumbres).not.toHaveBeenCalled()
  })
})
