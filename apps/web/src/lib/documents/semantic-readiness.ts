import type { MatrizView, MinutaGeneration } from './matriz-types'

export function semanticReadiness(matriz: MatrizView) {
  const status = matriz.semantic_status ?? 'unverified'
  return {
    semanticStatus: status,
    deliverable: status === 'passed' && matriz.status === 'approved' && !matriz.snapshot_stale,
    blockerCount: status === 'passed' ? 0 : Math.max(1, matriz.semantic_issue_count ?? 0),
    label:
      status === 'passed'
        ? 'Validación semántica aprobada'
        : status === 'failed'
          ? 'Documento con bloqueos semánticos'
          : 'Documento histórico sin validación',
  }
}

export function generationIsDeliverable(generation: MinutaGeneration): boolean {
  return generation.semantic_status === 'passed' && generation.readiness_status === 'ready'
}

export function legalGrantStatus(
  matriz: MatrizView,
  now = new Date()
): 'active' | 'expired' | 'missing' {
  if (!matriz.legal_approval_grant_active) return 'missing'
  if (
    matriz.legal_approval_grant_expires_at &&
    new Date(matriz.legal_approval_grant_expires_at).getTime() <= now.getTime()
  )
    return 'expired'
  return 'active'
}
