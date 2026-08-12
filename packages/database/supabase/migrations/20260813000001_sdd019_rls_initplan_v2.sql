-- Migration: 20260813000001_sdd019_rls_initplan_v2.sql
-- SDD 019: RLS InitPlan v2 — envolver auth.uid() / auth.role() en (select ...) en 28 políticas residuales.
--
-- Las migraciones 20260812220304 y 20260812222206 cubrieron 19 instancias críticas del plan T-CPU-01.
-- Supabase Advisors reportaba 28 instancias residuales con `auth_rls_initplan` en dominios auth/org/
-- vendor/perfiles/agent_skills. Esta migración completa el cleanup.
--
-- Estrategia: ALTER POLICY preservando cmd/role. Solo se reescriben las cláusulas (USING/WITH CHECK)
-- que contienen auth.uid() o auth.role() sin wrapper. En SQL:
--   auth.uid()    -> (select auth.uid())
--   auth.role()   -> (select auth.role())
--   (auth.uid())::text -> ((select auth.uid()))::text
--
-- Idempotente: ALTER POLICY es seguro; el plan de ejecución cambia (InitPlan 1x por query vs Nx por fila),
-- la semántica es idéntica.

-- ============================================================================
-- A. Agent / MCP / Custom Instructions (4)
-- ============================================================================
ALTER POLICY own_instructions ON public.agent_custom_instructions
  USING (user_id = (select auth.uid()));

ALTER POLICY agent_skill_versions_org_read ON public.agent_skill_versions
  USING (((organization_id IS NULL) AND ((select auth.role()) = 'authenticated'::text))
      OR ((organization_id IS NOT NULL) AND is_org_user(organization_id)));

ALTER POLICY agent_skills_global_read ON public.agent_skills
  USING ((organization_id IS NULL) AND ((select auth.role()) = 'authenticated'::text));

ALTER POLICY own_connections ON public.mcp_connections
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- B. Approval requests (2)
-- ============================================================================
ALTER POLICY org_members_can_insert_approvals ON public.approval_requests
  WITH CHECK (organization_id IN (
    SELECT om.organization_id FROM organization_members om
    WHERE om.user_id = (select auth.uid())
  ));

ALTER POLICY org_members_can_view_approvals ON public.approval_requests
  USING (organization_id IN (
    SELECT organization_members.organization_id FROM organization_members
    WHERE organization_members.user_id = (select auth.uid())
  ));

-- ============================================================================
-- C. Audit logs (4)
-- ============================================================================
ALTER POLICY audit_logs_insert ON public.audit_logs
  WITH CHECK (actor = ((select auth.uid()))::text);

ALTER POLICY audit_logs_select ON public.audit_logs
  USING (actor = ((select auth.uid()))::text);

ALTER POLICY org_admins_read_audit ON public.audit_logs
  USING (organization_id IN (
    SELECT organization_members.organization_id FROM organization_members
    WHERE organization_members.user_id = (select auth.uid())
      AND organization_members.role = 'admin'::org_role
  ));

ALTER POLICY org_members_insert_audit ON public.audit_logs
  WITH CHECK (organization_id IN (
    SELECT organization_members.organization_id FROM organization_members
    WHERE organization_members.user_id = (select auth.uid())
  ));

-- ============================================================================
-- D. Leads (1)
-- ============================================================================
ALTER POLICY "Leads are viewable by everyone in the organization" ON public.leads
  USING (organization_id IN (
    SELECT organization_members.organization_id FROM organization_members
    WHERE organization_members.user_id = (select auth.uid())
  ));

-- ============================================================================
-- E. Lot records (2)
-- ============================================================================
ALTER POLICY lot_records_select ON public.lot_records
  USING (
    is_project_admin((SELECT l.project_id FROM lots l WHERE l.id = lot_records.lot_id))
    OR (EXISTS (
      SELECT 1 FROM (lots l JOIN vendors v ON v.id = l.vendedor_id)
      WHERE l.id = lot_records.lot_id AND v.user_id = (select auth.uid())
    ))
  );

ALTER POLICY lot_records_update ON public.lot_records
  USING (
    is_project_admin((SELECT l.project_id FROM lots l WHERE l.id = lot_records.lot_id))
    OR (EXISTS (
      SELECT 1 FROM (lots l JOIN vendors v ON v.id = l.vendedor_id)
      WHERE l.id = lot_records.lot_id AND v.user_id = (select auth.uid())
    ))
  )
  WITH CHECK (
    is_project_admin((SELECT l.project_id FROM lots l WHERE l.id = lot_records.lot_id))
    OR (EXISTS (
      SELECT 1 FROM (lots l JOIN vendors v ON v.id = l.vendedor_id)
      WHERE l.id = lot_records.lot_id AND v.user_id = (select auth.uid())
    ))
  );

-- ============================================================================
-- F. Organization members / payment info (4)
-- ============================================================================
ALTER POLICY org_members_insert ON public.organization_members
  WITH CHECK (
    ((user_id = (select auth.uid())) AND (role = 'admin'::org_role)
      AND (EXISTS (
        SELECT 1 FROM organizations o
        WHERE o.id = organization_members.organization_id AND o.created_by = (select auth.uid())
      )))
    OR is_org_admin(organization_id)
  );

ALTER POLICY org_members_select ON public.organization_members
  USING ((user_id = (select auth.uid())) OR is_org_admin(organization_id));

ALTER POLICY org_admins_write_payment_info ON public.organization_payment_info
  USING (organization_id IN (
    SELECT organization_members.organization_id FROM organization_members
    WHERE organization_members.user_id = (select auth.uid())
      AND organization_members.role = 'admin'::org_role
  ));

ALTER POLICY org_members_read_payment_info ON public.organization_payment_info
  USING (organization_id IN (
    SELECT organization_members.organization_id FROM organization_members
    WHERE organization_members.user_id = (select auth.uid())
  ));

-- ============================================================================
-- G. Organizations (4)
-- ============================================================================
ALTER POLICY organizations_delete ON public.organizations
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = (select auth.uid())
      AND om.role = 'admin'::org_role
  ));

ALTER POLICY organizations_insert ON public.organizations
  WITH CHECK (created_by = (select auth.uid()));

ALTER POLICY organizations_select ON public.organizations
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organizations.id AND om.user_id = (select auth.uid())
  ));

ALTER POLICY organizations_update ON public.organizations
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = (select auth.uid())
      AND om.role = 'admin'::org_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = (select auth.uid())
      AND om.role = 'admin'::org_role
  ));

-- ============================================================================
-- H. Profiles (3)
-- ============================================================================
ALTER POLICY profiles_insert ON public.profiles
  WITH CHECK (is_super_admin() OR ((select auth.uid()) = id AND is_super_admin IS NOT TRUE));

ALTER POLICY profiles_select ON public.profiles
  USING (((select auth.uid()) = id) OR is_super_admin());

ALTER POLICY profiles_select_org_members ON public.profiles
  USING (EXISTS (
    SELECT 1
    FROM (organization_members my_membership
      JOIN organization_members their_membership ON my_membership.organization_id = their_membership.organization_id)
    WHERE my_membership.user_id = (select auth.uid())
      AND their_membership.user_id = profiles.id
  ));

-- ============================================================================
-- I. Telegram bots (1)
-- ============================================================================
ALTER POLICY "Members can view their organization's bot" ON public.telegram_bots
  USING (EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_members.organization_id = telegram_bots.organization_id
      AND organization_members.user_id = (select auth.uid())
  ));

-- ============================================================================
-- J. Vendors / vendor_projects (3)
-- ============================================================================
ALTER POLICY vendor_projects_select ON public.vendor_projects
  USING (
    is_project_admin(project_id)
    OR (EXISTS (
      SELECT 1 FROM vendors v
      WHERE v.id = vendor_projects.vendor_id AND v.user_id = (select auth.uid())
    ))
  );

ALTER POLICY vendors_select ON public.vendors
  USING (is_org_admin(organization_id) OR (user_id = (select auth.uid())));

ALTER POLICY vendors_update ON public.vendors
  USING (is_org_admin(organization_id) OR (user_id = (select auth.uid())));