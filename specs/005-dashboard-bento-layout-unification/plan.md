# Implementation Plan: Dashboard Bento Layout Unification

**Branch**: `005-dashboard-bento-layout-unification` | **Date**: 2026-06-01 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from
`/specs/005-dashboard-bento-layout-unification/spec.md`.

## Summary

Unify Plotify dashboard pages around a shared layout system: `PageShell` for
outer spacing, `PageHeader` for consistent page titles/actions, and `BentoGrid`
plus `BentoPanel` for page modules. The decision intentionally keeps top-level
page titles text-only and reserves icons for navigation, actions, stateful cards,
empty states and badges.

The implementation must be incremental because current dashboard pages mix
client/server rendering, tables, forms and card grids. The first pass creates
the primitives; the second pass migrates the highest-visibility routes from the
provided screenshots; the final pass updates remaining dashboard index pages and
documentation.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.6 in `apps/web`.

**Primary Dependencies**: Tailwind CSS 4, shadcn/ui Card/Table/Button primitives,
HugeIcons for internal iconography, existing `cn` utility.

**Storage**: None. No Supabase schema or data migration is required.

**Testing & Quality Gates**:

- `pnpm --filter web lint`
- `pnpm format:check`
- `pnpm build:web`
- `pnpm typecheck:web` when shared component props or generated types are touched

**Performance Goals**:

- No added client bundle for purely presentational server-renderable shells.
- No layout shift when switching between pages.
- Mobile pages must avoid horizontal overflow at 375px width.

## Constitution Check

_GATE: Must pass before implementation tasks._

- **Producto Piloto Primero**: PASS. Improves the pilot dashboard operations UI
  without adding non-core features.
- **Geometria Espacial como Origen de Deslindes y Documentos**: PASS. No
  geometry or document generation rules change.
- **Supabase y Migraciones Canonicas**: PASS. No database migrations.
- **Contratos Tipados Entre Servicios**: PASS. No API contract changes.
- **Seguridad Multi-Tenant y Asignacion de Vendedores**: PASS. Visual shell only;
  tenant scoping logic remains untouched.
- **Testing y Gates de Calidad Obligatorios**: PASS. Web lint, format and build
  are required before task completion.

## Project Structure

```text
apps/web/src/components/dashboard/
├── page-shell.tsx          # [NEW] Shared page wrapper and spacing system
├── page-header.tsx         # [NEW] Text-only h1, description, action slot
├── bento-grid.tsx          # [NEW] 12-column responsive grid and panel wrapper
├── empty-state.tsx         # [EXISTING] Reused inside panels when appropriate
└── skeleton-card.tsx       # [EXISTING] Reused for loading states

apps/web/src/app/(dashboard)/
├── dashboard/page.tsx              # [MIGRATE] PageShell + PageHeader + BentoGrid
├── projects/page.tsx               # [MIGRATE] PageShell + PageHeader + project grid
├── clients/page.tsx                # [MIGRATE] Table panel + mobile cards
├── vendors/page.tsx                # [MIGRATE] Remove h1 icon, table panel
├── settings/profile/page.tsx       # [MIGRATE] Remove isolated centered root
├── settings/workspace/page.tsx     # [MIGRATE] Remove isolated centered root
└── documentos/page.tsx             # [MIGRATE] Shared shell and panels

design.md                          # [UPDATE] Canonical layout/icon decision
```

## Architecture Decisions

### PageShell

`PageShell` owns the page rail:

```tsx
<section className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
  <div className="space-y-6 animate-fade-in-up">{children}</div>
</section>
```

Settings pages should not center the whole page as a separate island or leave an
unexplained empty gutter. Form-heavy settings pages should either occupy the full
bento width or pair a partial-width form with a real companion panel.

### PageHeader

`PageHeader` owns the top hierarchy:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
  <div className="min-w-0 space-y-1">
    <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
    {description ? <p className="text-muted-foreground">{description}</p> : null}
  </div>
  {action ? <div className="shrink-0">{action}</div> : null}
</div>
```

No `icon` prop for the title. If a future page truly needs a brand or entity
symbol, it must be an explicit product decision, not the default component API.

### BentoGrid and BentoPanel

`BentoGrid` provides the layout system; `BentoPanel` provides the surface. Cards
inside panels should be avoided unless they are repeated items such as projects.

```tsx
<BentoGrid>
  <BentoPanel className="xl:col-span-12">...</BentoPanel>
  <BentoPanel className="md:col-span-12">...</BentoPanel>
</BentoGrid>
```

## Phases

### Phase 1 - Shared Layout Primitives

Create `PageShell`, `PageHeader`, `BentoGrid` and `BentoPanel` with strict,
minimal props. Keep them server-compatible and avoid client state.

### Phase 2 - Screenshot Pages

Migrate `/projects`, `/vendors` and `/settings/workspace` first because these
are the pages where the inconsistency is visible today. Remove the `UserStar`
icon from the Vendedores `h1`; keep action and empty-state icons.

### Phase 3 - Adjacent Dashboard Routes

Migrate `/dashboard`, `/clients`, `/settings/profile` and `/documentos` so the
core navigation experience no longer changes page rail or heading style.

### Phase 4 - Documentation and QA

Update `design.md`, run web quality gates and manually inspect desktop/mobile
alignment.

## Risks & Mitigations

| Risk                                       | Mitigation                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Nested cards make the UI feel heavy        | Use `BentoPanel` for page modules and reserve `Card` for repeated records or existing shadcn forms. |
| Settings forms leave an empty right gutter | Use a full-width bento composition, or pair a partial-width form with a real help/context panel.    |
| Client/server component boundary breakage  | Keep primitives free of hooks and client directives.                                                |
| Too much scope in one pass                 | Migrate routes in task order and stop after each verify command.                                    |

## Verification Strategy

1. Static review: confirm imports and root wrappers use shared primitives.
2. Build gates: run `pnpm --filter web lint`, `pnpm format:check`,
   `pnpm build:web`.
3. Visual inspection: compare `/projects`, `/vendors`, `/settings/workspace` at
   desktop and 390px mobile width, and confirm `/settings/profile` plus
   `/settings/workspace` do not leave an empty right-side column on desktop.
