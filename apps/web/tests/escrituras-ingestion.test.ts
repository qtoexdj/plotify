/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createRouteHandlerClientMock,
  createClientMock,
  createProjectMock,
  registerProjectLegalDocumentsMock,
  fileTypeFromBufferMock,
  microserviceFetchMock,
  loggerMock,
} = vi.hoisted(() => ({
  createRouteHandlerClientMock: vi.fn(),
  createClientMock: vi.fn(),
  createProjectMock: vi.fn(),
  registerProjectLegalDocumentsMock: vi.fn(
    async ({
      project,
      documents,
      uploadSource,
      uploadedBy,
    }: {
      project: { id: string; organization_id: string }
      documents?: Array<{
        source_field: string
        storage_path: string
        original_filename: string
        mime_type: string
        file_size_bytes: number
        sha256_hash: string
      }>
      uploadSource: string
      uploadedBy: string
    }) => {
      const fieldMap: Record<string, string> = {
        doc_dominio_vigente: 'dominio_vigente',
        doc_hipoteca_gravamen: 'hipoteca_gravamen',
        doc_roles: 'certificado_roles_sii',
        doc_subdivision: 'certificado_sag',
        doc_plano_oficial: 'plano_oficial',
        doc_otros: 'otro',
      }

      await Promise.all(
        (documents ?? []).map((document) =>
          microserviceFetchMock('/api/v1/legal-documents/register', {
            method: 'POST',
            body: {
              organization_id: project.organization_id,
              project_id: project.id,
              document_type: fieldMap[document.source_field],
              source_field: document.source_field,
              storage_bucket: 'project-files',
              storage_path: document.storage_path,
              original_filename: document.original_filename,
              mime_type: document.mime_type,
              file_size_bytes: document.file_size_bytes,
              sha256_hash: document.sha256_hash,
              upload_source: uploadSource,
              uploaded_by: uploadedBy,
            },
          })
        )
      )
    }
  ),
  fileTypeFromBufferMock: vi.fn(),
  microserviceFetchMock: vi.fn(),
  loggerMock: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createRouteHandlerClient: createRouteHandlerClientMock,
  createClient: createClientMock,
}))

vi.mock('@/lib/services/projects.service', () => ({
  getProjectsWithMetrics: vi.fn(),
  createProject: createProjectMock,
  registerProjectLegalDocuments: registerProjectLegalDocumentsMock,
  PROJECT_LEGAL_DOCUMENT_FIELDS: {
    doc_dominio_vigente: 'dominio_vigente',
    doc_hipoteca_gravamen: 'hipoteca_gravamen',
    doc_roles: 'certificado_roles_sii',
    doc_subdivision: 'certificado_sag',
    doc_plano_oficial: 'plano_oficial',
    doc_otros: 'otro',
  },
}))

vi.mock('@/lib/services/microservice.client', () => ({
  microserviceFetch: microserviceFetchMock,
}))

vi.mock('file-type', () => ({
  fileTypeFromBuffer: fileTypeFromBufferMock,
}))

vi.mock('@/lib/logger', () => ({
  logger: loggerMock,
}))

import { microserviceFetch } from '@/lib/services/microservice.client'
import { POST as createProjectPost } from '../src/app/api/projects/route'
import { POST as uploadProjectFilePost } from '../src/app/api/uploads/project-files/route'

const LEGAL_DOCUMENT_REGISTER_PATH = '/api/v1/legal-documents/register'

function authenticatedRouteClient(userId = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }),
    },
  }
}

function buildSupabaseChain(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (value: unknown) => void) => void
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  }

  ;(['select', 'eq', 'limit', 'update'] as const).forEach((method) => {
    chain[method].mockReturnValue(chain)
  })
  chain.single.mockResolvedValue(result)
  chain.maybeSingle.mockResolvedValue(result)
  chain.then = vi.fn((resolve: (value: unknown) => void) => resolve(result))

  return chain
}

function buildUploadSupabaseMock(
  project: Record<string, unknown>,
  uploadedPath: string,
  membership: Record<string, unknown> | null = { organization_id: 'org-1', role: 'admin' }
) {
  const membershipChain = buildSupabaseChain({ data: membership, error: null })
  const fetchProjectChain = buildSupabaseChain({ data: project, error: null })
  const updateProjectChain = buildSupabaseChain({
    data: { ...project, doc_roles: uploadedPath },
    error: null,
  })
  const fromMock = vi
    .fn()
    .mockReturnValueOnce(membershipChain)
    .mockReturnValueOnce(fetchProjectChain)
    .mockReturnValueOnce(updateProjectChain)

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: fromMock,
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: uploadedPath }, error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }
}

function buildProjectCreateRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function buildProjectFileUploadRequest(file: File, type = 'doc_roles') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('projectId', 'project-1')
  formData.append('type', type)

  return new Request('http://localhost/api/uploads/project-files', {
    method: 'POST',
    body: formData,
  })
}

describe('T016 - Escrituras legal document ingestion from web uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createRouteHandlerClientMock.mockReturnValue(authenticatedRouteClient())
    microserviceFetchMock.mockResolvedValue({
      data: {
        legal_document_id: 'legal-doc-1',
        ingestion_job_id: 'ingestion-job-1',
        extraction_status: 'queued',
        version_number: 1,
      },
      error: null,
      status: 202,
    })
  })

  it('registers onboarding legal documents after project creation without blocking the response', async () => {
    createProjectMock.mockResolvedValue({
      project: {
        id: 'project-1',
        organization_id: 'org-1',
        name: 'Parcelas Los Aromos',
        doc_dominio_vigente: 'project-1/docs/dominio-vigente.pdf',
        doc_roles: 'project-1/docs/certificado-roles.pdf',
      },
      lots: [{ id: 'lot-1' }, { id: 'lot-2' }],
    })

    const response = await createProjectPost(
      buildProjectCreateRequest({
        name: 'Parcelas Los Aromos',
        region: 'Valparaiso',
        comuna: 'Quillota',
        total_lotes: 2,
        doc_dominio_vigente: 'project-1/docs/dominio-vigente.pdf',
        doc_roles: 'project-1/docs/certificado-roles.pdf',
        legal_documents: [
          {
            source_field: 'doc_dominio_vigente',
            storage_path: 'project-1/docs/dominio-vigente.pdf',
            original_filename: 'dominio-vigente.pdf',
            mime_type: 'application/pdf',
            file_size_bytes: 123,
            sha256_hash: 'a'.repeat(64),
          },
          {
            source_field: 'doc_roles',
            storage_path: 'project-1/docs/certificado-roles.pdf',
            original_filename: 'certificado-roles.pdf',
            mime_type: 'application/pdf',
            file_size_bytes: 456,
            sha256_hash: 'b'.repeat(64),
          },
        ],
      }) as any
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ id: 'project-1' }),
        message: 'Proyecto creado con 2 lotes',
      })
    )
    expect(microserviceFetch).toHaveBeenCalledTimes(2)
    expect(microserviceFetch).toHaveBeenCalledWith(
      LEGAL_DOCUMENT_REGISTER_PATH,
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          organization_id: 'org-1',
          project_id: 'project-1',
          document_type: 'dominio_vigente',
          source_field: 'doc_dominio_vigente',
          storage_bucket: 'project-files',
          storage_path: 'project-1/docs/dominio-vigente.pdf',
          upload_source: 'onboarding',
          uploaded_by: 'user-1',
        }),
      })
    )
    expect(microserviceFetch).toHaveBeenCalledWith(
      LEGAL_DOCUMENT_REGISTER_PATH,
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          organization_id: 'org-1',
          project_id: 'project-1',
          document_type: 'certificado_roles_sii',
          source_field: 'doc_roles',
          storage_bucket: 'project-files',
          storage_path: 'project-1/docs/certificado-roles.pdf',
          upload_source: 'onboarding',
          uploaded_by: 'user-1',
        }),
      })
    )
  })

  it('registers a replacement project legal document and queues extraction', async () => {
    const uploadedPath = 'project-1/docs/doc_roles-new-version.pdf'
    const project = {
      id: 'project-1',
      organization_id: 'org-1',
      images: [],
      doc_roles: 'project-1/docs/old-roles.pdf',
    }
    createClientMock.mockResolvedValue(buildUploadSupabaseMock(project, uploadedPath))
    fileTypeFromBufferMock.mockResolvedValue({ ext: 'pdf', mime: 'application/pdf' })

    const file = new File(['%PDF-1.4 certificado roles'], 'certificado-roles.pdf', {
      type: 'application/pdf',
    })
    const response = await uploadProjectFilePost(buildProjectFileUploadRequest(file) as any)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        path: uploadedPath,
        message: 'Archivo subido y validado exitosamente',
      })
    )
    expect(microserviceFetch).toHaveBeenCalledTimes(1)
    expect(microserviceFetch).toHaveBeenCalledWith(
      LEGAL_DOCUMENT_REGISTER_PATH,
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          organization_id: 'org-1',
          project_id: 'project-1',
          document_type: 'certificado_roles_sii',
          source_field: 'doc_roles',
          storage_bucket: 'project-files',
          storage_path: uploadedPath,
          original_filename: 'certificado-roles.pdf',
          mime_type: 'application/pdf',
          file_size_bytes: file.size,
          upload_source: 'project_documents',
          uploaded_by: 'user-1',
        }),
      })
    )
  })

  it('rejects invalid project document uploads before legal document registration', async () => {
    createClientMock.mockResolvedValue(buildUploadSupabaseMock({ id: 'project-1' }, 'unused.pdf'))
    fileTypeFromBufferMock.mockResolvedValue({ ext: 'png', mime: 'image/png' })

    const response = await uploadProjectFilePost(
      buildProjectFileUploadRequest(new File(['png'], 'roles.png', { type: 'image/png' })) as any
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: 'Formato de documento inválido. Solo se permiten PDFs.',
      })
    )
    expect(microserviceFetch).not.toHaveBeenCalled()
  })

  it('rejects non-admin project document uploads before storage and registration', async () => {
    const storageUpload = vi.fn()
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: vi.fn().mockReturnValueOnce(
        buildSupabaseChain({
          data: { organization_id: 'org-1', role: 'user' },
          error: null,
        })
      ),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: storageUpload,
          remove: vi.fn(),
        }),
      },
    })
    fileTypeFromBufferMock.mockResolvedValue({ ext: 'pdf', mime: 'application/pdf' })

    const response = await uploadProjectFilePost(
      buildProjectFileUploadRequest(
        new File(['%PDF-1.4 roles'], 'roles.pdf', { type: 'application/pdf' })
      ) as any
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        error: 'No tienes permisos para subir documentos del proyecto',
      })
    )
    expect(storageUpload).not.toHaveBeenCalled()
    expect(microserviceFetch).not.toHaveBeenCalled()
  })
})
