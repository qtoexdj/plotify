import { microserviceFetch } from './microservice.client'
import type { OperationRequestBody, OperationResponse, components } from './plotify-chat.generated'

export type PreviewRequest = OperationRequestBody<'previewDocument'>
export type PreviewResponse = OperationResponse<'previewDocument'>

export type GenerateRequest = OperationRequestBody<'generateDocument'>
export type GenerateResponse = OperationResponse<'generateDocument'>

export type VariableStatusResponse = components['schemas']['VariableStatusResponse']

export async function previewDocument(body: PreviewRequest): Promise<PreviewResponse> {
  const { data, error } = await microserviceFetch<PreviewResponse>('/api/v1/documents/preview', {
    method: 'POST',
    body,
  })
  if (error) throw new Error(error)
  return data!
}

export async function generateDocument(body: GenerateRequest): Promise<GenerateResponse> {
  const { data, error } = await microserviceFetch<GenerateResponse>('/api/v1/documents/generate', {
    method: 'POST',
    body,
  })
  if (error) throw new Error(error)
  return data!
}

export async function getVariables(
  lotId: string,
  organizationId: string,
  templateId?: string
): Promise<VariableStatusResponse> {
  let url = `/api/v1/documents/variables/${encodeURIComponent(lotId)}?organization_id=${encodeURIComponent(organizationId)}`
  if (templateId) {
    url += `&template_id=${encodeURIComponent(templateId)}`
  }
  const { data, error } = await microserviceFetch<VariableStatusResponse>(url, {
    method: 'GET',
  })
  if (error) throw new Error(error)
  return data!
}
