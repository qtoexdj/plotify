/**
 * FASE 1 — F-v2-1.1 y F-v2-1.3
 * Tests para src/types/supabase.ts y src/types/v2.ts
 *
 * Verifica en tiempo de compilación (expectTypeOf) y en runtime que:
 * - Las 10 tablas v2 están presentes en Database['public']['Tables']
 * - Los tipos derivados en v2.ts tienen la forma correcta
 * - Los tipos compuestos (SkillWithConfig, TemplateWithBlocks, etc.) son válidos
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import type { Database } from '@/types/supabase'
import type {
  SystemPrompt,
  PromptVersion,
  PromptVersionInsert,
  AgentSkill,
  OrgSkillConfig,
  OrgSkillConfigUpsert,
  DocumentBlock,
  DocumentBlockInsert,
  DocumentTemplate,
  DocumentTemplateInsert,
  TemplateBlockItem,
  GeneratedDocument,
  McpConnection,
  AgentCustomInstruction,
  SkillWithConfig,
  TemplateWithBlocks,
  PromptWithActiveVersion,
} from '@/types/v2'

// ─── Tabla: system_prompts ─────────────────────────────────────────────────────
describe('Database["public"]["Tables"]["system_prompts"]', () => {
  it('Row tiene los campos requeridos del plan', () => {
    const sample: Database['public']['Tables']['system_prompts']['Row'] = {
      id: 'uuid-1',
      slug: 'sales_agent',
      name: 'Sales Agent',
      description: 'Agente de ventas',
      category: 'agent',
      created_at: '2026-03-31',
      updated_at: '2026-03-31',
    }
    expect(sample.slug).toBe('sales_agent')
    expect(sample.category).toBe('agent')
  })

  it('Insert permite omitir campos con defaults (id, created_at, category)', () => {
    const insert: Database['public']['Tables']['system_prompts']['Insert'] = {
      slug: 'admin_intelligence',
      name: 'Admin Intelligence',
    }
    expect(insert.slug).toBe('admin_intelligence')
  })
})

// ─── Tabla: prompt_versions ────────────────────────────────────────────────────
describe('Database["public"]["Tables"]["prompt_versions"]', () => {
  it('Row tiene prompt_id (FK), version, is_active y content', () => {
    const sample: Database['public']['Tables']['prompt_versions']['Row'] = {
      id: 'uuid-2',
      prompt_id: 'uuid-1',
      version: 1,
      content: 'Eres un agente de ventas...',
      is_active: true,
      change_note: 'Versión inicial',
      author_id: null,
      tested_at: null,
      created_at: '2026-03-31',
    }
    expect(sample.version).toBe(1)
    expect(sample.is_active).toBe(true)
  })
})

// ─── Tabla: agent_skills ───────────────────────────────────────────────────────
describe('Database["public"]["Tables"]["agent_skills"]', () => {
  it('Row tiene slug, tool_definition, is_system, requires_mcp', () => {
    const sample: Database['public']['Tables']['agent_skills']['Row'] = {
      id: 'skill-1',
      slug: 'search_projects',
      name: 'Search Projects',
      description: 'Busca proyectos disponibles',
      category: 'builtin',
      tool_definition: { name: 'search_projects', description: 'Busca proyectos', parameters: {} },
      is_system: true,
      requires_mcp: false,
      mcp_provider: null,
      requires_role: ['admin', 'user'],
      enabled_by_default: true,
      created_at: null,
    }
    expect(sample.slug).toBe('search_projects')
    expect(sample.is_system).toBe(true)
  })
})

// ─── Tabla: org_skill_configs ──────────────────────────────────────────────────
describe('Database["public"]["Tables"]["org_skill_configs"]', () => {
  it('Row tiene organization_id, skill_id, enabled, config_overrides', () => {
    const sample: Database['public']['Tables']['org_skill_configs']['Row'] = {
      id: 'config-1',
      organization_id: 'org-1',
      skill_id: 'skill-1',
      enabled: false,
      enabled_by: 'user-1',
      config_overrides: { max_results: 5 },
      created_at: null,
      updated_at: null,
    }
    expect(sample.enabled).toBe(false)
  })
})

// ─── Tabla: mcp_connections ────────────────────────────────────────────────────
describe('Database["public"]["Tables"]["mcp_connections"]', () => {
  it('Row tiene provider, credentials_encrypted, status y user_id', () => {
    const sample: Database['public']['Tables']['mcp_connections']['Row'] = {
      id: 'mcp-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      provider: 'google_drive',
      display_name: 'Mi Google Drive',
      credentials_encrypted: 'cipher-text',
      status: 'active',
      scopes: ['drive.readonly'],
      server_url: null,
      last_health_check: null,
      last_error: null,
      created_at: null,
      updated_at: null,
    }
    expect(sample.provider).toBe('google_drive')
    expect(sample.status).toBe('active')
  })
})

// ─── Tabla: document_blocks ────────────────────────────────────────────────────
describe('Database["public"]["Tables"]["document_blocks"]', () => {
  it('Row tiene content, variables (array) y tags (array)', () => {
    const sample: Database['public']['Tables']['document_blocks']['Row'] = {
      id: 'block-1',
      organization_id: 'org-1',
      name: 'Encabezado comprador',
      category: 'encabezado',
      content: 'Don/Doña {{comprador_nombre}}, RUT {{comprador_rut}}',
      variables: ['comprador_nombre', 'comprador_rut'],
      tags: ['reserva', 'escritura'],
      is_active: true,
      version: 1,
      created_by: null,
      created_at: null,
      updated_at: null,
    }
    expect(sample.variables).toContain('comprador_nombre')
    expect(sample.tags).toContain('reserva')
  })
})

// ─── Tabla: document_templates ─────────────────────────────────────────────────
describe('Database["public"]["Tables"]["document_templates"]', () => {
  it('Row tiene document_type, header_config y page_config', () => {
    const sample: Database['public']['Tables']['document_templates']['Row'] = {
      id: 'tmpl-1',
      organization_id: 'org-1',
      name: 'Escritura de compraventa',
      document_type: 'escritura',
      description: 'Template oficial',
      header_config: { logo_url: 'http://example.com/logo.png', notaria: 'Notaría Central' },
      footer_config: null,
      page_config: { size: 'A4', margins: { top: 20 } },
      is_default: true,
      created_by: null,
      created_at: null,
      updated_at: null,
    }
    expect(sample.document_type).toBe('escritura')
  })
})

// ─── Tabla: template_block_items ───────────────────────────────────────────────
describe('Database["public"]["Tables"]["template_block_items"]', () => {
  it('Row tiene template_id, block_id, position, is_optional y condition_field', () => {
    const sample: Database['public']['Tables']['template_block_items']['Row'] = {
      id: 'item-1',
      template_id: 'tmpl-1',
      block_id: 'block-1',
      position: 1,
      is_optional: false,
      condition_field: null,
      overrides: null,
    }
    expect(sample.position).toBe(1)
    expect(sample.is_optional).toBe(false)
  })
})

// ─── Tabla: generated_documents ────────────────────────────────────────────────
describe('Database["public"]["Tables"]["generated_documents"]', () => {
  it('Row tiene variables_snapshot, file_url y file_format', () => {
    const sample: Database['public']['Tables']['generated_documents']['Row'] = {
      id: 'doc-1',
      organization_id: 'org-1',
      template_id: 'tmpl-1',
      document_type: 'escritura',
      file_url: '/documents/org-1/escritura/2026-03-31.pdf',
      file_format: 'pdf',
      variables_snapshot: { comprador_nombre: 'Pedro Soto', valor_lote: 5000000 },
      lot_id: 'lot-1',
      lot_record_id: null,
      generated_by: 'user-1',
      created_at: null,
    }
    expect(sample.file_format).toBe('pdf')
    expect(sample.variables_snapshot).toHaveProperty('comprador_nombre')
  })
})

// ─── Tabla: agent_custom_instructions ─────────────────────────────────────────
describe('Database["public"]["Tables"]["agent_custom_instructions"]', () => {
  it('Row tiene instructions, organization_id, user_id e is_active', () => {
    const sample: Database['public']['Tables']['agent_custom_instructions']['Row'] = {
      id: 'instr-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      instructions: 'Respóndeme siempre formal. Firma como Equipo Plotify.',
      is_active: true,
      created_at: null,
      updated_at: null,
    }
    expect(sample.instructions).toContain('formal')
  })
})

// ─── Tipos derivados en src/types/v2.ts ───────────────────────────────────────
describe('src/types/v2.ts — tipos derivados', () => {
  it('SystemPrompt es un alias de Database[...system_prompts][Row]', () => {
    const p: SystemPrompt = {
      id: 'uuid',
      slug: 'sales_agent',
      name: 'Sales Agent',
      description: null,
      category: 'agent',
      created_at: null,
      updated_at: null,
    }
    expectTypeOf(p).toHaveProperty('slug')
    expectTypeOf(p).toHaveProperty('category')
  })

  it('PromptVersionInsert puede omitir id y campos opcionales', () => {
    const insert: PromptVersionInsert = {
      prompt_id: 'uuid-1',
      version: 2,
      content: 'Nuevo contenido del prompt',
    }
    expect(insert.version).toBe(2)
  })

  it('OrgSkillConfigUpsert permite omitir id para upsert', () => {
    const upsert: OrgSkillConfigUpsert = {
      organization_id: 'org-1',
      skill_id: 'skill-1',
      enabled: true,
    }
    expect(upsert.enabled).toBe(true)
  })

  it('SkillWithConfig extiende AgentSkill con org_config opcional', () => {
    const skill: SkillWithConfig = {
      id: 'skill-1',
      slug: 'search_projects',
      name: 'Search Projects',
      description: 'Busca proyectos',
      category: 'builtin',
      tool_definition: {},
      is_system: true,
      requires_mcp: false,
      mcp_provider: null,
      requires_role: null,
      enabled_by_default: true,
      created_at: null,
      org_config: {
        id: 'cfg-1',
        organization_id: 'org-1',
        skill_id: 'skill-1',
        enabled: true,
        enabled_by: null,
        config_overrides: null,
        created_at: null,
        updated_at: null,
      },
    }
    expect(skill.slug).toBe('search_projects')
    expect(skill.org_config?.enabled).toBe(true)
    expectTypeOf(skill).toHaveProperty('org_config')
  })

  it('SkillWithConfig permite org_config: null (skill sin configuración de org)', () => {
    const skill: SkillWithConfig = {
      id: 'skill-2',
      slug: 'check_lot_availability',
      name: 'Check Availability',
      description: 'Verifica disponibilidad',
      category: 'builtin',
      tool_definition: {},
      is_system: true,
      requires_mcp: false,
      mcp_provider: null,
      requires_role: null,
      enabled_by_default: true,
      created_at: null,
      org_config: null,
    }
    expect(skill.org_config).toBeNull()
  })

  it('PromptWithActiveVersion extiende SystemPrompt con active_version opcional', () => {
    const prompt: PromptWithActiveVersion = {
      id: 'uuid-1',
      slug: 'sales_agent',
      name: 'Sales Agent',
      description: null,
      category: 'agent',
      created_at: null,
      updated_at: null,
      active_version: {
        id: 'v-1',
        prompt_id: 'uuid-1',
        version: 3,
        content: 'Contenido activo',
        is_active: true,
        change_note: 'Mejoras tonoscomunicación',
        author_id: 'user-1',
        tested_at: null,
        created_at: null,
      },
    }
    expect(prompt.active_version?.version).toBe(3)
    expectTypeOf(prompt).toHaveProperty('active_version')
  })

  it('DocumentBlockInsert requiere campos obligatorios: name, category, content, organization_id', () => {
    const insert: DocumentBlockInsert = {
      name: 'Cláusula precio',
      category: 'legal',
      content: 'El precio acordado es de {{valor_lote}} UF',
      organization_id: 'org-1',
    }
    expect(insert.name).toBe('Cláusula precio')
    expect(insert.content).toContain('valor_lote')
  })

  it('TemplateWithBlocks tiene blocks como array con block anidado', () => {
    const template: TemplateWithBlocks = {
      id: 'tmpl-1',
      organization_id: 'org-1',
      name: 'Escritura',
      document_type: 'escritura',
      description: null,
      header_config: null,
      footer_config: null,
      page_config: null,
      is_default: false,
      created_by: null,
      created_at: null,
      updated_at: null,
      blocks: [
        {
          id: 'item-1',
          template_id: 'tmpl-1',
          block_id: 'block-1',
          position: 1,
          is_optional: false,
          condition_field: null,
          overrides: null,
          block: {
            id: 'block-1',
            organization_id: 'org-1',
            name: 'Encabezado',
            category: 'encabezado',
            content: 'Don {{nombre}}',
            variables: ['nombre'],
            tags: null,
            is_active: true,
            version: 1,
            created_by: null,
            created_at: null,
            updated_at: null,
          },
        },
      ],
    }
    expect(template.blocks).toHaveLength(1)
    expect(template.blocks[0].block.name).toBe('Encabezado')
    expectTypeOf(template).toHaveProperty('blocks')
  })
})
