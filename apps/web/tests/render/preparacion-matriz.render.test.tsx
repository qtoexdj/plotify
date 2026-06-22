// @vitest-environment jsdom
/**
 * SDD 011 (B) — render de la preparación de la matriz: los pendientes se
 * agrupan por sección humana y cada uno ofrece la acción según su productor
 * (ingresar dato vs aprobar revisados). Sin jerga ni códigos.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { PreparacionMatriz } from '@/components/documents/mesa/preparacion-matriz'
import type { ApprovalBlocker } from '@/lib/documents/matriz-types'

afterEach(cleanup)

const BLOCKERS: ApprovalBlocker[] = [
  {
    kind: 'token_missing',
    key: 'sag.plano_cbr_numero',
    producer: 'manual',
    fix_url: '/projects/p1?tab=legal',
    title: 'Falta N° plano CBR',
    description: 'Dato del Conservador de Bienes Raíces.',
    action_label: 'Revisar variables legales',
    action_href: '/projects/p1?tab=legal&variable=sag.plano_cbr_numero',
  },
  {
    kind: 'token_missing',
    key: 'sag.certificado_numero',
    producer: 'extracted',
    fix_url: '/projects/p1?tab=legal',
    title: 'Dato por revisar: N° certificado SAG',
    description: 'Extraído del certificado SAG.',
    action_label: 'Revisar variables legales',
    action_href: '/projects/p1?tab=legal&variable=sag.certificado_numero',
  },
  {
    kind: 'token_missing',
    key: 'mandato.rectificacion_nombre',
    producer: 'authored',
    fix_url: '/projects/p1?tab=legal',
    title: 'Falta mandatario',
    description: 'Persona facultada para rectificar la escritura.',
    action_label: 'Revisar variables legales',
    action_href: '/projects/p1?tab=legal&variable=mandato.rectificacion_nombre',
  },
]

describe('PreparacionMatriz (render)', () => {
  it('agrupa por sección y ofrece la acción correcta por productor', () => {
    render(<PreparacionMatriz projectId="p1" blockers={BLOCKERS} onResolved={() => {}} />)

    expect(screen.getByTestId('preparacion-matriz')).toBeTruthy()
    // Resumen humano del avance.
    expect(screen.getByText(/Faltan 3 datos para aprobar la matriz/)).toBeTruthy()
    // Secciones humanas (no claves ni grupos crudos).
    expect(screen.getByText('SAG y plano')).toBeTruthy()
    expect(screen.getByText('Personería y representación')).toBeTruthy()
    // Captura manual: una por la variable manual y otra por la de autoría.
    expect(screen.getAllByText('Ingresar dato').length).toBe(2)
    // Aprobación por lote de lo extraído (1 en la sección SAG).
    expect(screen.getByText(/Aprobar revisados \(1\)/)).toBeTruthy()
    // Jamás expone la clave técnica.
    expect(screen.queryByText(/sag\.plano_cbr_numero/)).toBeNull()
  })

  it('no muestra nada cuando no hay pendientes', () => {
    const { container } = render(
      <PreparacionMatriz projectId="p1" blockers={[]} onResolved={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })
})
