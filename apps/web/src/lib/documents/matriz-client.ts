import type {
  ClauseUpsertRequest,
  EscrituraTemplateDetail,
  MatrizCaseResponse,
  MatrizSaveRequest,
  TemplateCreateRequest,
  TemplateListResponse,
} from './matriz-types'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
}

export class MatrizClientError extends Error {
  status: number
  detail: unknown

  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = 'MatrizClientError'
    this.status = status
    this.detail = detail
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'string') return error
  }
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
  }
  return fallback
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  })
  const payload = await parseJson(response)

  if (!response.ok) {
    throw new MatrizClientError(
      errorMessage(payload, 'Error en el servicio de matriz'),
      response.status,
      payload
    )
  }

  return payload as T
}

export async function getMatrizCase(caseId: string): Promise<MatrizCaseResponse> {
  return requestJson<MatrizCaseResponse>(
    `/api/escritura-matrices/case/${encodeURIComponent(caseId)}`
  )
}

export async function saveMatriz(
  matrizId: string,
  payload: MatrizSaveRequest
): Promise<MatrizCaseResponse> {
  return requestJson<MatrizCaseResponse>(
    `/api/escritura-matrices/${encodeURIComponent(matrizId)}`,
    {
      method: 'PUT',
      body: payload,
    }
  )
}

export async function listEscrituraTemplates({
  documentType = 'compraventa',
}: {
  documentType?: string
} = {}): Promise<TemplateListResponse> {
  const params = new URLSearchParams({ document_type: documentType })
  return requestJson<TemplateListResponse>(`/api/escritura-templates?${params.toString()}`)
}

export async function createEscrituraTemplate(
  payload: TemplateCreateRequest
): Promise<EscrituraTemplateDetail> {
  return requestJson<EscrituraTemplateDetail>('/api/escritura-templates', {
    method: 'POST',
    body: payload,
  })
}

export async function getEscrituraTemplate(templateId: string): Promise<EscrituraTemplateDetail> {
  return requestJson<EscrituraTemplateDetail>(
    `/api/escritura-templates/${encodeURIComponent(templateId)}`
  )
}

export async function upsertEscrituraTemplateClause({
  templateId,
  clauseKey,
  payload,
}: {
  templateId: string
  clauseKey: string
  payload: ClauseUpsertRequest
}): Promise<EscrituraTemplateDetail> {
  return requestJson<EscrituraTemplateDetail>(
    `/api/escritura-templates/${encodeURIComponent(templateId)}/clauses/${encodeURIComponent(clauseKey)}`,
    {
      method: 'PUT',
      body: payload,
    }
  )
}

export async function publishEscrituraTemplate(
  templateId: string
): Promise<EscrituraTemplateDetail> {
  return requestJson<EscrituraTemplateDetail>(
    `/api/escritura-templates/${encodeURIComponent(templateId)}/publish`,
    { method: 'POST' }
  )
}
