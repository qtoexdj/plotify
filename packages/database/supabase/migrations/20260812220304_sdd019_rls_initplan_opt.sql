-- SDD 019 (post-hardening, recursos cloud): reducir el costo de evaluación
-- RLS por fila y eliminar un índice duplicado.
--
-- Supabase reporta "exhausting multiple resources" (CPU del tier gratuito).
-- Los advisors señalan 33 políticas con el patrón `auth_rls_initplan`:
-- `auth.uid()` se re-evalúa por cada fila en vez de una sola vez por query.
-- El remedio documentado es envolverlo en un subselect: `(select auth.uid())`.
--
-- También se elimina `approval_requests_vendor_idempotency_uidx`, idéntico a
-- `approval_requests_org_vendor_idempotency_key_key` (misma tripla
-- organization_id, vendor_id, idempotency_key): doble mantenimiento de
-- escritura sin beneficio de lectura.

-- 1. Helpers RLS: auth.uid() -> (select auth.uid()) (initplan por query)
create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = org_id
      and user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce((
    select is_super_admin
    from public.profiles
    where id = (select auth.uid())
  ), false);
$$;

create or replace function public.is_project_vendor(target_project_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.vendor_projects vp
    join public.vendors v on v.id = vp.vendor_id
    join public.projects p on p.id = vp.project_id
    where vp.project_id = target_project_id
      and v.user_id = (select auth.uid())
      and v.active
      and v.organization_id = p.organization_id
  );
$$;

-- 2. Políticas directas con auth.uid() por fila
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to public
using (((select auth.uid()) = id) or is_super_admin())
with check (is_super_admin() or (((select auth.uid()) = id) and (is_super_admin is not true)));

drop policy if exists notification_events_vendor_update on public.notification_events;
create policy notification_events_vendor_update on public.notification_events for update to public
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

-- 3. Índice duplicado
drop index if exists public.approval_requests_vendor_idempotency_uidx;
