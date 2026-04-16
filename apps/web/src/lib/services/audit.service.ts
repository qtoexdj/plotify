import { createClient } from '@/lib/supabase/server'

export async function logAudit(params: {
    actor: string
    action: 'INVITE' | 'REMOVE' | 'ASSIGN' | 'UNASSIGN' | 'UPDATE' | 'CREATE' | 'DELETE'
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
