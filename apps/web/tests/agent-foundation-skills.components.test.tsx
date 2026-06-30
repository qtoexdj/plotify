// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ApprovedToolsPicker } from '@/components/dashboard/skills/approved-tools-picker'
import { CustomSkillEditor } from '@/components/dashboard/skills/custom-skill-editor'
import { SkillDetailModal } from '@/components/dashboard/skills/skill-detail-modal'
import { SkillsGrid } from '@/components/dashboard/skills/skills-grid'
import { SkillValidationPanel } from '@/components/dashboard/skills/skill-validation-panel'
import {
  createCustomSkill,
  toggleOrgSkill,
  validateCustomSkill,
} from '@/actions/agent-skills.action'
import type { SkillWithConfig } from '@/types/v2'

vi.mock('@/actions/agent-skills.action', () => ({
  createCustomSkill: vi.fn(),
  publishCustomSkill: vi.fn(),
  toggleOrgSkill: vi.fn(),
  validateCustomSkill: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const ORG_ID = 'org-uuid-1'

function skill(overrides: Partial<SkillWithConfig>): SkillWithConfig {
  return {
    id: 'skill-default',
    slug: 'default_skill',
    name: 'Default Skill',
    description: 'Default description',
    category: 'builtin',
    tool_definition: {},
    approved_tool_slugs: [],
    created_by: null,
    current_version: 1,
    definition_markdown: null,
    is_system: false,
    requires_mcp: false,
    mcp_provider: null,
    organization_id: null,
    requires_role: ['admin'],
    enabled_by_default: false,
    created_at: null,
    updated_at: null,
    updated_by: null,
    validation_errors: [],
    validation_status: 'valid',
    org_config: null,
    mcp_connection_status: null,
    mcp_ready: true,
    mcp_requirement_state: 'none',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SDD 012 US2 SkillsGrid', () => {
  it('renders the stable grid test id and disables mandatory system skill toggles', () => {
    render(
      <SkillsGrid
        organizationId={ORG_ID}
        skills={[
          skill({
            id: 'system-skill',
            slug: 'system_skill',
            name: 'Sistema',
            is_system: true,
            enabled_by_default: true,
          }),
        ]}
      />
    )

    expect(screen.getByTestId('agent-skills-grid')).toBeTruthy()
    expect(screen.getByTestId('skill-card-system_skill')).toBeTruthy()
    expect(screen.getByText('Siempre activa')).toBeTruthy()
    expect((screen.getByTestId('skill-toggle-system_skill') as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('shows custom, version, validation and MCP requirement badges', () => {
    render(
      <SkillsGrid
        organizationId={ORG_ID}
        skills={[
          skill({
            id: 'custom-skill',
            slug: 'custom_helper',
            name: 'Custom Helper',
            category: 'custom',
            current_version: 3,
            validation_status: 'blocked',
            approved_tool_slugs: ['check_lot_availability'],
          }),
          skill({
            id: 'mcp-skill',
            slug: 'drive_helper',
            name: 'Drive Helper',
            category: 'mcp',
            requires_mcp: true,
            mcp_provider: 'google_drive',
            mcp_ready: false,
            mcp_requirement_state: 'pending',
          }),
        ]}
      />
    )

    expect(screen.getByTestId('skill-badge-category-custom_helper').textContent).toContain('Custom')
    expect(screen.getByTestId('skill-badge-version-custom_helper').textContent).toContain('v3')
    expect(screen.getByTestId('skill-badge-validation-custom_helper').textContent).toContain(
      'Revisar'
    )
    expect(screen.getByTestId('skill-badge-tools-custom_helper').textContent).toContain('1 tool')
    expect(screen.getByTestId('skill-badge-mcp-drive_helper').textContent).toContain(
      'Requiere conexión'
    )
    expect((screen.getByTestId('skill-toggle-drive_helper') as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('rolls back optimistic toggle state when the server action reports an error', async () => {
    const user = userEvent.setup()
    let resolveAction: (value: { success: false; error: string }) => void = () => {}
    vi.mocked(toggleOrgSkill).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve
        })
    )

    render(
      <SkillsGrid
        organizationId={ORG_ID}
        skills={[
          skill({
            id: 'custom-skill',
            slug: 'custom_helper',
            name: 'Custom Helper',
            category: 'custom',
            enabled_by_default: false,
          }),
        ]}
      />
    )

    const toggle = screen.getByTestId('skill-toggle-custom_helper')
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    await user.click(toggle)

    expect(toggleOrgSkill).toHaveBeenCalledWith(ORG_ID, 'custom-skill', true)
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))

    resolveAction({ success: false, error: 'No se pudo actualizar el runtime del agente' })

    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
  })
})

describe('SDD 012 US5 MCP skill readiness UI', () => {
  it('shows MCP requirement copy and integration CTA in the skill detail modal', () => {
    render(
      <SkillDetailModal
        organizationId={ORG_ID}
        skill={skill({
          id: 'mcp-skill',
          slug: 'drive_helper',
          name: 'Drive Helper',
          category: 'mcp',
          requires_mcp: true,
          mcp_provider: 'google_drive',
          mcp_ready: false,
          mcp_requirement_state: 'pending',
        })}
        enabled={false}
        onToggle={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const requirement = screen.getByTestId('skill-detail-mcp-requirement')
    expect(requirement.textContent).toContain('Requiere conexión')
    expect(requirement.textContent).toContain('Conecta google_drive')
    expect(screen.getByTestId('skill-detail-mcp-cta').getAttribute('href')).toBe(
      '/agente/integrations'
    )
    expect(
      (screen.getByRole('switch', { name: /Alternar Drive Helper/i }) as HTMLButtonElement).disabled
    ).toBe(true)
  })
})

describe('SDD 012 US3 custom skill components', () => {
  const approvedTools = [
    {
      slug: 'check_lot_availability',
      name: 'Consultar disponibilidad',
      description: 'Consulta lotes asignados',
      roles: ['vendor'],
    },
    {
      slug: 'admin_report',
      name: 'Reporte admin',
      description: 'Resumen interno',
      roles: ['admin'],
    },
  ]

  it('filters approved tools by selected role', () => {
    render(
      <ApprovedToolsPicker
        tools={approvedTools}
        selectedRoles={['vendor']}
        value={[]}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('approved-tools-picker')).toBeTruthy()
    expect(screen.getByTestId('approved-tool-option-check_lot_availability')).toBeTruthy()
    expect(screen.queryByTestId('approved-tool-option-admin_report')).toBeNull()
  })

  it('shows validation errors and warnings with stable test id', () => {
    render(
      <SkillValidationPanel
        validation={{
          status: 'blocked',
          normalized_slug: 'seller_helper',
          approved_tool_slugs: [],
          errors: [
            {
              code: 'unapproved_tool',
              field: 'approved_tool_slugs',
              message: 'La herramienta no esta aprobada.',
            },
          ],
          warnings: ['La skill no declara herramientas aprobadas.'],
        }}
      />
    )

    expect(screen.getByTestId('skill-validation-panel')).toBeTruthy()
    expect(screen.getByText('La herramienta no esta aprobada.')).toBeTruthy()
    expect(screen.getByText('La skill no declara herramientas aprobadas.')).toBeTruthy()
  })

  it('validates and saves a custom markdown skill from the editor', async () => {
    const user = userEvent.setup()
    vi.mocked(validateCustomSkill).mockResolvedValue({
      success: true,
      validation: {
        status: 'valid',
        normalized_slug: 'seller_helper',
        approved_tool_slugs: ['check_lot_availability'],
        errors: [],
        warnings: [],
      },
    })
    vi.mocked(createCustomSkill).mockResolvedValue({
      success: true,
      skill: {
        id: 'custom-skill',
        organization_id: ORG_ID,
        slug: 'seller_helper',
        name: 'Seller Helper',
        description: 'Ayuda a vendedores',
        definition_markdown: '# Seller Helper',
        approved_tool_slugs: ['check_lot_availability'],
        requires_role: ['vendor'],
        current_version: 1,
        validation_status: 'draft',
        validation_errors: [],
        requires_mcp: false,
        mcp_provider: null,
        updated_at: '2026-06-30T00:00:00Z',
      },
    })

    render(<CustomSkillEditor organizationId={ORG_ID} availableTools={approvedTools} />)

    expect(screen.getByTestId('custom-skill-editor')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Nueva skill/i }))

    await user.type(screen.getByTestId('custom-skill-name'), 'Seller Helper')
    await user.type(screen.getByTestId('custom-skill-slug'), 'seller_helper')
    await user.type(screen.getByTestId('custom-skill-description'), 'Ayuda a vendedores')
    await user.click(screen.getByTestId('custom-skill-role-vendor'))
    await user.type(screen.getByTestId('custom-skill-markdown'), '# Seller Helper')
    await user.click(screen.getByTestId('approved-tool-option-check_lot_availability'))
    await user.click(screen.getByTestId('custom-skill-validate'))

    await waitFor(() => expect(validateCustomSkill).toHaveBeenCalled())

    await user.click(screen.getByTestId('custom-skill-save'))

    await waitFor(() =>
      expect(createCustomSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          slug: 'seller_helper',
          name: 'Seller Helper',
          requiresRole: ['vendor'],
          approvedToolSlugs: ['check_lot_availability'],
        })
      )
    )
  })
})
