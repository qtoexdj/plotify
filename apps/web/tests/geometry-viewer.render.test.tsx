// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeometryViewer } from '@/components/projects/geometry-viewer'
import { BulkActionsPanel } from '@/components/projects/viewer/BulkActionsPanel'
import type { ViewerFeature, ViewerFeatureCollection } from '@/types/viewer.types'

vi.mock('@hugeicons/react', () => ({
  HugeiconsIcon: ({ className }: { className?: string }) => (
    <span aria-hidden="true" className={className} />
  ),
}))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
    }

    return {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    }
  },
}))

vi.mock('@/components/projects/geometry-viewer/MapPanel', () => ({
  MapPanel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-panel">{children}</div>
  ),
}))

vi.mock('@/components/projects/geometry-viewer/MapLotLayers', () => ({
  MapLotLayers: ({
    onFeatureClick,
  }: {
    onFeatureClick: (featureId: string, isMultiSelect: boolean) => void
  }) => (
    <div>
      <button type="button" onClick={() => onFeatureClick('geo-1', false)}>
        Seleccionar lote 1
      </button>
      <button
        type="button"
        onClick={() => {
          onFeatureClick('geo-1', true)
          onFeatureClick('geo-2', true)
        }}
      >
        Seleccionar dos lotes
      </button>
    </div>
  ),
}))

vi.mock('@/components/projects/geometry-viewer/MapExportButton', () => ({
  MapExportButton: () => <button type="button">Exportar plano como PDF</button>,
}))

vi.mock('@/components/projects/geometry-viewer/LotHoverCard', () => ({
  LotHoverCard: () => null,
}))

vi.mock('@/components/projects/geometry-viewer/ItemDetailPanel', () => ({
  ItemDetailPanel: () => <div>Detalle del lote seleccionado</div>,
}))

const lotFeature = (geometryId: string, lotId: string, lotNumber: string): ViewerFeature => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-70, -33],
        [-70, -33.001],
        [-70.001, -33.001],
        [-70.001, -33],
        [-70, -33],
      ],
    ],
  },
  properties: {
    geometry_id: geometryId,
    lot_id: lotId,
    geometry_type: 'lot',
    source_type: 'kmz',
    numero_lote: lotNumber,
    estado: 'disponible',
    m2: 500,
    precio: 25000000,
  },
})

const featureCollection: ViewerFeatureCollection = {
  type: 'FeatureCollection',
  features: [lotFeature('geo-1', 'lot-1', '1'), lotFeature('geo-2', 'lot-2', '2')],
}

describe('GeometryViewer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/viewer/project-1/feature-collection')) {
          return new Response(JSON.stringify(featureCollection), { status: 200 })
        }

        return new Response(
          JSON.stringify({
            lot: {
              id: 'lot-1',
              project_id: 'project-1',
              numero_lote: '1',
              estado: 'disponible',
              vendedor_id: null,
              observaciones: null,
              precio: 25000000,
              valor_reserva: null,
              m2: 500,
              servidumbre_m2: null,
              servidumbre_ancho_m: null,
              superficie_neta_m2: null,
              area_official_m2: null,
              perimeter_official_m: null,
              boundaries_official: null,
              verified_status: 'pending',
              verified_at: null,
              verified_by: null,
            },
          }),
          { status: 200 }
        )
      })
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('starts with the desktop details panel collapsed and expands after selecting a lot', async () => {
    render(<GeometryViewer projectId="project-1" projectName="Teno" isAdmin />)

    expect(
      (await screen.findByRole('button', { name: 'Expandir panel de detalles' })).getAttribute(
        'aria-expanded'
      )
    ).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar lote 1' }))

    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: 'Colapsar panel de detalles' })
          .getAttribute('aria-expanded')
      ).toBe('true')
    })
  })

  it('returns the desktop panel to collapsed state when bulk selection is cleared', async () => {
    render(<GeometryViewer projectId="project-1" projectName="Teno" isAdmin />)

    await screen.findByRole('button', { name: 'Expandir panel de detalles' })
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar dos lotes' }))

    await screen.findByText('Selección Múltiple')
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar selección múltiple' }))

    expect(
      screen
        .getByRole('button', { name: 'Expandir panel de detalles' })
        .getAttribute('aria-expanded')
    ).toBe('false')
  })
})

describe('BulkActionsPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('asks for confirmation before applying bulk state updates', async () => {
    const onUpdateState = vi.fn().mockResolvedValue(undefined)

    render(
      <BulkActionsPanel
        selectedIds={['geo-1', 'geo-2']}
        allFeatures={featureCollection.features}
        onUpdateState={onUpdateState}
        onUpdatePrice={vi.fn()}
        onClearSelection={vi.fn()}
        onRemoveFromSelection={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Nuevo estado masivo' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Reservado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar estado masivo' }))

    expect(onUpdateState).not.toHaveBeenCalled()
    expect((await screen.findByRole('alertdialog')).textContent).toContain(
      'Se cambiará el estado de 2 lotes a "reservado".'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => {
      expect(onUpdateState).toHaveBeenCalledWith(['geo-1', 'geo-2'], 'reservado')
    })
  })
})
