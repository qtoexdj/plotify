# Implementation Plan: UI/UX Premium Upgrade

**Branch**: `004-ui-ux-premium-upgrade` | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-ui-ux-premium-upgrade/spec.md`

## Summary

This implementation plan delivers a state-of-the-art UI/UX premium upgrade for the Plotify web application (`apps/web`). It expands the design token system in Tailwind CSS v4 using high-contrast OKLCH semantic tokens, upgrades the dashboard sidebar into a branded, organized navigation experience using the shadcn/ui Sidebar primitive, visually refines the notification dropdown with HugeIcons and skeleton loaders, adds fluid micro-interactions and page-transition motion design, designs beautiful empty states for new user onboarding, and establishes robust responsive card/table layout components.

No backend API changes are required, keeping the scope fully focused on the client-side experience and frontend presentation layers.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.6 in `apps/web`.

**Primary Dependencies**: Tailwind CSS v4 (configured via CSS variables in `globals.css` under the `@theme` directive), shadcn/ui primitives, Radix UI, `@hugeicons/react` icon library, Framer Motion (for spring ease animations and transitions), Recharts (for dashboard analytics), and MapLibre GL (for geographic displays).

**Storage**: Local storage is only used for caching UI states (e.g., sidebar collapsed/expanded state). No Supabase database schema migrations are necessary since the scope is strictly visual and presentation-based.

**Testing & Quality Gates**:

- Web Linting: `pnpm --filter web lint`
- Code Formatting: `pnpm format:check`
- Production Bundling: `pnpm build:web`
- TypeScript Verification: `pnpm typecheck:web`

**Performance Goals**:

- Page transitions and micro-interactions running at a smooth 60fps.
- Dynamic tooltips and badges rendering in under 100ms.
- Layout animations respecting `prefers-reduced-motion` at the CSS layer.
- Skeleton loaders loading with zero layout shift (CLS).

**Constraints**:

- Keep all modifications within the `apps/web` workspace.
- Do not import `lucide-react` within the notification components; enforce exclusive usage of `@hugeicons/react`.
- Use native Tailwind CSS v4 tokens and native Radix UI primitives.
- Maintain multi-tenant security layers (no organization or user membership ID may be leaked).

---

## Constitution Check

_GATE: Must pass before Phase 2 tasks are generated._

- **Producto Piloto Primero**: PASS. Improves the dashboard visual layer for pilot admins and vendors without adding unrelated features or marketing channels.
- **Geometría Espacial como Origen de Deslindes y Documentos**: PASS. Maps and visual popups in MapLibre are polished visually, but spatial backend geometry rules are preserved.
- **Supabase y Migraciones Canónicas**: PASS. No Supabase DB migrations are introduced; state remains local or inferred.
- **Contratos Tipados Entre Servicios**: PASS. The generated OpenAPI clients are fully preserved; no HTTP endpoints or contracts are modified.
- **Seguridad Multi-Tenant y Asignación de Vendedores**: PASS. User dashboard scopes (admin dashboard vs. vendor dashboard) are visually formatted without changing the underlying authorization rules.
- **Testing y Gates de Calidad Obligatorios**: PASS. Quality gates (`pnpm --filter web lint`, `pnpm format:check`, and `pnpm build:web`) are strict gates for each implemented task.

---

## Project Structure

This upgrade introduces and modifies files in `apps/web` to build out components, variables, and layouts:

```text
apps/web/
├── src/
│   ├── app/
│   │   ├── globals.css                       # [MODIFY] Custom OKLCH theme variables, animations, and transitions
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                    # [MODIFY] Sidebar integration and global transition wrapper
│   │   │   ├── page.tsx                      # [MODIFY] Onboarding checklist & empty state layouts
│   │   │   ├── projects/page.tsx             # [MODIFY] Skeleton loading integration & empty states
│   │   │   ├── clients/page.tsx              # [MODIFY] Skeleton loading, responsive stacked tables & empty states
│   │   │   └── vendors/page.tsx              # [MODIFY] Skeleton loading, responsive stacked tables & empty states
│   │   └── layout.tsx                        # [MODIFY] Metadata overrides (Plotify branding) and HTML lang="es"
│   ├── components/
│   │   ├── ui/
│   │   │   ├── sidebar.tsx                   # [MODIFY] shadcn/ui sidebar wrapper, sections, and brand gradient
│   │   │   ├── skeleton.tsx                  # [MODIFY] Skeleton loading component styles
│   │   │   └── badge.tsx                     # [MODIFY] Custom CVA variants with OKLCH tokens
│   │   ├── notifications/
│   │   │   ├── notification-bell.tsx         # [MODIFY] HugeIcons update, static unread indicator and static dot
│   │   │   ├── notification-list.tsx         # [MODIFY] Skeleton list cards & temporal grouping (Hoy/Ayer)
│   │   │   └── notification-item.tsx         # [MODIFY] Clean HugeIcons, no Lucide, optimistic action states
│   │   └── dashboard/
│   │       ├── project-card.tsx              # [NEW] Typed CVA variants (grid, list, compact)
│   │       ├── empty-state.tsx               # [NEW] Reusable premium Empty State component
│   │       ├── skeleton-card.tsx             # [NEW] Pulse loading skeleton for KPI and lists
│   │       └── lot-status-badge.tsx          # [NEW] Component wrapping custom CVA tokens for Lot Status
│   └── lib/
│       └── utils.ts                          # [MODIFY] Animation configurations & standard Tailwind merge utilities
```

---

## Complexity & Risk Mitigation

| Risk                                     | Mitigation Strategy                                                                                                                                                             |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tailwind CSS v4 compatibility issues** | All new OKLCH semantic tokens will be configured in `globals.css` under the `@theme` directive, keeping variable mappings consistent with shadcn/ui custom properties.          |
| **Lucide vs. HugeIcons imports**         | A build-time check or script will ensure zero `lucide-react` occurrences exist in `apps/web/src/components/notifications/` post-upgrade.                                        |
| **Animation overhead/performance**       | Keep animations short (≤ 300ms) and use hardware-accelerated CSS transitions or simple Framer Motion configurations. Respect `prefers-reduced-motion` everywhere.               |
| **Mobile responsiveness breakages**      | Use Tailwind's container query plugin (`@tailwindcss/container-queries`) or mobile viewport cards (`block md:table-row`) to cleanly swap between table grids and stacked cards. |

---

## Phase 0 Research Summary

Analysis of the Plotify codebase and visual assets shows:

1. **Ununified Colors**: In `globals.css`, success and warning states are not defined as standard CSS variables. Hardcoded `slate-`, `blue-`, and `emerald-` classes exist throughout.
2. **Generic Sidebar**: The sidebar is styled via a hardcoded standard layout, with a solid blue square workspace header instead of branding, flat menus, and no status/action counts.
3. **Notification Visual Bloat**: `notification-item.tsx` and `notification-bell.tsx` import over 12 Lucide icons, causing inconsistent styles.
4. **Static Transitions**: Changing dashboard views is instantaneous and abrupt. KPI cards do not shift visually on hover.

---

## Phase 1 Design Summary

This implementation defines the visual solutions across 6 key components:

### 1. CSS Theme & Tokens Expansion (`globals.css`)

Configure Tailwind CSS v4 variables:

```css
@theme {
  --color-success: oklch(0.72 0.16 150); /* calibrated emerald */
  --color-success-foreground: oklch(0.98 0.02 150);
  --color-warning: oklch(0.79 0.15 75); /* calibrated amber */
  --color-warning-foreground: oklch(0.18 0.04 75);
  --color-accent: oklch(0.74 0.16 190); /* Teal/Cyan accent */

  --brand-gradient: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);

  --animate-fade-in-up: fade-in-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 2. Premium Sidebar Component

- Add custom section groups (`PRINCIPAL`, `HERRAMIENTAS`, `CONFIGURACIÓN`).
- Upgrade workspace icon with a `bg-gradient-to-br from-primary to-accent` and a custom SVG path logo.
- Wrap sidebar items inside sub-groups that collapse elegantly.
- Add real-time counter badges (e.g., dynamic unread notifications/leads counts).

### 3. Beautiful Notification Dropdown

- Eliminate all `lucide-react` imports. Replace with `@hugeicons/react` counterparts.
- Group items in `notification-list.tsx` by relative dates.
- Display `<NotificationSkeleton />` items in a list of 3 cards while loading:

```tsx
export function NotificationSkeleton() {
  return (
    <div className="flex items-start space-x-3 p-4 animate-pulse border-b border-muted">
      <div className="h-9 w-9 rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
  )
}
```

- Simplify unread dot indicator in `notification-bell.tsx` with a static `h-2 w-2 rounded-full bg-primary` showing a basic entrance pop.

### 4. Interactive Page Wrapper & Optimistic Updates

- Create a layout fade-in motion component to wraps page views.
- Add elevation transforms to `DashboardCard` items: `transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-accent/40`.
- Apply optimistic state in notification approval buttons:

```tsx
const [isOptimisticApproved, setIsOptimisticApproved] = useState(false)
// when click approve, immediately update UI state and trigger backend call asynchronously
```

### 5. Empty States & Brand Polish

- Create `<EmptyState />` standard:
  - HugeIcon component centered.
  - Heading 3 + muted descriptions.
  - Primary button to route users to creation pages.
- Set global Next.js metadata in root `layout.tsx` for SEO and localization:

```tsx
export const metadata = {
  title: 'Plotify — Gestión de loteos',
  description: 'Plataforma premium para comercialización y aprobación de loteos.',
}
```

### 6. Typed Cards & Responsive Card Grids

- Implement a reusable standard `<ProjectCard />` with class variance authority (`cva`):

```tsx
const projectCardVariants = cva(
  'rounded-xl border bg-card text-card-foreground shadow transition-all',
  {
    variants: {
      layout: {
        grid: 'flex flex-col space-y-2 p-5',
        list: 'flex items-center justify-between p-4',
        compact: 'flex items-center space-x-3 p-3 text-sm',
      },
    },
    defaultVariants: {
      layout: 'grid',
    },
  }
)
```

- Re-design `apps/web/src/app/(dashboard)/clients/page.tsx` (leads table) to support dynamic stacking below `768px` using `@/components/ui/card` structures in desktop hide formats (`hidden md:table-row`).

---

## Post-Design Constitution Check

- **Producto Piloto Primero**: PASS. Focused purely on enhancing Pilot experience.
- **Supabase y Migraciones Canónicas**: PASS. No database changes planned.
- **Contratos Tipados Entre Servicios**: PASS. API interfaces are not touched.
- **Testing y Gates de Calidad Obligatorios**: PASS. Tests and quality gates remain mandatory.
