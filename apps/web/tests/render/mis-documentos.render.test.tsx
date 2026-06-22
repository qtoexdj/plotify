// @vitest-environment jsdom
/**
 * SDD 011 T022 — render de "Mis documentos del vendedor": monta la página real
 * con entregas mockeadas y valida descarga, enlace vencido y renovación.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import MisDocumentosPage from '@/app/(dashboard)/mis-documentos/page'
import type { EscrituraDeliveryView } from '@/lib/documents/matriz-types'

function entrega(overrides: Partial<EscrituraDeliveryView> = {}): EscrituraDeliveryView {
  return {
    id: 'delivery-1',
    escritura_case_id: 'case-1',
    generation_id: 'generation-1',
    recipient_user_id: 'vendor-1',
    channel: 'web',
    status: 'sent',
    link_expires_at: '2026-06-23T00:00:00Z',
    sent_at: '2026-06-16T00:00:00Z',
    created_at: '2026-06-16T00:00:00Z',
    download_url: 'https://signed.example/minuta.docx',
    status_label: 'Entregada',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MisDocumentosPage (render)', () => {
  it('muestra solo las entregas recibidas y ofrece descargar o renovar segun estado', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/escritura-deliveries/mine') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              deliveries: [
                entrega({ id: 'delivery-sent' }),
                entrega({
                  id: 'delivery-expired',
                  status: 'expired',
                  download_url: null,
                  status_label: 'Aceptada',
                }),
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      }

      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MisDocumentosPage />)

    expect(screen.getByText('Cargando…')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('Entregada')).toBeTruthy()
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/escritura-deliveries/mine', {
      cache: 'no-store',
    })
    expect(screen.getByRole('link', { name: 'Descargar' }).getAttribute('href')).toBe(
      'https://signed.example/minuta.docx'
    )
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeTruthy()
    expect(screen.getByText('El enlace venció. Renuévalo para descargar.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Renovar enlace' })).toBeTruthy()
    expect(screen.queryByText(/recipient_user_id/)).toBeNull()
  })

  it('renueva una entrega vencida y reemplaza la tarjeta con la URL nueva', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/escritura-deliveries/mine') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              deliveries: [
                entrega({
                  id: 'delivery-expired',
                  status: 'expired',
                  download_url: null,
                  status_label: 'Aceptada',
                }),
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      }
      if (url === '/api/escritura-deliveries/delivery-expired/renew') {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              entrega({
                id: 'delivery-expired',
                status: 'sent',
                download_url: 'https://signed.example/renovada.docx',
                status_label: 'Entregada',
              })
            ),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      }

      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MisDocumentosPage />)

    const renovar = await screen.findByRole('button', { name: 'Renovar enlace' })
    fireEvent.click(renovar)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Descargar' }).getAttribute('href')).toBe(
        'https://signed.example/renovada.docx'
      )
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/escritura-deliveries/delivery-expired/renew', {
      method: 'POST',
    })
  })
})
