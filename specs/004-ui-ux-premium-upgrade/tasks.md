# Tasks: UI/UX Premium Upgrade

**Input**: Design documents from `/specs/004-ui-ux-premium-upgrade/`

**Prerequisites**: plan.md, spec.md

**Tests & Quality Gates**: Included because this feature modifies core styling (`globals.css`), global layouts, navigation primitives, notification lists, page-wide loading states, empty cards, responsive views, and final production builds in `apps/web`.

**Organization**: Tasks are arranged sequentially. Foundations and color system must be established first, followed by key navigational layouts (Sidebar), the prominent widget (Notification center), interactive micro-animations, empty layouts, responsive compound patterns, and finally compilation gates.

---

## Phase 1: Setup (Shared Context)

**Purpose**: Confirm feature requirements and sync local codebase indexing.

- [x] T001 Review feature spec in specs/004-ui-ux-premium-upgrade/spec.md; Acceptance: understand user stories, constraints, edge cases, and success metrics; Verify: `test -f specs/004-ui-ux-premium-upgrade/spec.md`
- [x] T002 Review architectural approach in specs/004-ui-ux-premium-upgrade/plan.md; Acceptance: confirm CSS token mappings, directory layout changes, and asset additions; Verify: `test -f specs/004-ui-ux-premium-upgrade/plan.md`
- [x] T003 Synchronize codebase indices with CodeGraph to review global design styles; Acceptance: identify locations of `globals.css`, Lucide icon usage in notification folders, and current sidebar markup; Verify: `codegraph sync .`
- [x] T004 Create and check out local feature branch; Acceptance: work starts on dedicated branch `004-ui-ux-premium-upgrade`; Verify: `git rev-parse --abbrev-ref HEAD | grep "004-ui-ux-premium-upgrade"`

---

## Phase 2: Foundational (Design System & Color Tokens)

**Purpose**: Configure premium OKLCH semantic tokens, chart colors, and standard branding animations in the Tailwind CSS v4 styling sheet.

- [x] T005 Research and examine existing Tailwind CSS v4 config inside apps/web/src/app/globals.css; Acceptance: identify `@theme` directive blocks and existing color definitions; Verify: `grep -q "@theme" apps/web/src/app/globals.css`
- [x] T006 Add semantic OKLCH color tokens in globals.css; Acceptance: define `--color-success`, `--color-success-foreground` (emerald hue), `--color-warning`, `--color-warning-foreground` (amber hue), `--color-accent` (teal/cyan hue ~190 OKLCH), and `--color-accent-foreground` with calibrated high-contrast light/dark mode variables; Verify: `grep -E "color-success|color-warning|color-accent" apps/web/src/app/globals.css`
- [x] T007 Add multi-hue chart color variables and brand gradient; Acceptance: add `--brand-gradient` (primary to accent) and 5 pairwise distinguishable chart hues in globals.css for light/dark themes; Verify: `grep -q "brand-gradient" apps/web/src/app/globals.css`
- [x] T008 Add global slide-up keyframe animations in globals.css; Acceptance: keyframe `fade-in-up` is defined with smooth cubic-bezier easing to support premium motion design; Verify: `grep -q "fade-in-up" apps/web/src/app/globals.css`

**Checkpoint**: Foundation ready. Color tokens and transitions are accessible across all Tailwind classes.

---

## Phase 3: User Story 2 - Premium Sidebar Experience (Priority: P1)

**Goal**: Upgrade the sidebar using the shadcn/ui Sidebar primitive with branded workspace icons, section groups, and live badges.

- [x] T009 Review current sidebar component location and usage in apps/web/src/components/ui/sidebar.tsx and dashboard layouts; Acceptance: identify standard layouts rendering the navigation menu; Verify: `codegraph sync .`
- [x] T010 Refactor sidebar workspace header; Acceptance: render Plotify brand SVG logo decorated with a dynamic `--brand-gradient` background rather than a generic flat color; Verify: `pnpm typecheck:web`
- [x] T011 Implement categorized navigation groups in the sidebar; Acceptance: sidebar menus are organized under uppercase section headings (`PRINCIPAL`, `HERRAMIENTAS`, `CONFIGURACIÓN`) visible in expanded mode and cleanly hidden when collapsed; Verify: `pnpm build:web`
- [x] T012 Add dynamic activity count badges to navigation items; Acceptance: menu items like "Leads" or "Aprobaciones" fetch and display numeric status counts as compact rounded badges that auto-hide when count is zero; Verify: `pnpm typecheck:web`
- [x] T013 Unify Super-Admin Sidebar; Acceptance: the super-admin view sidebar uses the same shadcn/ui Sidebar primitive component as the dashboard rather than manual `w-64 bg-white aside` styling; Verify: `pnpm build:web`

**Checkpoint**: Sidebar is branded, responsive, interactive, and correctly structured.

---

## Phase 4: User Story 3 - Notification Center Visual Refinement (Priority: P1)

**Goal**: Refine the visual representation of the notification center dropdown using HugeIcons, skeleton cards, date grouping, and semantic variables.

- [x] T014 Replace Lucide icons in the notification directory; Acceptance: audit `apps/web/src/components/notifications/` and replace all `lucide-react` imports with equivalent icons from `@hugeicons/react` for a premium uniform shape; Verify: `! grep -q "lucide-react" apps/web/src/components/notifications/*.tsx`
- [x] T015 Remove hardcoded Tailwind color overrides; Acceptance: replace any explicit class-based text/bg colors (e.g. `text-slate-600`, `bg-blue-50`, `text-green-800`) in notification templates with semantic tokens like `bg-muted`, `text-muted-foreground`, `text-success`, `bg-warning/20`; Verify: `! grep -E "slate-|blue-|green-|emerald-|amber-" apps/web/src/components/notifications/*.tsx`
- [x] T016 Implement temporal grouping in notification list; Acceptance: notifications in `notification-list.tsx` are sorted and rendered under relative time banners like "Hoy", "Ayer", "Esta semana", or "Anteriores"; Verify: `pnpm typecheck:web`
- [x] T017 Implement skeleton loading cards; Acceptance: when loading notifications, render 3 simple layout skeleton components with subtle animation instead of a traditional loading spinner; Verify: `pnpm build:web`
- [x] T018 Refine unread bell icon dot; Acceptance: replace aggressive pulsing red alerts on the header notification bell with a static, clean primary teal/cyan entry dot; Verify: `pnpm build:web`

**Checkpoint**: Notification center is fully polished, cohesive, and conforms to standard semantic variables.

---

## Phase 5: User Story 4 - Micro-Interactions & Motion Design (Priority: P2)

**Goal**: Bring the interface to life using CSS elevation transforms, page transition animations, and optimistic state updates.

- [x] T019 Implement elevation effects on KPI and dashboard cards; Acceptance: KPI card containers react to mouse hovers by smoothly elevating (Y-axis translate, subtle shadow depth, border tint transition) within 200ms; Verify: `pnpm build:web`
- [x] T020 Implement skeleton templates for primary routes; Acceptance: Leads (`clients/page.tsx`), Projects (`projects/page.tsx`), and Vendors (`vendors/page.tsx`) show structured skeleton card matrices during state transitions rather than blank screens or "Cargando..." labels; Verify: `pnpm typecheck:web`
- [x] T021 Implement page-wide fade-in-up transition; Acceptance: dashboard pages animate their entry using the custom `animate-fade-in-up` utility class, smoothly shifting content upward by 8px while rising in opacity over 300ms; Verify: `pnpm build:web`
- [x] T022 Apply optimistic updates to notification approvals; Acceptance: when an administrator approves a request in the notifications list, the item UI state is immediately set as resolved, and only reverts back to pending if the backend API returns an error; Verify: `pnpm typecheck:web`
- [x] T023 Theme MapLibre popup components; Acceptance: map popups adapt their text and container background variables when toggling between light and dark modes; Verify: `pnpm build:web`

**Checkpoint**: Dashboard interactions are fluid, visual transitions feel premium, and loading screens feel instantaneous.

---

## Phase 6: User Story 5 - Empty States & Content Polish (Priority: P2)

**Goal**: Replace all empty list screens with engaging CTA components and complete final brand overrides.

- [x] T024 Create a reusable `<EmptyState />` component; Acceptance: the component accepts a HugeIcon, title, detailed helpful description, and an optional callback CTA button to guide users; Verify: `pnpm typecheck:web`
- [x] T025 Integrate empty state layouts across list routes; Acceptance: projects, clients (leads), and vendors views render `<EmptyState />` when lists are empty rather than displaying blank tables; Verify: `pnpm build:web`
- [x] T026 Add dashboard onboarding checklist for new organizations; Acceptance: if the dashboard has no commercial history, render an onboarding checklist panel detailing "1. Crea tu primer proyecto", "2. Registra un cliente", "3. Habilita un vendedor" instead of empty statistics; Verify: `pnpm build:web`
- [x] T027 Polish global HTML metadata; Acceptance: replace Next.js defaults in `apps/web/src/app/layout.tsx` to set descriptive titles ("Plotify — Gestión de loteos"), descriptions, and configure `<html lang="es">`; Verify: `grep -q 'lang="es"' apps/web/src/app/layout.tsx`

**Checkpoint**: Zero empty pages or default templates remain. The app feels complete and localized.

---

## Phase 7: User Story 6 - Component Architecture & Responsive Patterns (Priority: P3)

**Goal**: Build custom CVA-based card states and create responsive mobile-first stacked layouts.

- [x] T028 Create `<ProjectCard />` compound component; Acceptance: component uses Class Variance Authority (`cva`) to handle type definitions for `grid`, `list`, and `compact` layout styles cleanly; Verify: `pnpm typecheck:web`
- [x] T029 Implement `<LotStatusBadge />` compound component; Acceptance: lot state visual styles ("disponible", "reservado", "vendido") are fully resolved using semantic OKLCH theme variables via standard variants; Verify: `pnpm build:web`
- [x] T030 Refactor the clients table for mobile; Acceptance: when clients/leads tables are rendered on screens under `768px`, rows adaptively stack into highly interactive visual cards with touch targets ≥ 44x44px; Verify: `pnpm build:web`
- [x] T031 Refactor the vendors table for mobile; Acceptance: vendor data lists stack into card rows on small viewports with clean column labels and responsive layout spacing; Verify: `pnpm build:web`
- [x] T031b Update design architectural documentation; Acceptance: create or update specs/004-ui-ux-premium-upgrade/design.md to reflect all new OKLCH tokens, empty states, and custom responsive layouts; Verify: `test -f specs/004-ui-ux-premium-upgrade/design.md`

**Checkpoint**: Component structures are modular, fully type-safe, and highly optimized for mobile viewports.

---

## Phase 8: Quality Gates & Verification

**Purpose**: Execute absolute quality checking before marking features as production-ready.

- [x] T032 Run full linter and formatting commands; Acceptance: all code changes comply with strict styles and zero lint issues are found; Verify: `pnpm --filter web lint && pnpm format:check`
- [x] T033 Build production bundles; Acceptance: next build compiles without errors and reports optimized static chunks; Verify: `pnpm build:web`

**Final Checkpoint**: The premium visual upgrade is complete, robustly styled, and ready for deployment.
