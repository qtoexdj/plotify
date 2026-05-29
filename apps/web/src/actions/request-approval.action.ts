'use server'

import { createClient } from '@/lib/supabase/server'
import {
  reservationFormSchema,
  type ReservationFormInput,
} from '@/lib/validations/approval-request.schema'
import { createApprovalRequest } from '@/lib/services/approvals.service'
import { checkVendorAssignment } from './vendor-actions.action'
import type { ApprovalRequestPayload } from '@/types/database.types'
import { logAudit } from '@/lib/services/audit.service'

export type RequestApprovalResult =
  | { success: true; approval_id: string; message: string }
  | { success: false; error: string }

/**
 * Resuelve la información del vendedor a partir del usuario autenticado.
 * Busca el registro de vendor vinculado al user_id actual.
 */
export async function resolveVendorFromUser(userId: string): Promise<{
  vendor_id: string
  vendor_name: string
  vendor_phone: string
  organization_id: string
} | null> {
  const supabase = await createClient()

  const { data: vendor, error } = await supabase
    .from('vendors')
    .select('id, nombre, phone, organization_id')
    .eq('user_id', userId)
    .single()

  if (error || !vendor) {
    console.error('[approvals.service] Vendor not found for user:', userId, error)
    return null
  }

  return {
    vendor_id: vendor.id,
    vendor_name: vendor.nombre,
    vendor_phone: vendor.phone || '',
    organization_id: vendor.organization_id || '',
  }
}

/**
 * Server Action invocada desde LotReservationForm cuando mode === 'reservation'.
 * Crea una solicitud de aprobación en lugar de reservar el lote directamente.
 */
export async function requestReservationApproval(
  projectId: string,
  lotId: string,
  data: ReservationFormInput
): Promise<RequestApprovalResult> {
  const supabase = await createClient()

  // 1. Validar input
  const validation = reservationFormSchema.safeParse(data)
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message }
  }
  const validData = validation.data

  // 2. Enforce vendor assignment before reservation access (T025)
  const check = await checkVendorAssignment(projectId, lotId)
  if (!check.allowed) {
    return { success: false, error: check.error || 'Acceso denegado' }
  }

  // 3. Resolver info del vendedor desde el usuario
  let vendorInfo = await resolveVendorFromUser(check.userId!)
  if (!vendorInfo) {
    // Si no tiene registro de vendedor (ej: es admin), primero buscamos si el lote ya tiene vendedor_id
    const { data: lotData } = await supabase
      .from('lots')
      .select('vendedor_id')
      .eq('id', lotId)
      .single()

    const lotVendorId = lotData?.vendedor_id

    if (lotVendorId) {
      const { data: vRecord } = await supabase
        .from('vendors')
        .select('id, nombre, phone, organization_id')
        .eq('id', lotVendorId)
        .maybeSingle()

      if (vRecord) {
        vendorInfo = {
          vendor_id: vRecord.id,
          vendor_name: vRecord.nombre,
          vendor_phone: vRecord.phone || '',
          organization_id: vRecord.organization_id || '',
        }
      }
    }

    if (!vendorInfo) {
      // Si no, buscamos el primer vendedor asignado al proyecto
      const { data: vpData, error: vpErr } = await supabase
        .from('vendor_projects')
        .select('vendor_id, vendors(id, nombre, phone, organization_id)')
        .eq('project_id', projectId)
        .limit(1)
        .maybeSingle()

      if (vpErr || !vpData || !vpData.vendors) {
        return {
          success: false,
          error:
            'No se encontró un vendedor asignado a este lote o proyecto para asociar la solicitud.',
        }
      }

      const assignedVendor = vpData.vendors as unknown as {
        id: string
        nombre: string
        phone: string | null
        organization_id: string | null
      }
      vendorInfo = {
        vendor_id: assignedVendor.id,
        vendor_name: assignedVendor.nombre,
        vendor_phone: assignedVendor.phone || '',
        organization_id: assignedVendor.organization_id || '',
      }
    }
  }

  // 4. Obtener organization_id del proyecto
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single()

  if (projectError || !project?.organization_id) {
    return { success: false, error: 'Proyecto no encontrado' }
  }

  // 5. Armar payload con todos los datos del cliente
  const payload: ApprovalRequestPayload = {
    cliente_nombre: validData.cliente_nombre,
    cliente_run: validData.cliente_run,
    valor_reserva: validData.valor_reserva,
    notaria: validData.notaria,
    fecha_firma: validData.fecha,
    cliente_direccion: validData.cliente_direccion,
    cliente_estado_civil: validData.cliente_estado_civil,
    cliente_ocupacion: validData.cliente_ocupacion,
    cliente_email: validData.cliente_email,
    cliente_telefono: validData.cliente_telefono,
  }

  // 6. Crear solicitud de aprobación
  const result = await createApprovalRequest({
    lotId,
    organizationId: project.organization_id,
    vendorId: vendorInfo.vendor_id,
    vendorName: vendorInfo.vendor_name,
    vendorPhone: vendorInfo.vendor_phone,
    vendorPlatform: 'telegram', // Default, configurable en el futuro
    payload,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // 7. Auditar la acción de creación de solicitud
  try {
    await logAudit({
      actor: check.userId!,
      action: 'reservation.requested',
      entity: 'approval_requests',
      entity_id: result.approval_id,
      organization_id: project.organization_id,
      payload: {
        lot_id: lotId,
        project_id: projectId,
        approval_id: result.approval_id,
        channel: 'web',
        actor_user_id: check.userId!,
        vendor_id: vendorInfo.vendor_id,
      },
    })
  } catch (auditErr) {
    console.error('[request-approval.action] Error recording audit log:', auditErr)
  }

  return {
    success: true,
    approval_id: result.approval_id,
    message: result.message,
  }
}

/**
 * Server Action invocada desde LotReservationForm cuando mode === 'direct_sale'.
 * Crea una solicitud de aprobación de venta.
 */
export async function requestSaleApproval(
  projectId: string,
  lotId: string,
  data: ReservationFormInput
): Promise<RequestApprovalResult> {
  const supabase = await createClient()

  // 1. Validar input
  const validation = reservationFormSchema.safeParse(data)
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message }
  }
  const validData = validation.data

  // 2. Enforce vendor assignment before sale access
  const check = await checkVendorAssignment(projectId, lotId)
  if (!check.allowed) {
    return { success: false, error: check.error || 'Acceso denegado' }
  }

  // 3. Resolver info del vendedor desde el usuario
  let vendorInfo = await resolveVendorFromUser(check.userId!)
  if (!vendorInfo) {
    // Si no tiene registro de vendedor (ej: es admin), primero buscamos si el lote ya tiene vendedor_id
    const { data: lotData } = await supabase
      .from('lots')
      .select('vendedor_id')
      .eq('id', lotId)
      .single()

    const lotVendorId = lotData?.vendedor_id

    if (lotVendorId) {
      const { data: vRecord } = await supabase
        .from('vendors')
        .select('id, nombre, phone, organization_id')
        .eq('id', lotVendorId)
        .maybeSingle()

      if (vRecord) {
        vendorInfo = {
          vendor_id: vRecord.id,
          vendor_name: vRecord.nombre,
          vendor_phone: vRecord.phone || '',
          organization_id: vRecord.organization_id || '',
        }
      }
    }

    if (!vendorInfo) {
      // Si no, buscamos el primer vendedor asignado al proyecto
      const { data: vpData, error: vpErr } = await supabase
        .from('vendor_projects')
        .select('vendor_id, vendors(id, nombre, phone, organization_id)')
        .eq('project_id', projectId)
        .limit(1)
        .maybeSingle()

      if (vpErr || !vpData || !vpData.vendors) {
        return {
          success: false,
          error:
            'No se encontró un vendedor asignado a este lote o proyecto para asociar la solicitud.',
        }
      }

      const assignedVendor = vpData.vendors as unknown as {
        id: string
        nombre: string
        phone: string | null
        organization_id: string | null
      }
      vendorInfo = {
        vendor_id: assignedVendor.id,
        vendor_name: assignedVendor.nombre,
        vendor_phone: assignedVendor.phone || '',
        organization_id: assignedVendor.organization_id || '',
      }
    }
  }

  // 4. Obtener organization_id del proyecto
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single()

  if (projectError || !project?.organization_id) {
    return { success: false, error: 'Proyecto no encontrado' }
  }

  const { createSaleApprovalRequest } = await import('@/lib/services/approvals.service')

  // 5. Armar payload con todos los datos del cliente
  const payload = {
    cliente_nombre: validData.cliente_nombre,
    cliente_run: validData.cliente_run,
    valor_final: validData.valor_reserva, // valor final en la venta
    notaria: validData.notaria || null,
    fecha_firma: validData.fecha || null,
  }

  // 6. Crear solicitud de aprobación de venta
  const result = await createSaleApprovalRequest({
    lotId,
    organizationId: project.organization_id,
    vendorId: vendorInfo.vendor_id,
    vendorName: vendorInfo.vendor_name,
    vendorPhone: vendorInfo.vendor_phone,
    vendorPlatform: 'telegram',
    payload,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // 7. Auditar la acción de creación de solicitud
  try {
    await logAudit({
      actor: check.userId!,
      action: 'sale.requested',
      entity: 'approval_requests',
      entity_id: result.approval_id,
      organization_id: project.organization_id,
      payload: {
        lot_id: lotId,
        project_id: projectId,
        approval_id: result.approval_id,
        channel: 'web',
        actor_user_id: check.userId!,
        vendor_id: vendorInfo.vendor_id,
      },
    })
  } catch (auditErr) {
    console.error('[request-approval.action] Error recording audit log:', auditErr)
  }

  return {
    success: true,
    approval_id: result.approval_id,
    message: result.message,
  }
}

/**
 * Server Action para resolver una solicitud de aprobación (aprobación/rechazo) de forma segura desde el servidor.
 */
export async function resolveApprovalRequestAction(
  approvalId: string,
  action: 'approve' | 'reject',
  adminId: string,
  organizationId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { resolveApprovalRequest } = await import('@/lib/services/approvals.service')
  return resolveApprovalRequest(approvalId, action, adminId, organizationId)
}
