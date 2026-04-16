import type { Database } from './supabase'

// ─── Prompt Ops ───────────────────────────────────────────────────────────────
export type SystemPrompt = Database['public']['Tables']['system_prompts']['Row']
export type PromptVersion = Database['public']['Tables']['prompt_versions']['Row']
export type PromptVersionInsert = Database['public']['Tables']['prompt_versions']['Insert']

// ─── Skills ───────────────────────────────────────────────────────────────────
export type AgentSkill = Database['public']['Tables']['agent_skills']['Row']
export type OrgSkillConfig = Database['public']['Tables']['org_skill_configs']['Row']
export type OrgSkillConfigUpsert = Database['public']['Tables']['org_skill_configs']['Insert']

// ─── Documents ────────────────────────────────────────────────────────────────
export type DocumentBlock = Database['public']['Tables']['document_blocks']['Row']
export type DocumentBlockInsert = Database['public']['Tables']['document_blocks']['Insert']
export type DocumentTemplate = Database['public']['Tables']['document_templates']['Row']
export type DocumentTemplateInsert = Database['public']['Tables']['document_templates']['Insert']
export type TemplateBlockItem = Database['public']['Tables']['template_block_items']['Row']
export type GeneratedDocument = Database['public']['Tables']['generated_documents']['Row']

// ─── MCP Integrations ─────────────────────────────────────────────────────────
export type McpConnection = Database['public']['Tables']['mcp_connections']['Row']

// ─── Agent Settings ───────────────────────────────────────────────────────────
export type AgentCustomInstruction = Database['public']['Tables']['agent_custom_instructions']['Row']

// ─── Utility / Composed Types ─────────────────────────────────────────────────
export type SkillWithConfig = AgentSkill & {
  org_config?: OrgSkillConfig | null
}

export type TemplateWithBlocks = DocumentTemplate & {
  blocks: (TemplateBlockItem & { block: DocumentBlock })[]
}

export type PromptWithActiveVersion = SystemPrompt & {
  active_version?: PromptVersion | null
}
