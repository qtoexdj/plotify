// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectCard } from '@/components/projects/ProjectCard'
import type { ProjectWithMetrics } from '@/types/database.types'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}))

const project: ProjectWithMetrics = {
  id: 'project-1',
  name: 'Teno',
  region: 'Maule',
  comuna: 'Teno',
  descripcion: 'Proyecto piloto de loteo',
  total_lotes: 53,
  estado: 'draft',
  owner_id: 'user-1',
  organization_id: 'org-1',
  road_geometry: null,
  road_width_m: 10,
  images: null,
  doc_dominio_vigente: null,
  doc_hipoteca_gravamen: null,
  doc_roles: null,
  doc_subdivision: null,
  doc_plano_oficial: null,
  doc_otros: null,
  created_at: '2026-06-05T00:00:00.000Z',
  updated_at: '2026-06-05T00:00:00.000Z',
  lotes_libres: 53,
  lotes_reservados: 0,
  lotes_vendidos: 0,
  vendedores: [{ id: 'vendor-1', nombre: 'Diego Perez', avatar_url: null }],
}

describe('ProjectCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('exposes the whole card as an accessible project link', () => {
    render(
      <ProjectCard
        project={project}
        isAdmin={false}
        deletingId={null}
        onDelete={vi.fn()}
        projectHref="/projects/project-1"
        getFullUrl={() => ''}
        statusLabel="Borrador"
        statusVariant="neutral"
        layout="grid"
      />
    )

    const link = screen.getByRole('link', { name: 'Abrir proyecto Teno' })
    expect(link.getAttribute('href')).toBe('/projects/project-1')
  })

  it('keeps delete as a separate confirmed admin action', async () => {
    const onDelete = vi.fn()

    render(
      <ProjectCard
        project={project}
        isAdmin
        deletingId={null}
        onDelete={onDelete}
        projectHref="/projects/project-1"
        getFullUrl={() => ''}
        statusLabel="Borrador"
        statusVariant="neutral"
        layout="grid"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar proyecto Teno' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(onDelete).toHaveBeenCalledWith('project-1')
  })
})
