'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import {
  createBlock,
  updateBlock,
  softDeleteBlock,
  createTemplate,
  saveTemplateBlocks,
} from '@/lib/services/documents.service'
import {
  generateDocument as generateDocApi,
  previewDocument as previewDocApi,
} from '@/lib/services/document-generation.service'
import type { DocumentBlockInsert, DocumentTemplateInsert } from '@/types/v2'

type LotOrganizationRow = {
  projects?: { organization_id?: string | null } | Array<{ organization_id?: string | null }> | null
}

function extractLotOrganizationId(lot: LotOrganizationRow | null): string | null {
  const project = Array.isArray(lot?.projects) ? lot.projects[0] : lot?.projects
  return project?.organization_id ?? null
}

// ─── BLOQUES ─────────────────────────────────────────────────────────────────

export async function createBlockAction(block: Omit<DocumentBlockInsert, 'created_by'>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }

  try {
    const created = await createBlock({
      ...block,
      created_by: user.id,
    })
    revalidatePath('/documentos/bloques')
    return { success: true as const, data: created }
  } catch (err) {
    logger.error({ err }, 'create_block_failed')
    return { success: false as const, error: 'Error al crear bloque' }
  }
}

export async function updateBlockAction(
  blockId: string,
  updates: Partial<Omit<DocumentBlockInsert, 'organization_id' | 'created_by'>>
) {
  try {
    await updateBlock(blockId, updates)
    revalidatePath('/documentos/bloques')
    revalidatePath(`/documentos/bloques/${blockId}`)
    return { success: true as const }
  } catch (err) {
    logger.error({ err, blockId }, 'update_block_failed')
    return { success: false as const, error: 'Error al actualizar bloque' }
  }
}

export async function deleteBlockAction(blockId: string) {
  try {
    await softDeleteBlock(blockId)
    revalidatePath('/documentos/bloques')
    return { success: true as const }
  } catch (err) {
    logger.error({ err, blockId }, 'delete_block_failed')
    return {
      success: false as const,
      error: 'Error al eliminar bloque (puede tener templates asociados)',
    }
  }
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────

export async function createTemplateAction(template: Omit<DocumentTemplateInsert, 'created_by'>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }

  try {
    const created = await createTemplate({ ...template, created_by: user.id })
    revalidatePath('/documentos/plantillas')
    return { success: true as const, data: created }
  } catch (err) {
    logger.error({ err }, 'create_template_failed')
    return { success: false as const, error: 'Error al crear plantilla' }
  }
}

export async function saveTemplateBlocksAction(
  templateId: string,
  items: Array<{
    block_id: string
    position: number
    is_optional: boolean
    condition_field?: string | null
  }>
) {
  try {
    await saveTemplateBlocks(templateId, items)
    revalidatePath(`/documentos/plantillas/${templateId}/builder`)
    return { success: true as const }
  } catch (err) {
    logger.error({ err, templateId }, 'save_template_blocks_failed')
    return { success: false as const, error: 'Error al guardar estructura de plantilla' }
  }
}

export async function duplicateTemplateAction(templateId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }

  try {
    // Traer template original con sus items
    const { data: original, error: fetchError } = await supabase
      .from('document_templates')
      .select('*, template_block_items(*)')
      .eq('id', templateId)
      .single()
    if (fetchError || !original) throw fetchError ?? new Error('Template no encontrado')

    // Crear copia del template
    const { data: copy, error: copyError } = await supabase
      .from('document_templates')
      .insert({
        organization_id: original.organization_id,
        name: `${original.name} (copia)`,
        document_type: original.document_type,
        description: original.description,
        header_config: original.header_config,
        footer_config: original.footer_config,
        page_config: original.page_config,
        is_default: false,
        created_by: user.id,
      })
      .select()
      .single()
    if (copyError || !copy) throw copyError ?? new Error('Error copiando template')

    // Copiar items del template
    const items = original.template_block_items as Array<{
      block_id: string
      position: number
      is_optional: boolean
      condition_field: string | null
    }>
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('template_block_items').insert(
        items.map((item) => ({
          template_id: copy.id,
          block_id: item.block_id,
          position: item.position,
          is_optional: item.is_optional,
          condition_field: item.condition_field,
        }))
      )
      if (itemsError) throw itemsError
    }

    revalidatePath('/documentos/plantillas')
    return { success: true as const, data: copy }
  } catch (err) {
    logger.error({ err, templateId }, 'duplicate_template_failed')
    return { success: false as const, error: 'Error al duplicar plantilla' }
  }
}

// ─── GENERACIÓN ───────────────────────────────────────────────────────────────

export async function generateDocumentAction(
  templateId: string,
  lotId: string,
  format: 'pdf' | 'docx',
  missingVariablesAccepted: boolean = false,
  selectedRecipients: Array<'vendedor' | 'comprador'> = ['vendedor', 'comprador'],
  documentType: 'reserva' | 'escritura' = 'reserva'
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }

  try {
    const { data: lot, error: lotError } = await supabase
      .from('lots')
      .select('id, projects!inner(organization_id)')
      .eq('id', lotId)
      .single()

    const organizationId = extractLotOrganizationId(lot as LotOrganizationRow | null)
    if (lotError || !organizationId) {
      logger.error({ lotError, lotId }, 'generate_document_lot_org_lookup_failed')
      return { success: false as const, error: 'No se pudo validar la organización del lote' }
    }

    const result = await generateDocApi({
      template_id: templateId,
      lot_id: lotId,
      organization_id: organizationId,
      format,
      generated_by: user.id,
      missing_variables_accepted: missingVariablesAccepted,
      selected_recipients: selectedRecipients,
      document_type: documentType,
    })
    revalidatePath('/documentos/historial')
    return { success: true as const, data: result }
  } catch (err) {
    logger.error({ err, templateId, lotId }, 'generate_document_failed')
    return { success: false as const, error: 'Error al generar documento' }
  }
}

export async function previewDocumentAction(templateId: string, lotId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }

  try {
    const { data: lot, error: lotError } = await supabase
      .from('lots')
      .select('id, projects!inner(organization_id)')
      .eq('id', lotId)
      .single()

    const organizationId = extractLotOrganizationId(lot as LotOrganizationRow | null)
    if (lotError || !organizationId) {
      logger.error({ lotError, lotId }, 'preview_document_lot_org_lookup_failed')
      return { success: false as const, error: 'No se pudo validar la organización del lote' }
    }

    const result = await previewDocApi({
      template_id: templateId,
      lot_id: lotId,
      organization_id: organizationId,
    })
    return { success: true as const, data: result }
  } catch (err) {
    logger.error({ err, templateId, lotId }, 'preview_document_failed')
    return { success: false as const, error: 'Error al previsualizar documento' }
  }
}

export async function getVariablesStatusAction(lotId: string, templateId?: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }

  try {
    const { data: lot, error: lotError } = await supabase
      .from('lots')
      .select('id, projects!inner(organization_id)')
      .eq('id', lotId)
      .single()

    const organizationId = extractLotOrganizationId(lot as LotOrganizationRow | null)
    if (lotError || !organizationId) {
      logger.error({ lotError, lotId }, 'get_variables_lot_org_lookup_failed')
      return { success: false as const, error: 'No se pudo validar la organización del lote' }
    }

    const { getVariables } = await import('@/lib/services/document-generation.service')
    const result = await getVariables(lotId, organizationId, templateId)
    return { success: true as const, data: result }
  } catch (err) {
    logger.error({ err, lotId, templateId }, 'get_variables_status_failed')
    return { success: false as const, error: 'Error al obtener estado de variables' }
  }
}

export async function setActiveProjectTemplateAction(
  projectId: string,
  templateId: string,
  documentType: string = 'reserva'
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }

  try {
    const { error } = await supabase.from('project_active_templates').upsert(
      {
        project_id: projectId,
        document_type: documentType,
        template_id: templateId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,document_type' }
    )

    if (error) throw error

    revalidatePath('/documentos/plantillas')
    return { success: true as const }
  } catch (err) {
    logger.error({ err, projectId, templateId, documentType }, 'set_active_project_template_failed')
    return {
      success: false as const,
      error: 'Error al establecer plantilla activa para el proyecto',
    }
  }
}

export interface ProjectLegalDataInput {
  dominio_cbr_fojas?: string
  dominio_cbr_numero?: string
  dominio_cbr_ano?: string
  sag_resolucion_numero?: string
  sag_resolucion_ano?: string
  source_document?: string
  review_status?: 'pending' | 'approved' | 'rejected'
}

export async function saveProjectLegalDataAction(
  projectId: string,
  legalData: ProjectLegalDataInput
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false as const, error: 'No autenticado' }

  try {
    // 1. Obtener organización del proyecto para garantizar multi-tenant
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      throw projectError ?? new Error('Proyecto no encontrado')
    }

    // 2. Hacer upsert de project_legal_data sobre project_id con mapeo explícito (allowlist)
    const { error: upsertError } = await supabase.from('project_legal_data').upsert(
      {
        project_id: projectId,
        organization_id: project.organization_id,
        dominio_cbr_fojas: legalData.dominio_cbr_fojas ?? null,
        dominio_cbr_numero: legalData.dominio_cbr_numero ?? null,
        dominio_cbr_ano: legalData.dominio_cbr_ano ?? null,
        sag_resolucion_numero: legalData.sag_resolucion_numero ?? null,
        sag_resolucion_ano: legalData.sag_resolucion_ano ?? null,
        source_document: legalData.source_document ?? null,
        review_status: legalData.review_status ?? 'pending',
        reviewer_id: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' }
    )

    if (upsertError) throw upsertError

    revalidatePath(`/proyectos/${projectId}`)
    return { success: true as const }
  } catch (err) {
    logger.error({ err, projectId }, 'save_project_legal_data_failed')
    return { success: false as const, error: 'Error al guardar los datos legales del proyecto' }
  }
}
