// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LotVerificationPanel } from '@/components/projects/LotVerificationPanel'
import { saveOfficialOverride } from '@/actions/lot-verification.action'
import type { LotDetails } from '@/types/viewer.types'

vi.mock('@/actions/lot-verification.action', () => ({
  saveOfficialOverride: vi.fn(),
  saveAndVerifyLot: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

const PROJECT_ID = 'project-1'
const SEGMENT_6_ID = '33333333-3333-4333-8333-333333333333'
const SEGMENT_5_ID = '11111111-1111-4111-8111-111111111111'
const SEGMENT_10_ID = '22222222-2222-4222-8222-222222222222'

function buildLot(overrides: Partial<LotDetails> = {}): LotDetails {
  return {
    id: 'lot-1',
    project_id: PROJECT_ID,
    numero_lote: '1',
    estado: 'disponible',
    vendedor_id: null,
    observaciones: null,
    precio: null,
    valor_reserva: null,
    m2: 5_000,
    servidumbre_m2: 300,
    servidumbre_ancho_m: 6,
    servidumbre_widths_m: [6],
    servidumbre_ancho_label: '6',
    servidumbre_geometry: null,
    servidumbre_sources: [{ segment_id: SEGMENT_6_ID, width_m: 6, input_mode: 'centerline' }],
    servidumbre_calculation_status: 'calculated',
    servidumbre_calculated_at: '2026-07-03T00:00:00.000Z',
    servidumbre_calculation_version: 'sdd14.v1',
    superficie_neta_m2: 4_700,
    area_official_m2: 5_000,
    perimeter_official_m: 300,
    boundaries_official: null,
    verified_status: 'draft',
    verified_at: null,
    verified_by: null,
    etapa_proceso: null,
    ...overrides,
  }
}

describe('LotVerificationPanel servitude width autosave', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('autosaves a single edited servitude width and refreshes the lot details', async () => {
    vi.useFakeTimers()
    const onLotUpdated = vi.fn()
    vi.mocked(saveOfficialOverride).mockResolvedValue({
      success: true,
      message: 'Ancho actualizado y servidumbres recalculadas correctamente',
    })

    render(
      <LotVerificationPanel
        projectId={PROJECT_ID}
        lotDetails={buildLot()}
        legalMetrics={null}
        onLotUpdated={onLotUpdated}
      />
    )

    fireEvent.change(screen.getByDisplayValue('6'), { target: { value: '5' } })

    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveOfficialOverride).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      lotId: 'lot-1',
      servidumbre_ancho_m: 5,
    })
    expect(onLotUpdated).toHaveBeenCalledTimes(1)
  })

  it('renders multiple servitude widths by segment and autosaves only the edited segment', async () => {
    vi.useFakeTimers()
    const onLotUpdated = vi.fn()
    vi.mocked(saveOfficialOverride).mockResolvedValue({
      success: true,
      message: 'Ancho actualizado y servidumbres recalculadas correctamente',
    })

    render(
      <LotVerificationPanel
        projectId={PROJECT_ID}
        lotDetails={buildLot({
          id: 'lot-5-10',
          servidumbre_m2: 708,
          servidumbre_ancho_m: 5,
          servidumbre_widths_m: [5, 10],
          servidumbre_ancho_label: '5 y 10',
          servidumbre_sources: [
            { segment_id: SEGMENT_5_ID, width_m: 5, input_mode: 'footprint', name: 'Camino 5 m' },
            {
              segment_id: SEGMENT_10_ID,
              width_m: 10,
              input_mode: 'footprint',
              name: 'Camino 10 m',
            },
          ],
        })}
        legalMetrics={null}
        onLotUpdated={onLotUpdated}
      />
    )

    const multipleWidthInput = screen.getByDisplayValue('5 y 10') as HTMLInputElement
    expect(multipleWidthInput.readOnly).toBe(true)
    expect(multipleWidthInput.disabled).toBe(true)
    expect(screen.getByText('Tramos de servidumbre')).toBeTruthy()
    expect(screen.getByText('Camino 5 m')).toBeTruthy()
    expect(screen.getByText('Camino 10 m')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Ancho servidumbre tramo 2'), {
      target: { value: '9.5' },
    })

    await act(async () => {
      vi.advanceTimersByTime(700)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveOfficialOverride).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      lotId: 'lot-5-10',
      servidumbre_ancho_m: 9.5,
      servidumbre_road_segment_id: SEGMENT_10_ID,
    })
    expect(onLotUpdated).toHaveBeenCalledTimes(1)
  })

  it('keeps a single width read-only when it has no canonical road segment source', async () => {
    vi.useFakeTimers()

    render(
      <LotVerificationPanel
        projectId={PROJECT_ID}
        lotDetails={buildLot({
          servidumbre_sources: null,
        })}
        legalMetrics={null}
      />
    )

    const singleWidthInput = screen.getByDisplayValue('6') as HTMLInputElement
    expect(singleWidthInput.readOnly).toBe(true)
    expect(singleWidthInput.disabled).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })

    expect(saveOfficialOverride).not.toHaveBeenCalled()
  })

  it('keeps a stale non-canonical width source read-only', async () => {
    vi.useFakeTimers()

    render(
      <LotVerificationPanel
        projectId={PROJECT_ID}
        lotDetails={buildLot({
          servidumbre_sources: [
            {
              segment_id: 'legacy-road',
              width_m: 5,
              input_mode: 'centerline',
              name: 'Camino anterior',
            },
          ],
          servidumbre_ancho_m: 5,
          servidumbre_widths_m: [5],
          servidumbre_ancho_label: '5',
        })}
        legalMetrics={null}
      />
    )

    const staleWidthInput = screen.getByDisplayValue('5') as HTMLInputElement
    expect(staleWidthInput.readOnly).toBe(true)
    expect(staleWidthInput.disabled).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })

    expect(saveOfficialOverride).not.toHaveBeenCalled()
  })
})
