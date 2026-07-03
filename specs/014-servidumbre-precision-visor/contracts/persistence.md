# Contract: Persistence and Migration

**Feature**: 014-servidumbre-precision-visor · **Date**: 2026-07-02

## Migration

All schema changes must be added under:

```text
packages/database/supabase/migrations/20260702000100_servidumbre_precision.sql
```

Required capabilities:

- Persist road segments with mode, width, footprint geometry and status.
- Persist lot servitude result geometry and multiple widths.
- Preserve existing lot result columns as derived read-model fields.
- Add comments for every new legal/geometry column.
- Add indexes for project road segment lookup and viewer lot overlay lookup.

## Write Rules

- On road assignment/change, recalculate assigned lots for the project.
- On lot geometry assignment/change, recalculate that lot using existing road segments.
- Do not overwrite `official_override` results without explicit administrative action.
- Projects without canonical road segments are not recalculated until they are reloaded or transformed.

## Read Rules

- Viewer reads servitude overlay from persisted lot result geometry.
- Documents prefer `servidumbre_ancho_label` over the single numeric width when present.
- Existing code reading `servidumbre_m2` and `superficie_neta_m2` must continue to work.

## Verify Commands

```bash
pnpm verify:migrations
pnpm typecheck:web
```
