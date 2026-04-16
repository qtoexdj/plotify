import { createClient } from '@/lib/supabase/server'
import type {
  DocumentBlock, DocumentBlockInsert,
  DocumentTemplate, DocumentTemplateInsert,
  TemplateBlockItem, TemplateWithBlocks,
  GeneratedDocument,
} from '@/types/v2'

// ─── BLOQUES ─────────────────────────────────────────────────────────────────

export async function listBlocks(organizationId: string): Promise<DocumentBlock[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('document_blocks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('category')
    .order('name')
  return data ?? []
}

export async function getBlock(blockId: string): Promise<DocumentBlock | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('document_blocks')
    .select('*')
    .eq('id', blockId)
    .single()
  return data
}

export async function createBlock(block: DocumentBlockInsert): Promise<DocumentBlock> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_blocks')
    .insert(block)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBlock(
  blockId: string,
  updates: Partial<Omit<DocumentBlock, 'id' | 'organization_id' | 'created_at'>>
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('document_blocks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', blockId)
  if (error) throw error
}

export async function softDeleteBlock(blockId: string): Promise<void> {
  const supabase = await createClient()
  // Soft delete: mantiene integridad referencial con template_block_items ON DELETE RESTRICT
  const { error } = await supabase
    .from('document_blocks')
    .update({ is_active: false })
    .eq('id', blockId)
  if (error) throw error
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────

export async function listTemplates(organizationId: string): Promise<DocumentTemplate[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('document_templates')
    .select('*')
    .eq('organization_id', organizationId)
    .order('document_type')
    .order('name')
  return data ?? []
}

export async function getTemplateWithBlocks(templateId: string): Promise<TemplateWithBlocks> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_templates')
    .select(`
      *,
      blocks:template_block_items(
        *,
        block:document_blocks(*)
      )
    `)
    .eq('id', templateId)
    .order('position', { referencedTable: 'template_block_items' })
    .single()
  if (error) throw error
  return data as TemplateWithBlocks
}

export async function createTemplate(template: DocumentTemplateInsert): Promise<DocumentTemplate> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('document_templates')
    .insert(template)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function saveTemplateBlocks(
  templateId: string,
  items: Array<{
    block_id: string
    position: number
    is_optional: boolean
    condition_field?: string | null
  }>
): Promise<void> {
  const supabase = await createClient()
  // Borrar items existentes y reinsertar (operación idempotente)
  await supabase.from('template_block_items').delete().eq('template_id', templateId)
  if (items.length > 0) {
    const { error } = await supabase
      .from('template_block_items')
      .insert(items.map(item => ({ ...item, template_id: templateId })))
    if (error) throw error
  }
}

// ─── DOCUMENTOS GENERADOS ─────────────────────────────────────────────────────

export async function listGeneratedDocs(
  organizationId: string,
  filters?: { lotId?: string; documentType?: string }
): Promise<GeneratedDocument[]> {
  const supabase = await createClient()
  let query = supabase
    .from('generated_documents')
    .select('*, document_templates(name, document_type)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (filters?.lotId) query = query.eq('lot_id', filters.lotId)
  if (filters?.documentType) query = query.eq('document_type', filters.documentType)

  const { data } = await query
  return (data ?? []) as GeneratedDocument[]
}
