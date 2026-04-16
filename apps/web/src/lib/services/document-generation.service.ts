import { microserviceFetch } from './microservice.client'
import type { OperationRequestBody, OperationResponse } from './plotify-chat.generated'

export type PreviewRequest = OperationRequestBody<'previewDocument'>
export type PreviewResponse = OperationResponse<'previewDocument'>

export type GenerateRequest = OperationRequestBody<'generateDocument'>
export type GenerateResponse = OperationResponse<'generateDocument'>

export async function previewDocument(body: PreviewRequest): Promise<PreviewResponse> {
  const { data, error } = await microserviceFetch<PreviewResponse>(
    '/api/v1/documents/preview',
    { method: 'POST', body }
  )
  if (error) throw new Error(error)
  return data!
}

export async function generateDocument(
  body: GenerateRequest
): Promise<GenerateResponse> {
  const { data, error } = await microserviceFetch<GenerateResponse>(
    '/api/v1/documents/generate',
    { method: 'POST', body }
  )
  if (error) throw new Error(error)
  return data!
}
