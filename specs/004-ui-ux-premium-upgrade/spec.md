# Feature Specification: UI/UX Premium Upgrade

**Feature Branch**: `004-ui-ux-premium-upgrade`

**Created**: 2026-05-31

**Status**: Draft

**Input**: Auditoría UI/UX del frontend de Plotify. El usuario reporta insatisfacción con el diseño visual del sidebar, las notificaciones y la paleta de colores. Se analizaron 6 skills de diseño (Design System Patterns, Visual Design Foundations, Interaction Design, Frontend UI Engineering, Tailwind Design System, Responsive Design), el spec 003-design-and-accessibility-hardening (Fase 1 completada, Fase 2 pendiente), y el estado actual de los 35 componentes shadcn/ui, la paleta OKLCH y los layouts del dashboard.

**Design Decisions**:

- **Color accent**: Teal/Cyan (hue ~190 OKLCH) como color complementario frío al azul primario (hue ~264)
- **Sidebar branding**: Logo SVG de Plotify con gradiente de marca (primary → accent)

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Design Token System Expansion (Priority: P1)

An admin or vendor using Plotify in light or dark mode sees a cohesive, vibrant color palette with clearly distinguishable states (success, warning, accent) and multi-hue charts, rather than the current monochromatic blue experience.

**Why this priority**: The color system is the foundation for every visual component. All other UI improvements depend on having differentiated semantic tokens. The current `--accent` = `--muted` duplication and missing `--success`/`--warning` tokens make it impossible to build a premium-feeling interface.

**Independent Test**: Can be tested by toggling between light and dark mode and verifying that accent-highlighted elements are visually distinct from muted backgrounds, charts use multiple distinguishable colors, and success/warning states render with their own hues.

**Acceptance Scenarios**:

1. **Given** the app is in light mode, **When** a user views a chart with 5 data series, **Then** each series uses a visually distinguishable color from the multi-hue chart palette.
2. **Given** the app is in dark mode, **When** a user hovers over an accent-highlighted element, **Then** the accent color is clearly different from the muted background color.
3. **Given** a success action completes (e.g., approval), **When** the feedback is displayed, **Then** it uses the `--success` token (emerald hue) rather than hardcoded `emerald-600`.
4. **Given** a warning state is present (e.g., pending approval), **When** the element renders, **Then** it uses the `--warning` token (amber hue) rather than hardcoded `amber-600`.

---

### User Story 2 - Premium Sidebar Experience (Priority: P1)

An admin or vendor recognizes Plotify's sidebar as a branded, well-organized navigation tool with clear section groupings, dynamic activity badges, and a premium workspace header — not a generic template sidebar.

**Why this priority**: The sidebar is visible on every page and is the user's primary navigation tool. Its generic appearance (blue square with initial, flat item list, no badges) makes the entire application feel unfinished.

**Independent Test**: Can be tested by signing in as admin and vendor, verifying section labels appear in expanded mode and hide in collapsed mode, dynamic badges show real counts, and the workspace header uses the brand gradient.

**Acceptance Scenarios**:

1. **Given** an admin opens the sidebar, **When** it is expanded, **Then** navigation items are grouped under section labels (PRINCIPAL, HERRAMIENTAS, CONFIGURACIÓN) with visual separators.
2. **Given** a vendor has 3 unread lead notifications, **When** the sidebar is visible, **Then** a badge with count "3" appears next to the Leads item.
3. **Given** the sidebar is in collapsed mode, **When** the user hovers over an item, **Then** an enriched tooltip shows the item name and badge count.
4. **Given** the workspace header is visible, **When** the user looks at the sidebar top, **Then** the workspace icon uses a brand gradient (primary → accent teal) instead of flat `bg-blue-600`.
5. **Given** a super-admin navigates the super-admin area, **When** they see the sidebar, **Then** it uses the same shadcn/ui Sidebar primitive as the regular dashboard (not a manual `w-64 bg-white` aside).

---

### User Story 3 - Notification Center Visual Refinement (Priority: P1)

An admin or vendor opens the notification center and experiences a polished, consistent dropdown with HugeIcons, semantic token colors, skeleton loading, temporal grouping, and a non-aggressive unread indicator.

**Why this priority**: The notification center was functionally completed in spec 002, but its visual implementation has 12+ Lucide icon imports (should be HugeIcons), hardcoded Slate colors ignoring semantic tokens, spinner-based loading, and an aggressive pulsing red badge — all documented inconsistencies with the design system.

**Independent Test**: Can be tested by opening the notification dropdown with notifications present, in loading state, and empty state; verifying icon library consistency, token usage, skeleton rendering, temporal grouping, and badge appearance.

**Acceptance Scenarios**:

1. **Given** a user opens the notification dropdown, **When** notifications are loading, **Then** 3 skeleton cards with pulse animation appear instead of a spinner.
2. **Given** a user has notifications from today and yesterday, **When** the dropdown opens, **Then** notifications are grouped under "Hoy", "Ayer", or "Esta semana" separators.
3. **Given** the dropdown is open, **When** any icon renders, **Then** it uses `@hugeicons` imports with zero `lucide-react` imports in the notifications directory.
4. **Given** the dropdown renders, **When** inspecting CSS classes, **Then** no hardcoded `slate-*`, `blue-*` color classes exist; all colors use semantic tokens (`bg-muted`, `text-muted-foreground`, `bg-primary`, etc.).
5. **Given** the user has unread notifications, **When** the bell icon shows, **Then** the unread indicator is a static dot with `bg-primary` and a subtle entrance animation — not a pulsing destructive badge.

---

### User Story 4 - Micro-Interactions & Motion Design (Priority: P2)

Every interactive element in the dashboard provides immediate visual feedback through hover effects, skeleton loading, smooth entrance animations, and optimistic updates — making the application feel alive and responsive.

**Why this priority**: The current UI feels static and "dead" — KPI cards don't respond to hover, pages load with plain text, and approval actions wait for server response before updating UI. These are the patterns that make users perceive an app as "cheap" vs "premium".

**Independent Test**: Can be tested by hovering over KPI cards, navigating between pages, approving/rejecting notifications, and verifying loading states across projects, leads, and vendor views.

**Acceptance Scenarios**:

1. **Given** a user hovers over a KPI card, **When** the cursor enters the card, **Then** the card subtly elevates with shadow and border color transition within 200ms.
2. **Given** the projects page is loading, **When** data is being fetched, **Then** skeleton card layouts appear instead of "Cargando proyectos..." text.
3. **Given** a user navigates to a new page, **When** content appears, **Then** cards and lists animate in with fade + slide-up within 300ms.
4. **Given** an admin approves a notification, **When** they click approve, **Then** the UI updates optimistically (immediately) and reverts only if the server returns an error.
5. **Given** a user has MapLibre map in dark mode, **When** a map popup appears, **Then** the popup background matches the dark theme without white flashing.

---

### User Story 5 - Empty States & Content Polish (Priority: P2)

When a new user or empty-state scenario occurs, the interface shows a helpful, well-designed empty state with relevant illustrations, descriptive text, and actionable CTAs — never a blank screen or raw text.

**Why this priority**: Empty states are the first thing a new customer sees. They set the tone for the entire product experience and directly impact onboarding conversion.

**Independent Test**: Can be tested by creating a new organization with no data and verifying empty states appear for Projects, Leads, Vendors, and Dashboard.

**Acceptance Scenarios**:

1. **Given** an organization has no projects, **When** the admin visits /projects, **Then** an empty state with a descriptive icon, helpful text ("Tu primer loteo está a un clic"), and a "Crear Proyecto" CTA button appears.
2. **Given** an organization has no leads, **When** a user visits /clients, **Then** an empty state guides the user on how to start capturing leads.
3. **Given** the dashboard has no data, **When** a new admin logs in, **Then** an onboarding-style empty state with progress steps ("1. Crea un proyecto", "2. Invita vendedores", etc.) replaces the empty KPI cards.
4. **Given** the root HTML document renders, **When** inspecting `<head>`, **Then** the title says "Plotify — Gestión de loteos" (not "Create Next App") and `lang="es"`.

---

### User Story 6 - Component Architecture & Responsive Patterns (Priority: P3)

Reusable compound components and responsive patterns ensure visual consistency across the application, with lot status badges, project cards, and KPI cards following typed variant patterns, and tables adapting to mobile viewports.

**Why this priority**: Without compound components and CVA variants, every new feature recreates visual patterns inconsistently. Container queries and responsive table patterns are prerequisites for the mobile experience.

**Independent Test**: Can be tested by rendering ProjectCard in grid/list/compact variants, verifying lot status badge colors match design tokens, and checking tables render as cards on mobile viewports.

**Acceptance Scenarios**:

1. **Given** a project is displayed in a grid layout, **When** the ProjectCard renders, **Then** it uses the `grid` variant with full image and details.
2. **Given** lot statuses are displayed, **When** the LotStatusBadge renders for "available", "reserved", and "sold", **Then** each uses its corresponding OKLCH color token from `design.md` status palette.
3. **Given** a leads table is viewed on a 375px viewport, **When** the table renders, **Then** rows transform into stacked cards with touch-friendly targets ≥ 44x44px.

### Edge Cases

- A user switches between light and dark mode while the notification dropdown is open.
- A super-admin navigates between the super-admin area and a regular dashboard in the same session.
- A sidebar with 8+ navigation items (future growth) maintains visual hierarchy with section labels.
- Chart colors remain distinguishable for users with color vision deficiency (deuteranopia).
- Skeleton loaders appear for very fast responses (< 100ms) without visible flicker.
- Brand gradient renders correctly in both light and dark modes.
- Empty states link to correct routes that actually exist.
- Container queries work in browsers that don't support them (graceful fallback).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The design system MUST include semantic tokens `--success`, `--success-foreground`, `--warning`, `--warning-foreground` with OKLCH values calibrated for WCAG AA contrast in both light and dark modes.
- **FR-002**: The `--accent` token MUST be visually distinguishable from `--muted` in both light and dark modes, using a Teal/Cyan hue (~190 OKLCH).
- **FR-003**: The chart color palette MUST use 5 visually distinguishable hues (multi-hue) rather than 5 shades of the same blue.
- **FR-004**: Chart colors MUST have dedicated dark mode values with sufficient contrast against `--card` dark background.
- **FR-005**: A `--brand-gradient` CSS custom property MUST be defined for the primary→accent gradient.
- **FR-006**: The sidebar workspace header MUST use the brand gradient for the workspace icon.
- **FR-007**: Sidebar navigation items MUST be grouped under section labels visible in expanded mode and hidden in collapsed icon mode.
- **FR-008**: Sidebar items with dynamic counts (Leads, Aprobaciones) MUST display badges with real-time counts that disappear when zero.
- **FR-009**: Submenu expand/collapse MUST animate with spring easing that respects `prefers-reduced-motion`.
- **FR-010**: The super-admin sidebar MUST use the shadcn/ui Sidebar primitive instead of a manual layout.
- **FR-011**: Notification components MUST use exclusively `@hugeicons` — zero `lucide-react` imports allowed in the `notifications/` directory.
- **FR-012**: Notification components MUST use only semantic color tokens — zero hardcoded `slate-*`, `blue-*`, or `green-*` class names.
- **FR-013**: Notification loading state MUST show skeleton cards instead of a spinner.
- **FR-014**: Notification list MUST group items by temporal proximity: "Hoy", "Ayer", "Esta semana", "Anteriores".
- **FR-015**: The notification bell unread indicator MUST be a `bg-primary` dot with subtle entrance animation, not a destructive pulsing badge.
- **FR-016**: KPI dashboard cards MUST have hover effects with shadow and border transition within 200ms.
- **FR-017**: Project list, leads table, and vendors table MUST show skeleton layouts during loading instead of text placeholders.
- **FR-018**: Page content MUST animate in with fade and vertical slide within 300ms, respecting `prefers-reduced-motion`.
- **FR-019**: Notification approval/reject actions MUST use optimistic updates.
- **FR-020**: MapLibre GL popups MUST adapt background color to dark mode.
- **FR-021**: Empty states MUST include a descriptive icon or illustration, helpful text, and an actionable CTA button.
- **FR-022**: HTML metadata MUST replace "Create Next App" defaults with Plotify branding and `lang="es"`.
- **FR-023**: Lot status badges MUST use CVA variants with OKLCH color tokens from the design system.
- **FR-024**: Lead and vendor tables MUST transform to stacked cards on viewports < 768px with touch targets ≥ 44x44px.
- **FR-025**: The `design.md` file MUST be updated to reflect all new tokens, components, and visual decisions.

### Key Entities

- **Design Token**: A named CSS custom property with OKLCH values for both light and dark modes, following the hierarchy: Primitive → Semantic → Component.
- **Brand Gradient**: A CSS gradient from `--primary` (blue hue ~264) to `--accent` (teal hue ~190) used for premium visual elements.
- **Section Label**: A typographic divider in the sidebar that groups navigation items by function (PRINCIPAL, HERRAMIENTAS, CONFIGURACIÓN).
- **Skeleton Loader**: A placeholder UI that mimics the shape of content being loaded, using pulse animation.
- **Empty State**: A full-page or section-level placeholder shown when no data exists, containing icon, description, and CTA.
- **Compound Component**: A composable React component pattern using CVA for typed variants (e.g., ProjectCard with grid/list/compact variants).
- **Temporal Group**: A notification list separator that organizes items by relative time ("Hoy", "Ayer", "Esta semana").

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The `--accent` token is visually distinguishable from `--muted` in both themes with ΔL (OKLCH lightness difference) ≥ 0.05 and Δhue ≥ 70.
- **SC-002**: All 5 chart colors have pairwise ΔE (OKLCH) ≥ 0.10, ensuring distinguishability.
- **SC-003**: Zero `lucide-react` imports exist in `apps/web/src/components/notifications/`.
- **SC-004**: Zero hardcoded color class names (matching `/slate-|blue-[0-9]|green-[0-9]|amber-[0-9]|emerald-[0-9]/`) exist in `apps/web/src/components/notifications/`.
- **SC-005**: KPI cards respond to hover within 200ms with measurable shadow/border change.
- **SC-006**: All loading states use `<Skeleton />` components — zero instances of "Cargando..." text remain in production pages.
- **SC-007**: HTML `<title>` contains "Plotify" and `<html lang>` is "es" in production build.
- **SC-008**: Production build passes: `pnpm --filter web lint && pnpm format:check && pnpm build:web`.

## Assumptions

- The feature focuses exclusively on frontend visual changes in `apps/web`. No API, database, or Telegram changes are needed.
- The existing shadcn/ui component library and Tailwind CSS v4 `@theme` configuration remain the visual stack.
- HugeIcons free library has equivalent icons for all Lucide icons currently used in notifications.
- The brand gradient (blue → teal) has been approved by the product owner.
- `prefers-reduced-motion` support from spec 003 Phase 1 is preserved and extended to new animations.
- Super-admin sidebar unification follows the same visual patterns as the regular dashboard sidebar.
- Empty state illustrations can be implemented with icons from HugeIcons rather than custom SVG artwork.
- Container queries are supported by target browsers (Chrome 105+, Firefox 110+, Safari 16+).
