import type {
  ClauseUpsertRequest,
  EscrituraTemplateDetail,
  GenerateMinutaRequest,
  MatrizApproveRequest,
  MatrizCaseResponse,
  MatrizRejectRequest,
  MatrizSaveRequest,
  MatrizSubmitRequest,
  MinutaGeneration,
  MinutaGenerationListResponse,
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

export async function getMatrizProject(projectId: string): Promise<MatrizCaseResponse> {
  return requestJson<MatrizCaseResponse>(
    `/api/escritura-matrices/project/${encodeURIComponent(projectId)}`
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

export async function submitMatriz(
  matrizId: string,
  payload: MatrizSubmitRequest = {}
): Promise<MatrizCaseResponse> {
  return requestJson<MatrizCaseResponse>(
    `/api/escritura-matrices/${encodeURIComponent(matrizId)}/submit`,
    {
      method: 'POST',
      body: payload,
    }
  )
}

export async function approveMatriz(
  matrizId: string,
  payload: MatrizApproveRequest = {}
): Promise<MatrizCaseResponse> {
  return requestJson<MatrizCaseResponse>(
    `/api/escritura-matrices/${encodeURIComponent(matrizId)}/approve`,
    {
      method: 'POST',
      body: payload,
    }
  )
}

export async function rejectMatriz(
  matrizId: string,
  payload: MatrizRejectRequest
): Promise<MatrizCaseResponse> {
  return requestJson<MatrizCaseResponse>(
    `/api/escritura-matrices/${encodeURIComponent(matrizId)}/reject`,
    {
      method: 'POST',
      body: payload,
    }
  )
}

export async function generateMinuta(
  matrizId: string,
  payload: GenerateMinutaRequest
): Promise<MinutaGeneration> {
  return requestJson<MinutaGeneration>(
    `/api/escritura-matrices/${encodeURIComponent(matrizId)}/generate`,
    {
      method: 'POST',
      body: payload,
    }
  )
}

export async function listMinutaGenerations(caseId: string): Promise<MinutaGenerationListResponse> {
  return requestJson<MinutaGenerationListResponse>(
    `/api/escritura-matrices/case/${encodeURIComponent(caseId)}/generations`
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
  clauseKey?: string | null
  payload: ClauseUpsertRequest
}): Promise<EscrituraTemplateDetail> {
  const clausePath = clauseKey ? `/clauses/${encodeURIComponent(clauseKey)}` : '/clauses'
  return requestJson<EscrituraTemplateDetail>(
    `/api/escritura-templates/${encodeURIComponent(templateId)}${clausePath}`,
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

/** SDD 011 (A4): fija el valor de una variable de proyecto por su clave. */
export type UpsertVariableBody = {
  variable_key: string
  value_text?: string | null
  value_json?: unknown
  state?: 'resolved' | 'not_applicable'
  correction_reason?: string | null
}

export type VariableReviewResult = {
  variable_resolution_id: string
  state: string
}

export async function upsertProjectVariable(
  projectId: string,
  body: UpsertVariableBody
): Promise<VariableReviewResult> {
  return requestJson<VariableReviewResult>(
    `/api/projects/${encodeURIComponent(projectId)}/legal-variables/by-key`,
    { method: 'PUT', body }
  )
}

/** SDD 011 (A5): aprueba en bloque variables revisables del proyecto. */
export type BulkApproveBody = {
  group?: string | null
  variable_keys?: string[]
}

export type BulkApproveResult = {
  approved_count: number
  approved_keys: string[]
  skipped_keys: string[]
}

export async function bulkApproveProjectVariables(
  projectId: string,
  body: BulkApproveBody = {}
): Promise<BulkApproveResult> {
  return requestJson<BulkApproveResult>(
    `/api/projects/${encodeURIComponent(projectId)}/legal-variables/bulk-approve`,
    { method: 'POST', body }
  )
}
