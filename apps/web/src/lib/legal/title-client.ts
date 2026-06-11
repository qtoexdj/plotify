import type {
  ProjectTitleCase,
  ProjectTitleCaseResponse,
  TitleAlert,
  TitleAlertResolvePayload,
  TitleApproveBlockingDetail,
  TitleNarrative,
  TitleNarrativeEditPayload,
  TitleReanalyzeResponse,
} from '@/lib/legal/title-types'

export interface TitleClientError {
  status: number
  message: string
  blocking?: TitleApproveBlockingDetail | null
}

export interface TitleClientResult<T> {
  data: T | null
  error: TitleClientError | null
}

async function parseError(response: Response): Promise<TitleClientError> {
  let message = `Error ${response.status}`
  let blocking: TitleApproveBlockingDetail | null = null
  try {
    const payload = (await response.json()) as {
      error?: string
      detail?: TitleApproveBlockingDetail | null
    }
    if (payload.error) message = payload.error
    if (payload.detail && Array.isArray(payload.detail.blocking)) {
      blocking = payload.detail
    }
  } catch {
    // keep defaults
  }
  return { status: response.status, message, blocking }
}

/**
 * Fetch the project title case. A 404 means the project has no title
 * documents yet; callers map it to the `no_documents` panel state.
 */
export async function fetchProjectTitleCase(
  projectId: string
): Promise<TitleClientResult<ProjectTitleCase | null>> {
  const response = await fetch(`/api/projects/${projectId}/legal-title`)
  if (response.status === 404) {
    return { data: null, error: null }
  }
  if (!response.ok) {
    return { data: null, error: await parseError(response) }
  }
  const payload = (await response.json()) as ProjectTitleCaseResponse
  return { data: payload.analysis, error: null }
}

export async function reanalyzeProjectTitle(
  projectId: string
): Promise<TitleClientResult<TitleReanalyzeResponse>> {
  const response = await fetch(`/api/projects/${projectId}/legal-title`, {
    method: 'POST',
  })
  if (!response.ok) {
    return { data: null, error: await parseError(response) }
  }
  return { data: (await response.json()) as TitleReanalyzeResponse, error: null }
}

export async function updateTitleNarrative(
  projectId: string,
  analysisId: string,
  payload: TitleNarrativeEditPayload
): Promise<TitleClientResult<TitleNarrative>> {
  const response = await fetch(`/api/projects/${projectId}/legal-title/${analysisId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    return { data: null, error: await parseError(response) }
  }
  return { data: (await response.json()) as TitleNarrative, error: null }
}

export async function approveTitleCase(
  projectId: string,
  analysisId: string
): Promise<TitleClientResult<ProjectTitleCase>> {
  const response = await fetch(`/api/projects/${projectId}/legal-title/${analysisId}`, {
    method: 'POST',
  })
  if (!response.ok) {
    return { data: null, error: await parseError(response) }
  }
  return { data: (await response.json()) as ProjectTitleCase, error: null }
}

export async function resolveTitleAlert(
  projectId: string,
  analysisId: string,
  alertIndex: number,
  payload: TitleAlertResolvePayload
): Promise<TitleClientResult<TitleAlert>> {
  const response = await fetch(
    `/api/projects/${projectId}/legal-title/${analysisId}/alerts/${alertIndex}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  )
  if (!response.ok) {
    return { data: null, error: await parseError(response) }
  }
  return { data: (await response.json()) as TitleAlert, error: null }
}
