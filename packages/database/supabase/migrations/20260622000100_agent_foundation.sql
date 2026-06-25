-- SDD 012: agent foundation.
-- Skills become scoped, markdown-backed, versionable runtime records.

ALTER TABLE public.agent_skills
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS definition_markdown text,
  ADD COLUMN IF NOT EXISTS approved_tool_slugs text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.agent_skills
  DROP CONSTRAINT IF EXISTS agent_skills_slug_key,
  DROP CONSTRAINT IF EXISTS agent_skills_scope_check,
  DROP CONSTRAINT IF EXISTS agent_skills_validation_status_check,
  DROP CONSTRAINT IF EXISTS agent_skills_custom_definition_check,
  DROP CONSTRAINT IF EXISTS agent_skills_mcp_provider_check;

ALTER TABLE public.agent_skills
  ADD CONSTRAINT agent_skills_validation_status_check
    CHECK (validation_status = ANY (ARRAY['draft'::text, 'valid'::text, 'blocked'::text])),
  ADD CONSTRAINT agent_skills_scope_check
    CHECK (
      (category <> 'custom'::text OR organization_id IS NOT NULL)
      AND (is_system IS NOT TRUE OR organization_id IS NULL)
    ),
  ADD CONSTRAINT agent_skills_custom_definition_check
    CHECK (
      category <> 'custom'::text
      OR definition_markdown IS NOT NULL
    ),
  ADD CONSTRAINT agent_skills_mcp_provider_check
    CHECK (requires_mcp IS NOT TRUE OR mcp_provider IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_global_slug_key
  ON public.agent_skills (slug)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_org_slug_key
  ON public.agent_skills (organization_id, slug)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_skills_organization_id
  ON public.agent_skills (organization_id);

CREATE INDEX IF NOT EXISTS idx_agent_skills_validation_status
  ON public.agent_skills (validation_status);

CREATE TABLE IF NOT EXISTS public.agent_skill_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id uuid NOT NULL REFERENCES public.agent_skills(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  definition_markdown text NOT NULL,
  tool_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_tool_slugs text[] NOT NULL DEFAULT '{}'::text[],
  requires_role text[] NOT NULL DEFAULT '{}'::text[],
  validation_status text NOT NULL DEFAULT 'draft',
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  change_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_skill_versions_status_check
    CHECK (validation_status = ANY (ARRAY[
      'draft'::text,
      'valid'::text,
      'blocked'::text,
      'published'::text,
      'superseded'::text
    ])),
  CONSTRAINT agent_skill_versions_version_positive_check CHECK (version > 0),
  CONSTRAINT agent_skill_versions_skill_version_key UNIQUE (skill_id, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_skill_versions_skill_id
  ON public.agent_skill_versions (skill_id);

CREATE INDEX IF NOT EXISTS idx_agent_skill_versions_organization_id
  ON public.agent_skill_versions (organization_id);

ALTER TABLE public.agent_skill_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_read ON public.agent_skills;
DROP POLICY IF EXISTS agent_skills_global_read ON public.agent_skills;
DROP POLICY IF EXISTS agent_skills_org_read ON public.agent_skills;
DROP POLICY IF EXISTS agent_skills_org_admin_write ON public.agent_skills;

CREATE POLICY agent_skills_global_read
  ON public.agent_skills
  FOR SELECT
  USING (organization_id IS NULL AND auth.role() = 'authenticated'::text);

CREATE POLICY agent_skills_org_read
  ON public.agent_skills
  FOR SELECT
  USING (organization_id IS NOT NULL AND public.is_org_user(organization_id));

CREATE POLICY agent_skills_org_admin_write
  ON public.agent_skills
  FOR ALL
  USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

DROP POLICY IF EXISTS agent_skill_versions_org_read ON public.agent_skill_versions;
DROP POLICY IF EXISTS agent_skill_versions_org_admin_write ON public.agent_skill_versions;
DROP POLICY IF EXISTS agent_skill_versions_super_admin_write ON public.agent_skill_versions;

CREATE POLICY agent_skill_versions_org_read
  ON public.agent_skill_versions
  FOR SELECT
  USING (
    (organization_id IS NULL AND auth.role() = 'authenticated'::text)
    OR (organization_id IS NOT NULL AND public.is_org_user(organization_id))
  );

CREATE POLICY agent_skill_versions_org_admin_write
  ON public.agent_skill_versions
  FOR ALL
  USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

CREATE POLICY agent_skill_versions_super_admin_write
  ON public.agent_skill_versions
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_skill_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_skill_versions TO service_role;

COMMENT ON COLUMN public.agent_skills.organization_id IS
  'NULL for global/system skills; set for organization-scoped custom skills.';
COMMENT ON COLUMN public.agent_skills.definition_markdown IS
  'Markdown definition used by the runtime prompt for builtin/custom skills.';
COMMENT ON COLUMN public.agent_skills.approved_tool_slugs IS
  'Allowlisted tool slugs a custom skill may use.';
COMMENT ON TABLE public.agent_skill_versions IS
  'Immutable snapshots for markdown-backed agent skills.';
