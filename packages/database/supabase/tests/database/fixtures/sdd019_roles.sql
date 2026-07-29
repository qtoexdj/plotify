begin;

-- Transaction-local identities for SDD019 pgTAP tests. UUIDs are deterministic
-- fixtures only; they are not credentials nor production principals.
create temp table sdd019_roles (
  fixture_key text primary key,
  user_id uuid not null,
  organization_id uuid not null,
  role text not null
) on commit drop;

insert into sdd019_roles (fixture_key, user_id, organization_id, role)
values
  ('admin_a', '00000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'admin'),
  ('seller_assigned', '00000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a1', 'seller'),
  ('seller_unassigned', '00000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-0000000000a1', 'seller'),
  ('org_b', '00000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b1', 'admin'),
  ('superadmin', '00000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000a1', 'superadmin'),
  ('service_role', '00000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000a1', 'service_role');
