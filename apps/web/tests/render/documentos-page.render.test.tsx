// @vitest-environment jsdom
/**
 * SDD 011 T022 — render de Documentos por proyecto: monta la página real con
 * proyectos mockeados y valida los accesos humanos a matriz y variables.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import DocumentosPage from '@/app/(dashboard)/documentos/page'
import type { ProjectWithMetrics } from '@/types/database.types'

function project(overrides: Partial<ProjectWithMetrics> = {}): ProjectWithMetrics {
  return {
    id: 'project-1',
    organization_id: 'org-1',
    name: 'Teno - El Condor',
    region: 'Maule',
    comuna: 'Teno',
    descripcion: null,
    total_lotes: 24,
    doc_dominio_vigente: null,
    doc_hipoteca_gravamen: null,
    doc_roles: null,
    doc_subdivision: null,
    doc_plano_oficial: null,
    doc_otros: null,
    created_at: '2026-06-16T00:00:00Z',
    updated_at: '2026-06-16T00:00:00Z',
    estado: 'activo',
    precio: null,
    valor_reserva: null,
    road_width_m: null,
    road_geometry: null,
    lotes_libres: 20,
    lotes_reservados: 1,
    lotes_vendidos: 3,
    vendedores: [],
    ...overrides,
  } as ProjectWithMetrics
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DocumentosPage (render)', () => {
  it('carga proyectos y muestra accesos por proyecto a matriz y variables legales', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ projects: [project()] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<DocumentosPage />)

    expect(screen.getByText('Cargando proyectos...')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Teno - El Condor' })).toBeTruthy()
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/projects')
    expect(screen.getByText('Teno, Maule')).toBeTruthy()
    expect(screen.getByText('24 lotes')).toBeTruthy()
    expect(screen.getByText('3 vendidos')).toBeTruthy()
    expect(screen.getByText('1 reservados')).toBeTruthy()

    const matriz = screen.getByRole('link', { name: 'Abrir matriz' })
    expect(matriz.getAttribute('href')).toBe('/documentos/matriz/proyecto/project-1')

    const variables = screen.getByRole('link', { name: 'Abrir variables' })
    expect(variables.getAttribute('href')).toBe('/projects/project-1?tab=legal#variables-legales')

    expect(screen.getByText('Matriz de escritura del proyecto')).toBeTruthy()
    expect(screen.getByText('Matriz de variables del proyecto')).toBeTruthy()
    expect(screen.queryByText(/variable_resolutions/)).toBeNull()
  })

  it('muestra un estado vacío humano cuando no hay proyectos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    render(<DocumentosPage />)

    await waitFor(() => {
      expect(screen.getByText('No hay proyectos')).toBeTruthy()
    })
    expect(screen.getByRole('link', { name: 'Ir a Proyectos' }).getAttribute('href')).toBe(
      '/projects'
    )
  })
})
