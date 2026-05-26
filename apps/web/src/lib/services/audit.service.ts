import { createClient } from '@/lib/supabase/server'

export const AUDIT_EVENT_LABELS: Record<string, string> = {
  'reservation.requested': 'Reserva Solicitada',
  'reservation.approved': 'Reserva Aprobada',
  'reservation.rejected': 'Reserva Rechazada',
  'reservation.released': 'Reserva Liberada',
  'document.generated': 'Documento Generado',
  'document.regenerated': 'Documento Regenerado',
  'document.sent': 'Documento Enviado',
  'document.send_failed': 'Envío de Documento Fallido',
  'document.send_retried': 'Reintento de Envío de Documento',
  'lot.verified': 'Lote Verificado',
  'template.modified': 'Plantilla Modificada',
}

export type AuditAction =
  | 'INVITE'
  | 'REMOVE'
  | 'ASSIGN'
  | 'UNASSIGN'
  | 'UPDATE'
  | 'CREATE'
  | 'DELETE'
  | 'reservation.requested'
  | 'reservation.approved'
  | 'reservation.rejected'
  | 'reservation.released'
  | 'document.generated'
  | 'document.regenerated'
  | 'document.sent'
  | 'document.send_failed'
  | 'document.send_retried'
  | 'lot.verified'
  | 'template.modified'

export async function logAudit(params: {
  actor: string
  action: AuditAction
  entity: string
  entity_id: string
  payload?: Record<string, unknown>
}) {
  const supabase = await createClient()
  await supabase.from('audit_logs').insert({
    actor: params.actor,
    action: params.action,
    entity: params.entity,
    entity_id: params.entity_id,
    payload: params.payload || {},
  })
}
