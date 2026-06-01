# Tasks: Dashboard Bento Layout Unification

**Input**: Design decision and implementation plan from
`/specs/005-dashboard-bento-layout-unification/`.

**Tests & Quality Gates**: This is a frontend structural/layout change. Each
implementation task should run the task-specific verify command. The final task
must run `pnpm --filter web lint`, `pnpm format:check`, and `pnpm build:web`.

## Phase 1: Setup

- [x] T001 Review the spec and implementation plan for bento layout unification.
      Acceptance: assumptions, title icon decision, margin rules and non-functional
      boundaries are understood.
      Verify: `test -f specs/005-dashboard-bento-layout-unification/spec.md`
      Files: `specs/005-dashboard-bento-layout-unification/spec.md`,
      `specs/005-dashboard-bento-layout-unification/plan.md`

- [x] T002 Sync CodeGraph before implementation.
      Acceptance: local structural index reflects the current worktree.
      Verify: `codegraph sync .`
      Files: none

## Phase 2: Shared Primitives

- [x] T003 Create `PageShell` and `PageHeader`.
      Acceptance: `PageShell` centralizes responsive page rail, spacing and entry
      animation; `PageHeader` supports title, description and action slot; `PageHeader`
      has no title icon prop.
      Verify: `pnpm typecheck:web`
      Files: `apps/web/src/components/dashboard/page-shell.tsx`,
      `apps/web/src/components/dashboard/page-header.tsx`

- [x] T004 Create `BentoGrid` and `BentoPanel`.
      Acceptance: `BentoGrid` provides 1-column mobile and 12-column desktop layout;
      `BentoPanel` encapsulates common bento surface styling and accepts `className`
      for column spans.
      Verify: `pnpm typecheck:web`
      Files: `apps/web/src/components/dashboard/bento-grid.tsx`

## Phase 3: Screenshot Pages

- [x] T005 Migrate `/projects` to shared page primitives.
      Acceptance: page root uses `PageShell`; title/action uses `PageHeader`;
      project cards render in `BentoGrid`; empty/loading states keep current behavior.
      Verify: `pnpm --filter web lint`
      Files: `apps/web/src/app/(dashboard)/projects/page.tsx`

- [x] T006 Migrate `/vendors` to shared page primitives and remove title icon.
      Acceptance: page root uses `PageShell`; `h1` is text-only; invite action remains;
      table/mobile-card panel uses bento width without changing data logic.
      Verify: `pnpm --filter web lint`
      Files: `apps/web/src/app/(dashboard)/vendors/page.tsx`

- [x] T007 Migrate `/settings/workspace` to shared page primitives.
      Acceptance: page root no longer uses `p-6 max-w-4xl mx-auto`; workspace form
      aligns to the shared rail and renders as a complete desktop composition.
      Verify: `pnpm --filter web lint`
      Files: `apps/web/src/app/(dashboard)/settings/workspace/page.tsx`,
      `apps/web/src/components/dashboard/workspace-settings-form.tsx`

## Phase 4: Core Route Completion

- [x] T008 Migrate `/dashboard` and `/clients`.
      Acceptance: both pages use `PageShell` and `PageHeader`; KPI, approval, lead
      table and empty-state modules sit inside bento-compatible sections.
      Verify: `pnpm --filter web lint`
      Files: `apps/web/src/app/(dashboard)/dashboard/page.tsx`,
      `apps/web/src/app/(dashboard)/clients/page.tsx`

- [x] T009 Migrate `/settings/profile` and `/documentos`.
      Acceptance: profile and document pages use the same page rail and title
      hierarchy; document quick-access modules fit the bento grid; profile renders
      as a complete desktop composition without a right-side empty gutter.
      Verify: `pnpm --filter web lint`
      Files: `apps/web/src/app/(dashboard)/settings/profile/page.tsx`,
      `apps/web/src/app/(dashboard)/documentos/page.tsx`

## Phase 5: Documentation and Final Verification

- [x] T010 Update `design.md` with the canonical layout decision.
      Acceptance: documentation states the shared page shell, bento grid usage,
      margin rules and title-icon policy.
      Verify: `rg -n "PageShell|BentoGrid|titulos sin icono|títulos sin icono" design.md`
      Files: `design.md`

- [x] T011 Run final web quality gates and visual QA.
      Acceptance: lint, format check and production build pass after review blockers
      are fixed; visual QA evidence confirms `/projects`, `/vendors` and
      `/settings/workspace` align on the same rail at desktop and 390px mobile; visual
      QA also confirms `/settings/profile` and `/settings/workspace` do not leave an
      unexplained empty right-side column.
      Verify: `pnpm --filter web lint && pnpm format:check && pnpm build:web`
      Visual verify: inspect or capture `/projects`, `/vendors` and
      `/settings/workspace` at desktop and 390px mobile, plus desktop captures of
      `/settings/profile` and `/settings/workspace`.
      Files: all migrated files
