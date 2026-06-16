/**
 * Fixtures compartidos para la capa de tests de render de SDD 010.
 * No es un archivo `.test.tsx`, así que vitest no lo colecta como suite.
 */

import type {
  ApprovalBlocker,
  InsertableVariable,
  MatrizCaseResponse,
  MatrizClauseView,
  MatrizView,
  TokenResolution,
} from '@/lib/documents/matriz-types'

export const GATE_BLOCKER: ApprovalBlocker = {
  kind: 'readiness_gate',
  gate: 'title_verified',
  cause: null,
  fix_url: '/projects/p1?tab=legal',
  title: 'Verificación pendiente: estudio de título aprobado',
  description: 'Se revisa en el panel de título del proyecto.',
  action_label: 'Revisar estudio de título',
  action_href: '/projects/p1?tab=legal',
}

export const DATO_BLOCKER: ApprovalBlocker = {
  kind: 'token_missing',
  key: 'comprador.estado_civil',
  fix_url: '/projects/p1?tab=legal',
  title: 'Falta estado civil del comprador',
  description: 'Se completa en el registro de venta del lote.',
  action_label: 'Completar dato',
  action_href: '/projects/p1?tab=legal&variable=comprador.estado_civil',
}

export const INSERTABLES: InsertableVariable[] = [
  {
    key: 'comprador.nombre',
    label: 'Nombre de la compradora',
    category: 'comprador',
    category_label: 'Compradora',
  },
  {
    key: 'comprador.rut',
    label: 'RUT de la compradora',
    category: 'comprador',
    category_label: 'Compradora',
  },
  { key: 'lote.numero_nombre', label: 'Nombre del lote', category: 'lote', category_label: 'Lote' },
]

export function matrizWith(
  blockers: ApprovalBlocker[],
  clauses: MatrizClauseView[] = []
): MatrizView {
  return {
    id: 'm1',
    escritura_case_id: 'c1',
    project_id: 'p1',
    status: 'draft',
    version: 1,
    template: { id: 't1', name: 'Compraventa predio rustico', version: 1 },
    snapshot_stale: false,
    clause_order: clauses.map((clause) => clause.clause_key),
    clauses,
    resolution: { tokens: [], blocks: [], missing_count: 0 },
    approval_blockers: blockers,
    dismissed_alerts: [],
  }
}

export function clausula(
  partial: Partial<MatrizClauseView> & { clause_key: string }
): MatrizClauseView {
  return {
    title: partial.clause_key.toUpperCase(),
    position: 0,
    fixed_position: false,
    content_json: {
      schema_version: 1,
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto de la cláusula.' }] }],
    },
    resolved_content: {
      schema_version: 1,
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto de la cláusula.' }] }],
    },
    overridden: false,
    disabled: false,
    condition: null,
    alert_tipo: null,
    omitted_reason: null,
    ...partial,
  } as MatrizClauseView
}

export function caseResponse(matriz: MatrizView): MatrizCaseResponse {
  return { matriz, insertable_variables: INSERTABLES }
}

export function tokenResolution(status: TokenResolution['status']): TokenResolution {
  return {
    variableKey: 'comprador.nombre',
    status,
    value_text: null,
    state: null,
    source_type: null,
    evidence_refs: [],
  }
}
