// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'

import { DocumentsTab } from '@/components/projects/detail/documents-tab'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DocumentsTab', () => {
  it('explains document metadata and exposes preview only for securely linked files', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            documents: [
              {
                id: 'document-linked',
                fileId: 'file-1',
                document_type: 'dominio_vigente',
                source_field: 'doc_dominio_vigente',
                original_filename: 'Dominio vigente.pdf',
                version_number: 2,
                extraction_status: 'pending',
                uploaded_at: '2026-07-29T15:30:00.000Z',
              },
              {
                id: 'document-legacy',
                fileId: null,
                document_type: 'hipoteca_gravamen',
                source_field: 'doc_hipoteca_gravamen',
                original_filename: 'Hipoteca histórica.pdf',
                version_number: 1,
                extraction_status: 'pending',
                uploaded_at: '2026-07-28T15:30:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )

    render(
      <DocumentsTab
        project={{ id: 'project-1' } as ComponentProps<typeof DocumentsTab>['project']}
        isAdmin={false}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Dominio vigente.pdf')).toBeTruthy()
    })

    expect(screen.getByText('Versión 2')).toBeTruthy()
    expect(screen.getAllByText('Estado: Pendiente')).toHaveLength(2)
    expect(screen.getByText(/Subido el 29/)).toBeTruthy()
    const preview = screen.getByRole('link', {
      name: 'Vista previa de Dominio vigente.pdf (abre en una pestaña nueva)',
    })
    expect(preview.getAttribute('href')).toBe('/api/files/file-1?preview=1#view=FitH')
    expect(preview.getAttribute('target')).toBe('_blank')
    expect(screen.getByText('Vista previa no disponible')).toBeTruthy()
    expect(screen.getByText('Archivo histórico pendiente de vinculación segura.')).toBeTruthy()
    expect(screen.queryByText('Migración pendiente')).toBeNull()
    expect(screen.queryByText('Tipos')).toBeNull()
    expect(screen.queryByText('Cargados')).toBeNull()
    expect(screen.queryByText('Revisión')).toBeNull()
  })

  it('writes uploads and archives through local state without refetching the document list', async () => {
    const uploadedDocument = {
      id: 'document-new',
      fileId: 'file-new',
      document_type: 'otro',
      source_field: 'doc_otros',
      original_filename: 'Antecedente nuevo.pdf',
      version_number: 1,
      extraction_status: 'pending',
      uploaded_at: '2026-07-30T12:00:00.000Z',
    }
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (method === 'GET') {
        return Promise.resolve(
          new Response(JSON.stringify({ documents: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }
      if (method === 'POST' && url.endsWith('/files')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              fileId: uploadedDocument.fileId,
              document: uploadedDocument,
            }),
            {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      }
      if (method === 'DELETE') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              legal_document_id: uploadedDocument.id,
              extraction_status: 'superseded',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        )
      }

      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true)
    )

    render(
      <DocumentsTab
        project={{ id: 'project-1' } as ComponentProps<typeof DocumentsTab>['project']}
        isAdmin
      />
    )

    await waitFor(() => {
      expect(document.getElementById('upload-doc_otros')).toBeTruthy()
    })

    fireEvent.change(document.getElementById('upload-doc_otros') as HTMLInputElement, {
      target: {
        files: [
          new File(['%PDF-1.7'], uploadedDocument.original_filename, {
            type: 'application/pdf',
          }),
        ],
      },
    })

    expect(await screen.findByText(uploadedDocument.original_filename)).toBeTruthy()
    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method ?? 'GET'])).toEqual(
      [
        ['/api/projects/project-1/legal-documents', 'GET'],
        ['/api/projects/project-1/files', 'POST'],
      ]
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: `Archivar ${uploadedDocument.original_filename}`,
      })
    )

    await waitFor(() => {
      expect(screen.queryByText(uploadedDocument.original_filename)).toBeNull()
    })
    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method ?? 'GET'])).toEqual(
      [
        ['/api/projects/project-1/legal-documents', 'GET'],
        ['/api/projects/project-1/files', 'POST'],
        [
          `/api/projects/project-1/legal-documents?legalDocumentId=${uploadedDocument.id}`,
          'DELETE',
        ],
      ]
    )
  })
})
