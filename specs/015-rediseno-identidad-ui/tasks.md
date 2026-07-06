# Tasks: Rediseño Integral de Identidad Visual y UX (Tinta y Marca)

**Input**: Design documents from `/specs/015-rediseno-identidad-ui/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [quickstart.md](./quickstart.md)

**Tests**: la constitución exige gates; cada fase cierra con `pnpm typecheck:web && pnpm test:web && pnpm build:web` más los greps de verificación del plan. Los tests de guardia (T024, T045) se escriben para fallar contra el estado actual.

**Organization**: tareas agrupadas por user story. No avanzar de fase sin cerrar el gate anterior.

**⚠ Protocolo por página (plan.md §Protocolo de edición por página)**: antes de editar cada página, anunciar al usuario qué página viene y preguntar si se mantiene la UX (solo re-skin) o se cambia (→ generar 2–3 wireframes y esperar elección antes de codear). Aplica especialmente a T028–T032 (barrido por módulo), T036 (operations) y T037 (mesa móvil). El visor (T041) no admite cambios de UX.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo si toca archivos distintos y no depende de tareas incompletas.
- **[Story]**: US1–US5 según `spec.md`.

## Phase 1: Setup

- [x] T001 Confirmar feature activo en `/Users/matiasignacio/Developer/plotify/.specify/feature.json` = `specs/015-rediseno-identidad-ui` y rama `015-rediseno-identidad-ui`
- [x] T002 Ejecutar `git status --short` y `codegraph sync .` en `/Users/matiasignacio/Developer/plotify`; dejar constancia en el PR de que la rama parte con la adopción parcial del Spinner ya en curso (heredada de `codex/update-brand-assets`)

---

## Phase 2: Foundational — US1 Identidad (tokens, tipografía, marca) ⚠ bloquea todo lo demás

- [x] T003 Reescribir tokens en `/Users/matiasignacio/Developer/plotify/apps/web/src/app/globals.css`: paleta "Tinta nítida" en `:root` y `.dark` (superficies página/panel/tarjeta, sidebar oscuro fijo ambos temas, `--primary` carmesí `#A93439`/`#C24444` + foregrounds, `--destructive`, `--success/--warning/--info`, `--status-available/reserved/sold` + foregrounds, `--brand`, radios base 12px/panel 16px); eliminar `--brand-gradient`; agregar keyframes `spinner-conveyor`/`brand-sweep` (no existían aún) y conservar regla reduced-motion
- [x] T004 Mapear en `@theme inline` de `globals.css` los nuevos tokens (`--color-status-*`, `--color-brand`, `--font-display`, `--font-serif`) para generar utilities (`bg-status-available`, `font-display`, etc.)
- [x] T005 Reemplazar fuentes en `/Users/matiasignacio/Developer/plotify/apps/web/src/app/layout.tsx`: cargar Bricolage Grotesque (`--font-display`, 500/600), Onest (`--font-sans`, 400/500), Source Serif 4 (`--font-serif`) vía `next/font/google` con `display: 'swap'`; mantener Geist Mono; eliminar Inter y Geist Sans
- [x] T006 [P] Tokenizar color de marca: en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/ui/brand-mark-paths.tsx` reemplazar `#16A34A` por `var(--brand)` (fallback al hex) y aceptar override por prop; Spinner y BrandLoader lo heredan (fallback = verde vigente, decisión 2026-07-03: el logo se mantiene verde)
- [x] T007 [P] Crear `/Users/matiasignacio/Developer/plotify/apps/web/src/components/brand/brand-mark.tsx`: componente `BrandMark` estático (isotipo sin animación, tamaño por className) para sidebar/login/emails de la app, reusando `brand-mark-paths`
- [x] T008 [P] Actualizar `/Users/matiasignacio/Developer/plotify/design.md` a v2.0.0: frontmatter YAML sincronizado 1:1 con los tokens de T003 (light/dark/status/typography/spacing/radius, cada token con value+description), tabla de contraste AA por par, y secciones narrativas nuevas (dirección Tinta y Marca, regla carmesí primario vs destructive, superficies sin hairlines, lista blanca MapLibre, políticas PageShell/PageHeader/tabs)
- [x] T009 [P] Actualizar `/Users/matiasignacio/Developer/plotify/brand/colors.md`: decisión pendiente resuelta (acento UI = carmesí `#A93439`, ya vigente; el logo se mantiene verde `#16A34A` como único color de marca, sin mezclarse con el carmesí de UI); documentado el flujo de recolor a futuro: editar SVG maestros → `generate_assets.py` → cero cambios de código
- [x] T010 Ajustar tipografía base: `PageHeader` usa `font-display font-semibold` (Bricolage solo tiene 500/600, no 700); `globals.css` @layer base define que h1–h3 heredan display; cifras KPI (`dashboard-kpis.tsx`, `operations/KPICards.tsx`) usan `font-display`. Montos/ROL en `font-mono` se aplican por módulo durante el barrido (Fase 5), donde vive ese contenido
- [x] T011 `font-serif` en el documento de la mesa (`mesa-documento.tsx`) ya estaba aplicado en el JSX; ahora resuelve a Source Serif 4 real gracias al mapeo `--font-serif` (T004/T005) — line-height (`leading-8`) se mantiene, pendiente verificación visual en quickstart
- [x] T012 Verificado contraste AA de los pares críticos (primary/destructive/success/warning/status/sidebar) en ambos temas; se corrigió `--muted-foreground` claro de `#6B7280`→`#4B5563` por fallar 4.47:1 sobre `--background`; tabla completa documentada en design.md v2

**Gate Fase 2 (US1)**:

```bash
pnpm typecheck:web && pnpm test:web && pnpm build:web
# + recorrido visual claro/oscuro con dev server (quickstart §1)
```

---

## Phase 3: US2 — Shell de navegación (sidebar plano, header, ⌘K, tabs)

- [x] T013 Reestructurar `/Users/matiasignacio/Developer/plotify/apps/web/src/components/app-sidebar.tsx`: lista plana Buscar(⌘K)/Panel/Proyectos/Escrituras/Leads(badge)/Vendedores/Agente + footer Configuración/NavUser; `variant="inset"`; logo = `BrandMark` (T007) sin gradiente; ítem activo por sub-ruta (`/documentos/*` → Escrituras, `/agente/*` → Agente); eliminar `navItems` anidados y `NavMain` de grupos o simplificarlo a lista plana
- [x] T014 [P] Fijar tokens `--sidebar-*` oscuros para ambos temas en `globals.css` (sidebar `#121212`/`#191919`, foreground claro, accent elevado, ring) y verificado drawer móvil (375px) + cookie de colapso + atajo de teclado del trigger
- [x] T015 Crear `/Users/matiasignacio/Developer/plotify/apps/web/src/components/command-palette.tsx`: CommandDialog global con ⌘K/Ctrl+K (listener en cliente), grupos Navegación (6 secciones + settings), Proyectos (workspace, vía servicio existente con scoping actual), Acciones (cambiar tema); montado en `(dashboard)/layout.tsx`; verificado abriendo con clic y navegando
- [x] T016 Limpiar header en `/Users/matiasignacio/Developer/plotify/apps/web/src/app/(dashboard)/layout.tsx`: SidebarTrigger + HeaderTitle/breadcrumb + NotificationBell + avatar; sin búsqueda y sin toggle de tema (el switch sigue en NavUser + acción en ⌘K; auth conserva ModeToggle); adaptado a `SidebarInset` (panel suave, radio 16px, sin hairline); shell replicado en `/Users/matiasignacio/Developer/plotify/apps/web/src/app/(super-admin)/layout.tsx` y `SuperAdminSidebar` (quitado `bg-slate-50` crudo y gradiente placeholder; no se pudo verificar visualmente por falta de rol super-admin en la cuenta de prueba, pero build/typecheck pasan)
- [x] T017 [P] Tabs internos Escrituras: componente `documents/escritura-tabs.tsx` (links) Mesa·Historial·Plantillas para `/documentos`, `/documentos/historial`, `/documentos/plantillas` conservando URLs; de paso se migró `/documentos/historial` a PageShell/PageHeader (no lo tenía)
- [x] T018 [P] Tabs internos Agente: componente `agente/agente-tabs.tsx` Chat·Skills·Integraciones para `/agente`, `/agente/skills`, `/agente/integrations`; el resto de esas páginas queda con su estilo viejo (off-brand, hero azul) para la Fase 5 con protocolo de confirmación, no se tocó UX
- [x] T019 Ajustado `bento-grid.tsx` (quitado `border border-border`, superficie sin hairline sobre panel); `page-shell.tsx` no requirió cambios; radios 12/16px llegan gratis del rebase de `--radius` en T003
- [x] T020 Actualizados `fase3-components.test.ts`, `fase4-historial.test.ts` y `documentos-proyecto.test.ts` (navItems plano, ESCRITURA_TABS) — 741 tests verdes

**Gate Fase 3 (US2)**: todas las rutas navegables desde sidebar/tabs/palette, desktop y móvil; gates verdes. ✅ Verificado con dev server (claro/oscuro, desktop 990/1400px, móvil 375px), typecheck/test(741)/build verdes.

**Hallazgo fuera de alcance corregido**: `/dashboard` (`app/(dashboard)/dashboard/page.tsx`) usaba `xl:col-span-12` en vez de `md:col-span-12` en sus wrappers de `BentoGrid` — bug preexistente que rompía el layout (paneles colapsados a 1 columna, texto superpuesto) en todo el rango 768–1279px. Corregido durante la verificación visual de esta fase.

---

## Phase 4: US3 — Feedback de marca (loaders, badges, empty states)

- [x] T021 Completada migración a `Spinner` en los ~36 archivos con `Loader2|LoaderCircle|Loading0[123]Icon|div animate-spin` (incluye vendors, notifications, super-admin, labs, geometry-viewer/assignment, legal, ui/map, ui/sonner); 0 ocurrencias restantes verificado por grep
- [x] T022 [P] `BrandLoader` reservado a `auth/callback` (único full-page loading real encontrado); no hay otros candidatos full-page en el dashboard
- [x] T023 [P] Creado `components/ui/status-badge.tsx` (variantes available/reserved/sold/success/warning/danger/info/neutral); migrados `LotStatusBadge` (envoltorio delgado), `OperationsTable`, `LotInfoView`, `LotEditForm`, `LotHoverCard` (geometry-viewer); de paso se corrigió que "vendido" usaba `--destructive` (rojo) en vez de neutro — inconsistente con `LotStatusBadge` y con la dirección de diseño; se eliminaron `getEstadoBadgeClasses`/`bgClass`/`textClass` de `lot.model.ts` (dead code tras la migración) y se agregó `estadoToStatusVariant`
- [x] T024 [P] Test de guardia creado en `tests/design/loaders-guard.test.ts` (fs scan recursivo) — en verde
- [x] T025 Migrados a `EmptyState`: aprobaciones pendientes (dashboard), skills-grid, plantillas (generation-wizard), clientes de proyecto, y las guardas "No hay Workspace activo" (clients/vendors page). Diferido a Fase 5 (T032): los ~8 "No hay…" de super-admin (audit-logs, organizations, users, projects, prompt-ops) — están en páginas 100% sin PageShell/tokens; conviene resolverlos junto con el resto de esa página, no aislado. Dejados como texto simple (ya en `text-muted-foreground`, no crudos): "no resultados de filtro" dentro de tablas ya pobladas (blocks-table, documents-history-table, sii-lot-detail) — no encajan en la tarjeta grande de EmptyState dentro de una fila de tabla
- [x] T026 Único Suspense con fallback encontrado en todo `src/` (`operations/page.tsx`) — KPIs a `Skeleton` en grid 3-col, tabla a `SkeletonTable` (ya existente en `skeleton-card.tsx`)

**Hallazgo fuera de alcance corregido**: `operations.service.ts:getAllActiveLots` asumía `lot.lot_records` siempre array; para cierta data llega como objeto único desde PostgREST y el spread `[...lot.lot_records]` tiraba `TypeError` y tumbaba `/operations` con 500. Parche defensivo aplicado (normaliza a array); causa raíz (posible FK duplicada o relación mal declarada) queda flageada como tarea aparte, no se investigó a fondo por ser ajena al alcance visual del SDD.

**Gate Fase 4 (US3)**: grep SC-002 = 0 ✅; T024 en verde ✅; typecheck/test(743)/build verdes ✅; verificado visualmente (dashboard EmptyState, /operations StatusBadge+Skeleton) en oscuro.

---

## Phase 5: US4 — Barrido de coherencia por módulo

> Orden: cada módulo = colores crudos → tokens, lucide → hugeicons, PageShell/PageHeader, verificación claro/oscuro antes de pasar al siguiente.

- [x] T027 Creado `lib/map/lot-colors.ts`: `LOT_COLORS`/`INFRA_COLORS`/`MAP_SELECTION_COLOR`/`MAP_LABEL_TEXT_COLOR`/`MAP_LABEL_SELECTED_TEXT_COLOR` — única lista blanca; migrados `MapLotLayers.tsx` (importa desde ahí en vez de constantes locales), `lib/models/lot.model.ts` (`ESTADO_CONFIG` ahora deriva de `LOT_COLORS`), `geometry-viewer/index.tsx` (leyenda del mapa a `bg-status-*`). `map.tsx`/`MapPanel.tsx` no tenían colores de lote (solo defaults genéricos de marcador, fuera de alcance). De paso corregido: "vendido" en el mapa era rojo (`#ef4444`) — ahora gris oscuro distinguible de `sin_asignar`, consistente con la decisión de StatusBadge (T023)
- [x] T028 Módulo **proyectos** completo: `GeometryUploadPanel`, `LotReservationForm`, `LotVerificationPanel`, `detail/*` (clients-tab, document-viewer, documents-tab, lots-tab + EmptyState, overview-tab), `geometry-assignment/*` (AssignmentHoverCard, AssignmentSidePanel, index), `geometry-viewer/ItemDetailPanel` (nuevo token `--common-area` para áreas comunes, ver globals.css), `legal/*` (escritura-readiness-panel, legal-document-status-panel, legal-evidence-viewer, legal-variable-editor, title-alerts-list, title-case-panel, title-chain-timeline, title-narrative-editor), `variable-matrix/*` (molde-progress-header, producer-group, variable-inspector, variable-matrix, variable-row), `onboarding/ProjectMediaStep`, `viewer/BulkActionsPanel` + `LotEditForm`, `onboarding/new/page.tsx`. `ProjectCard`/`StageStepper` ya estaban limpios (no aparecían en el grep). Verificado con typecheck+test(743/744, 1 falla del guard test = esperada por lo que falta)
- [x] T029 Módulo **documentos/mesa** completo: `documentos/page.tsx` (ACCESOS a tokens), `components/documents/mesa/*` (dato-chip, dato-popover, estado-preparacion, clausula-editor-inline, mesa-documento, mesa-encabezado, mesa-indice, panel-datos, pendientes-list, plantilla-editor, preparacion-matriz), `dashboard/documents/*` (documents-history-table, generation-wizard, sortable-article-item, template-builder, templates-list). Actualizado `tests/mesa-vocabulario.test.ts` (el test de contraste AA de dato-chip verificaba los hex crudos viejos; ahora verifica los tokens `success/info/warning` contra `--card`)
- [x] T030 Módulo **dashboard + operations** completo: `dashboard/page.tsx`/`dashboard-kpis`/`onboarding-checklist`/`KPICards`/`OperationsTable` ya estaban limpios (verificado, sin coincidencias); `approvals/*` (pending-approvals-panel, vendor-requests-panel) a tokens; `dashboard/header-title.tsx`, `skeleton-card.tsx`, `vendors-list.tsx` a tokens; `operations/page.tsx` reconstruida sobre `PageShell`+`PageHeader`+`BentoPanel` (sin h1 crudo) — cambio mecánico de envoltorio, sin tocar UX/estructura de KPIs/tabla (la responsividad real es T036)
- [x] T031 Módulo **agente + settings + auth + onboarding** completo: `agente/page.tsx` (hero + 3 tarjetas recoloreadas: sidebar dark + primary, info/success/common-area), `agente/integrations/page.tsx`, `settings/profile` + `settings/workspace` (aviso ámbar a warning), `auth/login`+`auth/onboarding` (bg + textos), `LoginForm`/`OnboardingForm` (error box), `mode-toggle.tsx`+`nav-user.tsx` (sol/luna a warning/info), `skill-detail-modal`+`skills-grid` (categoría builtin/mcp/custom → info/common-area/warning), `telegram-bot-setup`/`telegram-link-card` (verde Telegram brand `#2AABEE` se deja igual, es marca de terceros), `workspace-settings-form` (aviso a common-area), `InviteVendorDialog`/`VendorActions`, `vendors/page.tsx` (badge admin a primary), `ayuda/vendedor/page.tsx` (convertida a PageShell/PageHeader, no la tenía). `onboarding/new`/`ProjectMediaStep`/`sonner.tsx` ya se habían hecho en T021/T028
- [x] T032 Módulo **super-admin + labs** completo: `audit-logs`, `organizations`, `users`, `projects`, `page.tsx` (super-admin home) a PageShell/PageHeader+EmptyState+tokens; `prompt-ops/page.tsx` + `prompt-ops/[promptId]/page.tsx` (breadcrumb + PageHeader); `prompt-editor`/`prompt-history`/`prompt-ops-table`/`prompt-sandbox` a tokens (slate→muted/foreground/border, green→success, red→destructive, blue/orange→info/warning); `labs/escrituras/escrituras-lab-client.tsx` (862 líneas, el archivo más grande del barrido) — colores crudos a tokens + envoltorio reconstruido sobre `PageShell`+`PageHeader` (eyebrow "Laboratorio local" + action con los 3 botones). Actualizado `tests/fase2-components.test.ts`: `CATEGORY_BADGE` verificaba literales "blue"/"green"/"orange" en className; ahora verifica los tokens `info`/`success`/`warning`
- [x] T033 [P] Migrar imports `lucide-react` → Hugeicons en los 28 archivos de producto que aún los tenían (excepción documentada: primitivas `components/ui/*`, que siguen con lucide interno vía shadcn). Mapa de equivalencias aplicado (nombre lucide → hugeicons, alias para conservar el identificador local en el JSX): `AlertCircle→AlertCircleIcon`, `AlertTriangle→Alert02Icon`, `ArrowRight→ArrowRight01Icon`, `AtSign→MailAtSign01Icon`, `Binary→BinaryCodeIcon`, `Bot/BotIcon→BotIcon`, `Calendar→Calendar01Icon`, `Check→Tick02Icon`, `CheckCircle(2)→CheckmarkCircle02Icon`, `Chevron{Down,Right,Up}→Arrow{Down,Right,Up}01Icon`, `ClipboardList→ClipboardIcon`, `Copy→Copy01Icon`, `Database→DatabaseIcon`, `DollarSign→Dollar01Icon`, `Download→Download01Icon`, `ExternalLink→LinkSquare02Icon`, `Eye/EyeOff→View(Off)Icon`, `FileCheck2→FileValidationIcon`, `FileCog→FileSyncIcon`, `FileText→File02Icon`, `FlaskConical→TestTube01Icon`, `GripVertical→DragDropVerticalIcon`, `Hammer→LegalHammerIcon`, `Landmark→BankIcon`, `LayoutTemplate→Layout01Icon`, `Library→LibraryIcon`, `ListFilter→FilterIcon`, `Lock→LockIcon`, `LockKeyhole→LockKeyIcon`, `MapPin→Location01Icon`, `Pen(Line)/Pencil(Line)→PencilEdit02Icon`, `Plus→PlusSignIcon`, `RefreshCw→Refresh01Icon`, `Save→FloppyDiskIcon`, `Search→SearchIcon`, `Send→SentIcon`, `ShieldCheck→Shield02Icon`, `ShoppingCart→ShoppingCart01Icon`, `Star→StarIcon`, `ThumbsDown/Up→ThumbsDown/UpIcon`, `Trash2→Delete02Icon`, `Unplug→Unlink01Icon`, `Upload→Upload01Icon`, `User→UserIcon`, `WebhookIcon→WebhookIcon`, `X→Cancel01Icon`, `XCircle→CancelCircleIcon`, `Zap→ZapIcon`. Caso especial: `panel-datos.tsx` y `producer-group.tsx` guardaban el componente de ícono en un `Record<_, LucideIcon>` para renderizarlo dinámico (`const Icon = MAP[key]; <Icon .../>`) — como Hugeicons no expone el ícono como componente sino como dato (`IconSvgElement`) que se pasa a `<HugeiconsIcon icon={...} />`, se cambió el tipo del record a `IconSvgElement` y el render a `<HugeiconsIcon icon={Icon} .../>`. Verificado: 0 imports de `lucide-react` fuera de `components/ui/*`, typecheck limpio, test(744/744) verde, `pnpm build` verde
- [x] T034 [P] Test de guardia de colores en `/Users/matiasignacio/Developer/plotify/apps/web/tests/design/raw-colors-guard.test.ts`: escanea `src/` con la regex del plan, lista blanca `lib/map/lot-colors.ts` — ya existía (creado en T027) y ya cumple el criterio exacto de esta tarea; verificado en verde (0 offenders) tras cerrar T032
- [x] T035 Verificación dark mode integral: recorrido con dev server en `/dashboard`, `/projects` (+detalle), `/documentos` (mesa), `/agente`, `/operations`, `/vendors`, `/settings/workspace` en oscuro y claro (localStorage `theme` + verificado con `preview_inspect` sobre `body`/`main` para confirmar el token real, no solo la captura visual — la screenshot tool tuvo un frame stale puntual en el cambio de tema que no reflejaba el DOM real). Sin errores de consola. Único hallazgo: overlap de los tabs del detalle de proyecto (`Vista General|Lotes|Visor|Documentos|Clientes|Legal`) con los botones Editar/Eliminar en anchos ~768-900px — es un problema de responsive preexistente (no introducido por este SDD), en el alcance de Fase 6 (T036+), no de este gate de oscuro/tokens

**Gate Fase 5 (US4)**: greps SC-001/SC-003 = 0 ✅ (`raw-colors-guard`/`loaders-guard` en verde); SC-004 al 100% (lucide→hugeicons completo, T033); gates verdes: typecheck ✅, test 744/744 ✅, `pnpm build` ✅, verificación visual oscuro/claro ✅.

---

## Phase 6: US5 — Responsive de producción + QA final

- [x] T036 Reconstruido `/operations` responsive: `KPICards.tsx` — grid `grid-cols-1 sm:grid-cols-3` (son 3 KPIs, no 4; 2 columnas dejaba el tercero huérfano en su propia fila, se prefirió el salto directo a 3 en `sm`); `OperationsTable.tsx` — filtros en `flex-col sm:flex-row`, tabla envuelta en `overflow-x-auto` (scroll propio, celdas `whitespace-nowrap`) en vez de vista tarjeta (a esta tabla de 5 columnas le alcanza con scroll horizontal, no necesita reestructurarse en tarjetas), botones Anterior/Siguiente con `min-h-11` (objetivo táctil, ver T039); `BentoPanel` con `p-4 sm:p-6`. Verificado en 375/768/1440 sin overflow horizontal de página (`document.documentElement.scrollWidth === innerWidth`), claro y oscuro
- [x] T037 Mesa de escritura móvil: replicado patrón del visor en `/Users/matiasignacio/Developer/plotify/apps/web/src/components/documents/mesa/mesa-escritura.tsx` — documento a ancho completo, índice y panel de datos vía bottom `Sheet` con `useIsMobile`, alturas `80dvh`, acciones fijas inferiores accesibles. Guard estructural agregado en `apps/web/tests/design/sdd15-shell-guard.test.ts`
- [x] T038 [P] Wrappers `overflow-x-auto` o composición tarjeta para tablas restantes (historial, blocks-table, leads, vendors, super-admin): verificado que las tablas principales usan `Table` con wrapper interno `overflow-x-auto` o wrappers explícitos; quickstart documenta la revisión responsive final
- [x] T039 [P] Targets táctiles ≥44px en acciones primarias móviles: tabs internos a `min-h-11`, ítems de sidebar default `h-11`, botones de reserva/venta/verificación/edición de lote con `min-h-11`/`size-11`
- [ ] T040 Recorrido 375/768/1024/1440 de TODAS las rutas renderizables (lista en quickstart §3) verificando overflow horizontal, en ambos temas; corregir hallazgos
- [ ] T041 Regresión del visor de proyecto: flujo completo desktop+móvil (selección de lote → sheet, toolbar, export) sin cambios de comportamiento
- [x] T042 [P] Regenerar assets de marca si el usuario ya recoloreó los SVG (`cd apps/api && ./.venv/bin/python ../../brand/scripts/generate_assets.py`); no aplica en esta iteración porque no hubo recolor de SVG maestros. Flujo documentado en `brand/colors.md` y `quickstart.md`
- [x] T043 [P] Completar checklist `/Users/matiasignacio/Developer/plotify/specs/015-rediseno-identidad-ui/checklists/diseno-ux.md`
- [x] T044 Gates finales: `pnpm typecheck:web`, `pnpm test:web` (749/749), `pnpm build:web`, `pnpm --filter web lint`, `pnpm format:check` y los 3 greps del plan en 0. `graphify update .` no está disponible en este entorno (`command not found`); se ejecutó `codegraph sync .` como sincronización disponible
- [x] T045 Actualizar memoria del proyecto (`design-direction-tinta-nitida`) con el estado final implementado y cualquier desviación de calibración — agregado `plotify_memori/50 - Implementaciones/SDD 015 Rediseño Identidad UI - Tinta Nitida.md`

## Dependencies

- T003–T005 bloquean todo (tokens/fuentes).
- T006–T007 bloquean T013 (logo del sidebar).
- T013–T016 bloquean T017–T019 (shell antes de tabs/superficies).
- T023 (StatusBadge) y T027 (lot-colors) bloquean T028–T032 (el barrido los consume).
- T036–T041 requieren fases anteriores cerradas.
- [P] solo dentro de su fase.
