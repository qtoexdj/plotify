-- Add covering indexes for foreign keys reported by Supabase performance
-- advisors. Index names are deterministic and use IF NOT EXISTS so the
-- migration remains safe on databases where some indexes were added manually.

CREATE INDEX IF NOT EXISTS idx_agent_custom_instructions_user_id
  ON public.agent_custom_instructions (user_id);

CREATE INDEX IF NOT EXISTS idx_approval_requests_organization_id
  ON public.approval_requests (organization_id);

CREATE INDEX IF NOT EXISTS idx_approval_requests_vendor_id
  ON public.approval_requests (vendor_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id
  ON public.audit_logs (organization_id);

CREATE INDEX IF NOT EXISTS idx_document_blocks_created_by
  ON public.document_blocks (created_by);

CREATE INDEX IF NOT EXISTS idx_document_templates_created_by
  ON public.document_templates (created_by);

CREATE INDEX IF NOT EXISTS idx_generated_documents_generated_by
  ON public.generated_documents (generated_by);

CREATE INDEX IF NOT EXISTS idx_generated_documents_lot_record_id
  ON public.generated_documents (lot_record_id);

CREATE INDEX IF NOT EXISTS idx_generated_documents_template_id
  ON public.generated_documents (template_id);

CREATE INDEX IF NOT EXISTS idx_leads_organization_id
  ON public.leads (organization_id);

CREATE INDEX IF NOT EXISTS idx_lots_vendedor_id_project_id
  ON public.lots (vendedor_id, project_id);

CREATE INDEX IF NOT EXISTS idx_mcp_connections_user_id
  ON public.mcp_connections (user_id);

CREATE INDEX IF NOT EXISTS idx_org_skill_configs_enabled_by
  ON public.org_skill_configs (enabled_by);

CREATE INDEX IF NOT EXISTS idx_org_skill_configs_skill_id
  ON public.org_skill_configs (skill_id);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id
  ON public.organization_members (user_id);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_author_id
  ON public.prompt_versions (author_id);

CREATE INDEX IF NOT EXISTS idx_telegram_bots_created_by
  ON public.telegram_bots (created_by);

CREATE INDEX IF NOT EXISTS idx_template_block_items_block_id
  ON public.template_block_items (block_id);

CREATE INDEX IF NOT EXISTS idx_vendors_organization_id_user_id
  ON public.vendors (organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_vendors_owner_id
  ON public.vendors (owner_id);
