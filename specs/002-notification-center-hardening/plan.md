# Implementation Plan: Notification Center Hardening

**Branch**: `002-notification-center-hardening` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-notification-center-hardening/spec.md`

## Summary

Add a production-ready notification center for approval operations. The web
header gets a role-scoped notification icon, counter, and dropdown; admins can
see and decide pending reservation/sale approvals; vendors can see their own
pending, approved, and rejected requests. Telegram receives deterministic
shortcuts for pending/approved/rejected lists and documentation links. The plan
keeps `approval_requests` as the source of truth for commercial state and adds a
minimal recipient/event layer only for notification read/dismiss/delivery
tracking and production auditability.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2.4, Next.js 16.2.6 in `apps/web`;
Python 3.13+ runtime expected by `apps/api`; FastAPI 0.135.1.

**Primary Dependencies**: Supabase JS/SSR, Supabase PostgreSQL/RLS, FastAPI,
ARQ/Redis worker jobs, Telegram Bot API, shadcn/Radix UI, Tailwind CSS 4,
Lucide/Hugeicons already present in the web UI.

**Storage**: Supabase PostgreSQL. `approval_requests` remains the source of
truth for approval state. Add a canonical migration under
`packages/database/supabase/migrations` only if per-recipient notification
state/read/dismiss/delivery records require persistence.

**Testing**: `pnpm typecheck:web`, `pnpm test:web`, `pnpm build:web`,
`pnpm test:api`, `pnpm verify:migrations`, and `pnpm contracts:generate` when
API contracts change.

**Target Platform**: Authenticated web application for desktop/mobile plus
FastAPI worker/webhook service for Telegram operations.

**Project Type**: Monorepo web application with API service, worker service,
database package, and generated contracts package.

**Performance Goals**: Header notification count visible on page load; role
list opens in under 1 second for pilot-sized organizations; approval decisions
remain visible within 2 minutes across web and Telegram; Telegram command
responses stay concise and readable.

**Constraints**: Human approval remains mandatory. No notification may trust a
free-form organization id. Vendors only see their own assigned/requested
approval data. Telegram callbacks must verify the linked sender role before
mutating approval state. External Telegram calls keep fixed Bot API host and
timeouts at or below 10 seconds.

**Scale/Scope**: Pilot production readiness for one or more organizations,
multiple admins/vendors per organization, 20+ lots per pilot project, and
role-scoped approval notifications for reservation and sale requests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Producto Piloto Primero**: PASS. Feature improves the existing web and
  Telegram reservation/sale approval flow and does not add autonomous approval,
  marketing CRM, or unrelated channels.
- **Geometría Espacial como Origen de Deslindes y Documentos**: PASS. No
  geometry rules are changed; notifications surface existing lot/project
  approval state.
- **Supabase y Migraciones Canónicas**: PASS. Any new persisted notification
  records must be added only under `packages/database/supabase/migrations` and
  verified with `pnpm verify:migrations`.
- **Contratos Tipados Entre Servicios**: PASS. New API surfaces must be defined
  in FastAPI source and generated into OpenAPI/client outputs; no hand-edited
  generated contracts.
- **Seguridad Multi-Tenant y Asignación de Vendedores**: PASS with required
  implementation gates. Header queries, Telegram commands, and callbacks must
  infer/validate organization and role from persisted membership/link records.
- **Testing y Gates de Calidad Obligatorios**: PASS. This feature touches web,
  approvals, Telegram, DB, and API contracts; tests and quality gates are
  mandatory before task completion.

## Project Structure

### Documentation (this feature)

```text
specs/002-notification-center-hardening/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/
├── src/app/(dashboard)/layout.tsx
├── src/app/(dashboard)/dashboard/page.tsx
├── src/components/dashboard/approvals/pending-approvals-panel.tsx
├── src/components/notifications/
│   ├── notification-bell.tsx
│   ├── notification-list.tsx
│   └── notification-item.tsx
├── src/lib/services/
│   ├── notifications.service.ts
│   └── approvals.service.ts
└── tests/
    ├── mvp-notifications.test.ts
    └── mvp-responsive.test.ts

apps/api/
├── api/v1/endpoints/
│   ├── approvals.py
│   ├── notifications.py
│   └── webhook.py
├── schemas/
│   ├── approval.py
│   └── notification.py
├── workers/tasks/
│   ├── approval_processor.py
│   ├── approval_notifier.py
│   └── message_processor.py
├── integrations/telegram_client.py
└── tests/
    ├── test_mvp_notifications.py
    ├── test_mvp_vendor_telegram.py
    └── test_notifications_fase7.py

packages/database/
├── supabase/migrations/
└── types/database.generated.ts

packages/contracts/
└── openapi/plotify-chat.v1.json
```

**Structure Decision**: Keep the existing monorepo split. Web owns header and
dashboard notification UI. API owns role-scoped notification/approval contracts,
Telegram command handling, callback authorization, and delivery audit. Database
migrations remain canonical in `packages/database`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |

No constitution violations identified.

## Phase 0 Research Summary

See [research.md](./research.md).

- Keep approval state canonical in approval requests; use notification records
  only for recipient/read/delivery metadata.
- Expose notification retrieval through role-scoped service/API boundaries
  rather than duplicating ad-hoc queries in UI components.
- Treat Telegram commands as deterministic operations before any LLM routing.
- Harden Telegram callbacks with linked user and admin membership validation.

## Phase 1 Design Summary

See [data-model.md](./data-model.md), [contracts/](./contracts/), and
[quickstart.md](./quickstart.md).

- Header notification center consumes role-scoped notification items.
- Admin approval actions reuse the existing approval decision processor.
- Vendor status visibility is read-only and limited to the vendor's own
  requests.
- Telegram shortcuts return bounded, role-scoped lists and safe documentation
  links.

## Post-Design Constitution Check

- **Producto Piloto Primero**: PASS. Scope remains reservation/sale operations,
  vendor/admin visibility, and Telegram support for the pilot.
- **Supabase y Migraciones Canónicas**: PASS. New persistent data is planned
  only through canonical database migrations.
- **Contratos Tipados Entre Servicios**: PASS. New API/command contracts are
  documented and must be generated from source.
- **Seguridad Multi-Tenant y Asignación de Vendedores**: PASS. Design requires
  role/tenant validation for web reads, web decisions, Telegram commands, and
  callback actions.
- **Testing y Gates de Calidad Obligatorios**: PASS. Quickstart and future
  tasks must include web, API, migration, contract, and production build gates.
