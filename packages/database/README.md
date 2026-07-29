# Plotify Database

This package is the canonical home for Plotify Supabase database artifacts.

## Cloud database authority

Plotify uses only the linked Supabase cloud project `swkrnjdpnlrgxgotmfxy`.
Docker and a local Supabase stack are not part of this repository's workflow.
Never run `supabase start`, `supabase db reset --local`, or any command that
targets a local database.

Database inspection uses the Supabase MCP. Migrations, pgTAP tests, schema
fingerprints, inventories, and generated types use the linked cloud target.

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

The canonical baseline is historical; the current schema authority is the
linked cloud project plus the canonical migration history in this package.

Implemented in this package:

- `20260414000100_baseline_local_validated.sql`: schema-only baseline plus
  deterministic storage buckets and storage policies.
- `20260414000200_fix_security_definer_search_path.sql`: explicit hardening for
  SECURITY DEFINER functions.
- `20260414000300_add_missing_fk_indexes.sql`: covering indexes for FK advisor
  warnings.
- `types/database.generated.ts`: TypeScript types generated from the linked
  Supabase cloud project.

The baseline must not include business/demo data, generated documents, MCP
credentials, leads, lots, projects, geometries, or audit logs.

## Verification commands

First verify that this package is still the only migration source:

```bash
npm --prefix packages/database run verify:migrations
```

Run database tests only against the linked cloud project; pgTAP suites wrap
their assertions in transactions and roll back their fixtures:

```bash
pnpm --filter @plotify/database test:db:linked
```

Generate TypeScript types from the existing configured database:

```bash
pnpm --filter @plotify/database types:generate:linked
```

Do not generate types into `apps/web/src/types/supabase.ts`; that file is only a
wrapper.

Validation completed on 2026-04-14. The only remaining lint warning is
non-blocking PL/pgSQL dead code in `public.approve_reservation`
(`v_lot` is declared but never read).

## TypeScript consumers

The Next.js app keeps its stable import path at `apps/web/src/types/supabase.ts`,
but that file only re-exports the canonical generated types from this package.
New code should treat `packages/database/types/database.generated.ts` as the
source of truth for Supabase table, enum, function and relationship types.
