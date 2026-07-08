'use server'

import { updateWorkspace } from '@/lib/services/workspace.service'
import { logAudit } from '@/lib/services/audit.service'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateWorkspaceAction(orgId: string, data: { name: string; slug: string }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  try {
    const updated = await updateWorkspace(orgId, user.id, data)
    revalidatePath('/settings/workspace')
    return { success: true, data: updated }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Error al actualizar' }
  }
}

export async function updateWorkspaceEscrituraConfigAction(
  orgId: string,
  values: {
    razon_social: string
    rut: string
    banco: string
    tipo_cuenta: string
    numero_cuenta: string
    email_transferencia?: string
    abogado_nombre: string
    abogado_rut: string
    abogado_email: string
    mandatario_nombre: string
    mandatario_rut: string
    mandatario_facultades: string
  }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Validar rol de administrador en la org para seguridad
  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberError || member?.role !== 'admin') {
    return { error: 'No tienes permisos de administrador para realizar esta acción.' }
  }

  try {
    // 1. Upsert de organization_payment_info
    const { error: paymentError } = await supabase.from('organization_payment_info').upsert(
      {
        organization_id: orgId,
        razon_social: values.razon_social,
        rut: values.rut,
        banco: values.banco,
        tipo_cuenta: values.tipo_cuenta,
        numero_cuenta: values.numero_cuenta,
        email_transferencia: values.email_transferencia || null,
      },
      { onConflict: 'organization_id' }
    )

    if (paymentError) {
      console.error('Error in payment info upsert:', paymentError)
      return { error: 'Error al guardar los datos de pago de la organización.' }
    }

    // 2. Obtener todos los proyectos de la organización
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id')
      .eq('organization_id', orgId)

    if (projectsError) {
      console.error('Error fetching projects:', projectsError)
      return { error: 'Error al buscar los proyectos de la organización.' }
    }

    // 3. Upsert de las variables de abogado y mandatario para cada proyecto
    if (projects && projects.length > 0) {
      const variablesToSave = [
        {
          key: 'documento.abogado_redactor.nombre',
          value: values.abogado_nombre,
          group: 'documento',
        },
        { key: 'documento.abogado_redactor.rut', value: values.abogado_rut, group: 'documento' },
        {
          key: 'documento.abogado_redactor.email',
          value: values.abogado_email,
          group: 'documento',
        },
        { key: 'mandato.rectificacion_nombre', value: values.mandatario_nombre, group: 'mandato' },
        { key: 'mandato.rectificacion_rut', value: values.mandatario_rut, group: 'mandato' },
        { key: 'mandato.facultades', value: values.mandatario_facultades, group: 'mandato' },
      ]

      for (const project of projects) {
        for (const variable of variablesToSave) {
          // Buscamos si ya existe una resolución activa (para no romper el índice condicional unique)
          const { data: existing } = await supabase
            .from('variable_resolutions')
            .select('id')
            .eq('project_id', project.id)
            .eq('variable_key', variable.key)
            .is('lot_id', null)
            .is('escritura_case_id', null)
            .neq('state', 'superseded')
            .maybeSingle()

          if (existing?.id) {
            // Update
            const { error: varError } = await supabase
              .from('variable_resolutions')
              .update({
                value_text: variable.value,
                state: 'resolved',
                source_type: 'manual',
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
              })
              .eq('id', existing.id)

            if (varError) {
              console.error(`Error updating variable ${variable.key}:`, varError)
            }
          } else {
            // Insert
            const { error: varError } = await supabase.from('variable_resolutions').insert({
              organization_id: orgId,
              project_id: project.id,
              variable_key: variable.key,
              variable_group: variable.group,
              value_text: variable.value,
              state: 'resolved',
              source_type: 'manual',
              reviewed_by: user.id,
              reviewed_at: new Date().toISOString(),
              lot_id: null,
              escritura_case_id: null,
            })

            if (varError) {
              console.error(`Error inserting variable ${variable.key}:`, varError)
            }
          }
        }
      }
    }

    revalidatePath('/settings/workspace')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error in config update:', error)
    return {
      error:
        error instanceof Error ? error.message : 'Error inesperado al guardar la configuración',
    }
  }
}

export async function registerTelegramBotAction(
  orgId: string,
  values: {
    token: string
    username: string
  }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  // Validar rol de administrador en la org para seguridad
  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberError || member?.role !== 'admin') {
    return { error: 'No tienes permisos de administrador para realizar esta acción.' }
  }

  try {
    // Limpiamos espacios y posibles prefijos del username (por ejemplo, remover '@' al inicio)
    const usernameClean = values.username.trim().replace(/^@/, '')
    const tokenClean = values.token.trim()

    // Llamamos a la función RPC register_telegram_bot que maneja el cifrado
    const { error: rpcError } = await supabase.rpc('register_telegram_bot', {
      p_org_id: orgId,
      p_token: tokenClean,
      p_username: usernameClean,
      p_webhook_url: null, // El backend configura el webhook dinámicamente si es necesario
    })

    if (rpcError) {
      console.error('Error invoking register_telegram_bot RPC:', rpcError)
      return {
        error: 'Error en la base de datos al registrar el bot. Verifica que el token sea correcto.',
      }
    }

    revalidatePath('/settings/workspace')
    return { success: true }
  } catch (error) {
    console.error('Unexpected error registering telegram bot:', error)
    return { error: error instanceof Error ? error.message : 'Error inesperado' }
  }
}

export type EscrituraReviewPolicy = 'every_sale' | 'exceptions_only'

/**
 * SDD 017 (T018): política de revisión jurídica que lee la cascada de
 * aprobación por excepción al correr (research D4). 'every_sale' (default)
 * exige aprobar la revisión jurídica de cada venta; 'exceptions_only' deja
 * correr la cascada sin ese acto humano salvo que haya una excepción real.
 * El microservicio (FastAPI) solo LEE esta columna — el cambio se hace acá,
 * patrón casa de settings/actions.ts, no por un router FastAPI.
 */
export async function updateEscrituraReviewPolicyAction(
  orgId: string,
  policy: EscrituraReviewPolicy
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autorizado' }
  }

  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberError || member?.role !== 'admin') {
    return { error: 'No tienes permisos de administrador para realizar esta acción.' }
  }

  try {
    const { data: current, error: currentError } = await supabase
      .from('organizations')
      .select('escritura_review_policy')
      .eq('id', orgId)
      .maybeSingle()

    if (currentError) {
      console.error('Error reading current escritura_review_policy:', currentError)
      return { error: 'Error al leer la política actual.' }
    }

    const previousPolicy = current?.escritura_review_policy ?? 'every_sale'
    if (previousPolicy === policy) {
      return { success: true, data: { policy } }
    }

    const { error: updateError } = await supabase
      .from('organizations')
      .update({ escritura_review_policy: policy })
      .eq('id', orgId)

    if (updateError) {
      console.error('Error updating escritura_review_policy:', updateError)
      return { error: 'Error al actualizar la política de revisión jurídica.' }
    }

    await logAudit({
      actor: user.id,
      action: 'organization.escritura_review_policy_updated',
      entity: 'organizations',
      entity_id: orgId,
      organization_id: orgId,
      payload: { from: previousPolicy, to: policy },
    })

    revalidatePath('/settings/workspace')
    return { success: true, data: { policy } }
  } catch (error) {
    console.error('Unexpected error updating escritura_review_policy:', error)
    return { error: error instanceof Error ? error.message : 'Error inesperado' }
  }
}
