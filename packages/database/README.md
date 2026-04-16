# Plotify Database

This package is the canonical home for Plotify Supabase database artifacts.

## Local infrastructure

Use the existing shared Docker containers. Do not run `supabase start` from this
repo unless a task explicitly asks to create a separate stack.

Expected existing services:

- Supabase gateway: `supabase-kong` at `http://127.0.0.1:8000`.
- Supabase database/pooler: `supabase-db` and `supabase-pooler`.
- Redis for the Python microservice: container `redis` at
  `redis://localhost:6379/0`.

Runtime credentials are owned by the app `.env` files:

- `apps/web/.env`
- `apps/api/.env`

Do not copy real Supabase keys or Redis/Postgres credentials into this README.

## Canonical source

Use only:

```text
packages/database/supabase/migrations
```

Do not create new migrations under:

```text
apps/web/supabase/migrations
apps/api/supabase/migrations
```

The previous migration folders were removed after validating the canonical
baseline from a clean reset. Their history remains available in git.

## Current implementation status

The canonical baseline was generated from the validated local database on
2026-04-14 and validated with Supabase CLI from this package.

Implemented in this package:

- `20260414000100_baseline_local_validated.sql`: schema-only baseline plus
  deterministic storage buckets and storage policies.
- `20260414000200_fix_security_definer_search_path.sql`: explicit hardening for
  SECURITY DEFINER functions.
- `20260414000300_add_missing_fk_indexes.sql`: covering indexes for FK advisor
  warnings.
- `types/database.generated.ts`: TypeScript types generated from the canonical
  local Supabase database.

The baseline must not include business/demo data, generated documents, MCP
credentials, leads, lots, projects, geometries, or audit logs.

## Verification commands

First verify that this package is still the only migration source:

```bash
npm --prefix packages/database run verify:migrations
```

These commands target the existing database. `db reset` is destructive and must
only be run after explicit confirmation:

- `supabase db reset --no-seed`
- `supabase db reset`
- `supabase migration list --local`
- `supabase db dump --local -f /tmp/plotify_post_reset.sql`
- `supabase db lint --local`

Generate TypeScript types from the existing configured database:

```bash
supabase gen types typescript --db-url "$SUPABASE_DB_URL" --schema public > types/database.generated.ts
```

When running the command manually, source `SUPABASE_DB_URL` from
`apps/api/.env` or export the same value in the shell. Do not generate types
into `apps/web/src/types/supabase.ts`; that file is only a wrapper.

Validation completed on 2026-04-14. The only remaining lint warning is
non-blocking PL/pgSQL dead code in `public.approve_reservation`
(`v_lot` is declared but never read).

## TypeScript consumers

The Next.js app keeps its stable import path at `apps/web/src/types/supabase.ts`,
but that file only re-exports the canonical generated types from this package.
New code should treat `packages/database/types/database.generated.ts` as the
source of truth for Supabase table, enum, function and relationship types.
