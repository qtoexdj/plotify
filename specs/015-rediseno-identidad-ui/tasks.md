# Tasks: Rediseño Integral de Identidad Visual y UX (Tinta y Marca)

**Input**: Design documents from `/specs/015-rediseno-identidad-ui/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [quickstart.md](./quickstart.md)

**Tests**: la constitución exige gates; cada fase cierra con `pnpm typecheck:web && pnpm test:web && pnpm build:web` más los greps de verificación del plan. Los tests de guardia (T024, T045) se escriben para fallar contra el estado actual.

**Organization**: tareas agrupadas por user story. No avanzar de fase sin cerrar el gate anterior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo si toca archivos distintos y no depende de tareas incompletas.
- **[Story]**: US1–US5 según `spec.md`.

## Phase 1: Setup

- [ ] T001 Confirmar feature activo en `/Users/matiasignacio/Developer/plotify/.specify/feature.json` = `specs/015-rediseno-identidad-ui` y rama `015-rediseno-identidad-ui`
- [ ] T002 Ejecutar `git status --short` y `codegraph sync .` en `/Users/matiasignacio/Developer/plotify`; dejar constancia en el PR de que la rama parte con la adopción parcial del Spinner ya en curso (heredada de `codex/update-brand-assets`)

---

## Phase 2: Foundational — US1 Identidad (tokens, tipografía, marca) ⚠ bloquea todo lo demás

- [ ] T003 Reescribir tokens en `/Users/matiasignacio/Developer/plotify/apps/web/src/app/globals.css`: paleta "Tinta nítida" en `:root` y `.dark` (superficies página/panel/tarjeta, sidebar oscuro fijo ambos temas, `--primary` carmesí `#A93439`/`#C24444` + foregrounds, `--destructive`, `--success/--warning/--info`, `--status-available/reserved/sold` + foregrounds, `--brand`, radios base 12px/panel 16px); eliminar `--brand-gradient`; conservar keyframes `spinner-conveyor`/`brand-sweep` y regla reduced-motion
- [ ] T004 Mapear en `@theme inline` de `globals.css` los nuevos tokens (`--color-status-*`, `--color-brand`, `--font-display`, `--font-serif`) para generar utilities (`bg-status-available`, `font-display`, etc.)
- [ ] T005 Reemplazar fuentes en `/Users/matiasignacio/Developer/plotify/apps/web/src/app/layout.tsx`: cargar Bricolage Grotesque (`--font-display`, 500/600), Onest (`--font-sans`, 400/500), Source Serif 4 (`--font-serif`) vía `next/font/google` con `display: 'swap'`; mantener Geist Mono; eliminar Inter y Geist Sans
- [ ] T006 [P] Tokenizar color de marca: en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/ui/brand-mark-paths.tsx` reemplazar `#16A34A` por `var(--brand)` (fallback al hex) y aceptar override por prop; verificar que Spinner y BrandLoader lo hereden
- [ ] T007 [P] Crear `/Users/matiasignacio/Developer/plotify/apps/web/src/components/brand/brand-mark.tsx`: componente `BrandMark` estático (isotipo sin animación, tamaño por className) para sidebar/login/emails de la app, reusando `brand-mark-paths`
- [ ] T008 [P] Actualizar `/Users/matiasignacio/Developer/plotify/design.md` a v2.0.0: frontmatter YAML sincronizado 1:1 con los tokens de T003 (light/dark/status/typography/spacing/radius, cada token con value+description), tabla de contraste AA por par, y secciones narrativas nuevas (dirección Tinta y Marca, regla carmesí primario vs destructive, superficies sin hairlines, lista blanca MapLibre, políticas PageShell/PageHeader/tabs)
- [ ] T009 [P] Actualizar `/Users/matiasignacio/Developer/plotify/brand/colors.md`: resolver la decisión pendiente (acento UI = carmesí `#A93439`; el logo migrará a carmesí; documentar el flujo de recolor: editar SVG maestros → `generate_assets.py` → cero cambios de código)
- [ ] T010 Ajustar tipografía base: `PageHeader` (`/Users/matiasignacio/Developer/plotify/apps/web/src/components/dashboard/page-header.tsx`) usa `font-display`; definir en `globals.css` @layer base que h1–h3 heredan display; cifras KPI (`dashboard-kpis.tsx`, `operations/KPICards.tsx`) usan `font-display` y montos/ROL `font-mono`
- [ ] T011 Aplicar `font-serif` real al documento de la mesa en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/documents/mesa/mesa-documento.tsx` (Source Serif 4) y verificar legibilidad de line-height existente
- [ ] T012 Verificar contraste AA de cada par de tokens en ambos temas (tabla de T008) y ajustar valores si algún par falla; documentar resultado en design.md v2

**Gate Fase 2 (US1)**:

```bash
pnpm typecheck:web && pnpm test:web && pnpm build:web
# + recorrido visual claro/oscuro con dev server (quickstart §1)
```

---

## Phase 3: US2 — Shell de navegación (sidebar plano, header, ⌘K, tabs)

- [ ] T013 Reestructurar `/Users/matiasignacio/Developer/plotify/apps/web/src/components/app-sidebar.tsx`: lista plana Buscar(⌘K)/Panel/Proyectos/Escrituras/Leads(badge)/Vendedores/Agente + footer Configuración/NavUser; `variant="inset"`; logo = `BrandMark` (T007) sin gradiente; ítem activo por sub-ruta (`/documentos/*` → Escrituras, `/agente/*` → Agente); eliminar `navItems` anidados y `NavMain` de grupos o simplificarlo a lista plana
- [ ] T014 [P] Fijar tokens `--sidebar-*` oscuros para ambos temas en `globals.css` (sidebar `#121212`/`#191919`, foreground claro, accent elevado, ring) y verificar drawer móvil + cookie de colapso + atajo de teclado del trigger
- [ ] T015 Crear `/Users/matiasignacio/Developer/plotify/apps/web/src/components/command-palette.tsx`: CommandDialog global con ⌘K/Ctrl+K (listener en cliente), grupos Navegación (6 secciones + settings), Proyectos (workspace, vía servicio existente con scoping actual), Acciones (cambiar tema); montarlo en `(dashboard)/layout.tsx`
- [ ] T016 Limpiar header en `/Users/matiasignacio/Developer/plotify/apps/web/src/app/(dashboard)/layout.tsx`: SidebarTrigger + HeaderTitle/breadcrumb + NotificationBell + ModeToggle + avatar; sin búsqueda; adaptar a `SidebarInset` (panel suave, radio 16px); replicar shell en `/Users/matiasignacio/Developer/plotify/apps/web/src/app/(super-admin)/layout.tsx` y `SuperAdminSidebar`
- [ ] T017 [P] Tabs internos Escrituras: layout o componente de tabs (links) Mesa·Historial·Plantillas para `/documentos`, `/documentos/historial`, `/documentos/plantillas` conservando URLs (`/Users/matiasignacio/Developer/plotify/apps/web/src/app/(dashboard)/documentos/`)
- [ ] T018 [P] Tabs internos Agente: Chat·Skills·Integraciones para `/agente`, `/agente/skills`, `/agente/integrations` (`/Users/matiasignacio/Developer/plotify/apps/web/src/app/(dashboard)/agente/`)
- [ ] T019 Ajustar `/Users/matiasignacio/Developer/plotify/apps/web/src/components/dashboard/page-shell.tsx` y `bento-grid.tsx` a la superficie nueva (tarjetas sin hairline sobre panel, radios 12–16px) sin romper páginas aún no migradas
- [ ] T020 Actualizar tests afectados por el shell (sidebar/nav/layout) en `/Users/matiasignacio/Developer/plotify/apps/web/tests/`

**Gate Fase 3 (US2)**: todas las rutas navegables desde sidebar/tabs/palette, desktop y móvil; gates verdes.

---

## Phase 4: US3 — Feedback de marca (loaders, badges, empty states)

- [ ] T021 Completar migración a `Spinner` en los archivos restantes con `Loader2|LoaderCircle|Loading0[23]Icon|div animate-spin` (lista viva vía grep del plan; incluye vendors, notifications, super-admin, labs) — botones pendientes: `<Spinner className="size-4">` + disabled
- [ ] T022 [P] Reservar `BrandLoader` a pantallas completas: confirmar `auth/callback` y agregar a estados de carga full-page del dashboard si existen; degradación reduced-motion verificada
- [ ] T023 [P] Crear `/Users/matiasignacio/Developer/plotify/apps/web/src/components/ui/status-badge.tsx` (variantes: available/reserved/sold/success/warning/danger/info/neutral) consumiendo utilities de estado (T004); migrar `LotStatusBadge`, badges de mesa/legal/operations/historial a StatusBadge
- [ ] T024 [P] Test de guardia en `/Users/matiasignacio/Developer/plotify/apps/web/tests/design/loaders-guard.test.ts`: falla si aparecen `Loader2|LoaderCircle|Loading0[23]Icon` o divs spinner en `src/` (fs scan)
- [ ] T025 Migrar los ~24 textos "No hay…" a `EmptyState` (título+descripción+acción) en listas de leads, vendedores, documentos, historial, skills, notificaciones y super-admin
- [ ] T026 Reemplazar spinners centrados de Suspense por `Skeleton` con forma de contenido en documentos, operations y dashboard

**Gate Fase 4 (US3)**: grep SC-002 = 0; T024 en verde; gates verdes.

---

## Phase 5: US4 — Barrido de coherencia por módulo

> Orden: cada módulo = colores crudos → tokens, lucide → hugeicons, PageShell/PageHeader, verificación claro/oscuro antes de pasar al siguiente.

- [ ] T027 Crear `/Users/matiasignacio/Developer/plotify/apps/web/src/lib/map/lot-colors.ts`: constantes hex de capas MapLibre espejo de los tokens de estado (única lista blanca); migrar `components/ui/map.tsx`, `MapLotLayers`, `MapPanel` y popups a tokens/constantes
- [ ] T028 Módulo **proyectos**: `ProjectCard`, `StageStepper`, `GeometryUploadPanel`, `LotReservationForm`, `LotVerificationPanel`, `geometry-assignment/*`, `viewer/*` (BulkActionsPanel, LotEditForm, LotInfoView), `detail/*` (lots-tab, documents-tab, project-header)
- [ ] T029 Módulo **documentos/mesa**: `documentos/page.tsx` + historial + plantillas, `components/documents/mesa/*` (purple-900 y afines → tokens), `dashboard/documents/*`, `projects/legal/*` (title-case-panel, escritura-readiness, legal-document-status, variable-matrix)
- [ ] T030 Módulo **dashboard + operations**: `dashboard/page.tsx`, `dashboard-kpis`, `onboarding-checklist`, `approvals/*`, `operations/page.tsx` (rehacer sobre PageShell+PageHeader, sin h1 duplicado), `KPICards`, `OperationsTable`
- [ ] T031 Módulo **agente + settings + auth + onboarding**: páginas agente/skills/integrations (PageShell incluido), `profile-settings-form`, `workspace-settings-form`, `telegram-*`, `custom-skill-editor`, `LoginForm`, `OnboardingForm`, `onboarding/new`, `ProjectMediaStep`, `sonner.tsx` (toasts a tokens)
- [ ] T032 Módulo **super-admin + labs**: páginas y componentes de `(super-admin)` bajo PageShell/PageHeader + tokens (audit-logs, organizations, users, prompt-ops, escrituras-lab)
- [ ] T033 [P] Migrar imports `lucide-react` → Hugeicons en los ~30 archivos de producto (mapa de equivalencias en el PR); excepción documentada: primitivas `components/ui/*`
- [ ] T034 [P] Test de guardia de colores en `/Users/matiasignacio/Developer/plotify/apps/web/tests/design/raw-colors-guard.test.ts`: escanea `src/` con la regex del plan, lista blanca `lib/map/lot-colors.ts`
- [ ] T035 Verificación dark mode integral: recorrido claro/oscuro de los 5 módulos con dev server; corregir hallazgos

**Gate Fase 5 (US4)**: greps SC-001/SC-003 = 0; SC-004 al 100%; gates verdes.

---

## Phase 6: US5 — Responsive de producción + QA final

- [ ] T036 Reconstruir `/operations` responsive: KPIs `grid-cols-2 lg:grid-cols-4`, tabla en wrapper con scroll propio o vista tarjeta bajo `md`, padding vía PageShell (`/Users/matiasignacio/Developer/plotify/apps/web/src/app/(dashboard)/operations/page.tsx` + componentes)
- [ ] T037 Mesa de escritura móvil: replicar patrón del visor en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/documents/mesa/mesa-escritura.tsx` — documento a ancho completo, índice y panel de datos vía bottom `Sheet`/colapsables con `useIsMobile`, alturas `dvh`, acciones accesibles
- [ ] T038 [P] Wrappers `overflow-x-auto` o composición tarjeta para tablas restantes (historial, blocks-table, leads, vendors, super-admin) que empujen layout en 375px
- [ ] T039 [P] Targets táctiles ≥44px en acciones primarias móviles (botones de reserva/venta/verificación, tabs, ítems de sidebar)
- [ ] T040 Recorrido 375/768/1024/1440 de TODAS las rutas renderizables (lista en quickstart §3) verificando overflow horizontal, en ambos temas; corregir hallazgos
- [ ] T041 Regresión del visor de proyecto: flujo completo desktop+móvil (selección de lote → sheet, toolbar, export) sin cambios de comportamiento
- [ ] T042 [P] Regenerar assets de marca si el usuario ya recoloreó los SVG (`cd apps/api && ./.venv/bin/python ../../brand/scripts/generate_assets.py`); si no, dejar tarea documentada en el PR
- [ ] T043 [P] Completar checklist `/Users/matiasignacio/Developer/plotify/specs/015-rediseno-identidad-ui/checklists/diseno-ux.md`
- [ ] T044 Gates finales: `pnpm typecheck:web && pnpm test:web && pnpm build:web` + los 3 greps del plan en 0
- [ ] T045 Actualizar memoria del proyecto (`design-direction-tinta-nitida`) con el estado final implementado y cualquier desviación de calibración

## Dependencies

- T003–T005 bloquean todo (tokens/fuentes).
- T006–T007 bloquean T013 (logo del sidebar).
- T013–T016 bloquean T017–T019 (shell antes de tabs/superficies).
- T023 (StatusBadge) y T027 (lot-colors) bloquean T028–T032 (el barrido los consume).
- T036–T041 requieren fases anteriores cerradas.
- [P] solo dentro de su fase.
