# Feature Specification: Rediseño Integral de Identidad Visual y UX (Tinta y Marca)

**Feature Branch**: `015-rediseno-identidad-ui`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Rediseño integral de identidad visual y UX de la web app: tokens tinta+carmesí, Bricolage Grotesque/Onest, sidebar flotante plano de 6 ítems, command palette, Spinner/BrandLoader de marca, barrido de colores hardcodeados y responsive de producción en todas las páginas"

## Context

La plataforma está funcionalmente completa pero su capa visual se siente "armada a pedazos". La auditoría (ver [research.md](./research.md)) encontró causas medibles: 86 archivos con colores Tailwind crudos que rompen dark mode y contraste, una fuente cargada que no se usa, la serif de la mesa de escritura sin fuente real, 4 variantes de spinner, 2 librerías de iconos mezcladas y 4 páginas fuera del `PageShell`.

La dirección visual fue elegida por el usuario en un proceso iterativo (registrada en memoria del proyecto como `design-direction-tinta-nitida`):

- **Paleta "Tinta nítida"**: monocromo de alto contraste con acento **carmesí** `#A93439` (claro) / `#C24444` (oscuro). El usuario confirmó que el logo de `brand/` migrará de verde `#16A34A` a carmesí, por lo que el color del plano del isotipo debe quedar **tokenizado** (un solo punto de cambio).
- **Layout flotante**: sidebar **siempre oscuro** (`#121212` claro / `#191919` oscuro) como panel flotante redondeado; contenido en panel suave (`#F6F6F6` / `#161616`); tarjetas sin bordes hairline (separación por contraste de superficie); radios 12–16 px.
- **Tipografía** (según `brand/typography.md`): Bricolage Grotesque 500/600 (display: títulos, cifras KPI, wordmark), Onest 400/500 (UI/cuerpo/etiquetas), Geist Mono (ROL, folios, montos, códigos), Source Serif 4 solo dentro del documento de la mesa de escritura.
- **Sidebar plano de 6 ítems**: Panel, Proyectos, Escrituras, Leads, Vendedores, Agente; ítem "Buscar ⌘K" arriba; Configuración + usuario abajo. Sin grupos con etiqueta ni submenús. Historial/Plantillas pasan a tabs dentro de Escrituras; Skills/Integraciones a tabs dentro de Agente (las URLs existentes se conservan; los tabs son links).
- **Header limpio**: breadcrumb + campana + avatar. Sin barra de búsqueda. La búsqueda global vive en un command palette ⌘K.
- **Tema por defecto**: sistema (`prefers-color-scheme`). Claro y oscuro con la misma prioridad de diseño.
- **`design.md` es la fuente canónica de tokens** (protocolo de design tokens con frontmatter YAML, estilo Material/W3C): debe actualizarse a v2.0.0 en sincronía con `globals.css`.

Activos ya existentes que este feature adopta (no recrear):

- `brand/` — kit de marca maestro (mark, lockups, favicon, colors.md, typography.md, script `generate_assets.py` que puebla `apps/web` y `brand/dist`).
- `apps/web/src/components/ui/spinner.tsx` — **Spinner** de marca (isotipo animado, "conveyor" de capas de datos).
- `apps/web/src/components/ui/brand-loader.tsx` — **BrandLoader** para momentos de pantalla completa (splash, auth callback), con barrido de luz.
- `apps/web/src/components/ui/brand-mark-paths.tsx` — paths compartidos del isotipo (hoy con `#16A34A` hardcodeado → tokenizar).
- Keyframes `spinner-conveyor` y `brand-sweep` ya definidos en `globals.css`; adopción del Spinner ya iniciada en ~20 archivos de esta rama.

Patrón de oro UX a replicar (calidad confirmada por el usuario): el **visor de proyecto** (`components/projects/geometry-viewer/index.tsx`) — `useIsMobile` + panel lateral en desktop / bottom `Sheet` en móvil + alturas `100dvh` + toolbar compacta con wrap.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Identidad visual nueva en toda la app, claro y oscuro (Priority: P1)

Un usuario abre Plotify (en el tema de su sistema) y ve la nueva identidad: tipografía Bricolage/Onest, paleta tinta+carmesí, logo de marca real en el sidebar, favicon e íconos de app coherentes. Al cambiar de tema, cada superficie, texto y acento tiene su valor calibrado — nada se ve "invertido" ni ilegible.

**Why this priority**: los tokens y fuentes son la base de todo lo demás; sin ellos ninguna otra fase puede verificarse contra el diseño final.

**Independent Test**: con solo esta historia implementada, se puede recorrer cualquier página en ambos temas y validar tokens/fuentes con DevTools, aunque los componentes internos aún tengan estilos viejos.

**Acceptance Scenarios**:

1. **Given** la app corriendo, **When** se inspecciona `body`, **Then** la fuente computada es Onest y los `h1/h2` y cifras KPI usan Bricolage Grotesque; Inter y Geist Sans ya no se descargan.
2. **Given** el tema claro, **When** se leen las variables CSS, **Then** `--primary` resuelve al carmesí claro y las superficies/sidebar/panel a los valores de la dirección elegida; **When** se activa `.dark`, **Then** cada token cambia a su par oscuro calibrado (no inversión).
3. **Given** la mesa de escritura, **When** se renderiza el documento, **Then** usa Source Serif 4 (no la serif del sistema operativo).
4. **Given** el navegador, **When** se carga la app, **Then** el favicon y los íconos instalables provienen de `brand/dist` (regenerados), y el logo del sidebar es el mark de `brand/` (no el SVG placeholder de capas).
5. **Given** el archivo `brand-mark-paths.tsx`, **When** el usuario cambie el color de marca, **Then** basta modificar un único token (el verde `#16A34A` ya no está hardcodeado en componentes).

---

### User Story 2 - Navegación simple: sidebar plano, tabs y ⌘K (Priority: P1)

Un administrador navega con un sidebar flotante oscuro de 6 destinos directos, sin submenús. Encuentra Historial y Plantillas como tabs dentro de Escrituras, y Skills/Integraciones como tabs dentro de Agente. Busca cualquier página o proyecto con ⌘K. El header solo muestra breadcrumb, notificaciones y su avatar.

**Why this priority**: la navegación es la estructura perceptible de "profesionalismo"; el usuario la pidió explícitamente (organización del sidebar, sin búsqueda en header).

**Independent Test**: navegar todas las rutas existentes desde el nuevo sidebar y el palette, en desktop y móvil, sin URLs rotas.

**Acceptance Scenarios**:

1. **Given** el dashboard, **When** se observa el sidebar, **Then** contiene exactamente: Buscar (⌘K), Panel, Proyectos, Escrituras, Leads (con badge), Vendedores, Agente, y abajo Configuración + tarjeta de usuario; ningún grupo con etiqueta ni submenú colapsable.
2. **Given** el sidebar, **When** se compara con el diseño, **Then** es un panel flotante oscuro (variant inset/floating de shadcn) con el mismo fondo oscuro en ambos temas, ítem activo con fondo elevado e icono carmesí.
3. **Given** `/documentos/historial` o `/documentos/plantillas`, **When** se visita, **Then** la página Escrituras muestra tabs Mesa · Historial · Plantillas (links, URLs conservadas) y el sidebar marca "Escrituras" como activo; análogo para Agente (Chat · Skills · Integraciones).
4. **Given** cualquier página, **When** se presiona ⌘K (o clic en "Buscar"), **Then** se abre un command palette con navegación a las 6 secciones, settings y proyectos del workspace; Escape cierra y devuelve el foco.
5. **Given** viewport móvil (<768 px), **When** se abre el menú, **Then** el sidebar aparece como drawer (comportamiento shadcn existente) con la misma estructura plana.
6. **Given** el header, **When** se inspecciona, **Then** no existe input de búsqueda; solo trigger de sidebar, breadcrumb/título, campana, toggle de tema y avatar.

---

### User Story 3 - Estados de carga y feedback con la marca (Priority: P2)

Cualquier espera en la app se comunica con el Spinner de marca (isotipo animado) o con skeletons; las pantallas completas (auth callback, splash) usan BrandLoader. Los estados de lote y de proceso usan badges semánticos consistentes; las vistas vacías usan EmptyState.

**Why this priority**: los 60 usos de `animate-spin` en 4 idiomas distintos son la inconsistencia más visible; el usuario creó Spinner/BrandLoader específicamente para esto.

**Independent Test**: forzar estados de carga (red lenta / Suspense) en cada módulo y verificar que solo aparecen Spinner, BrandLoader o Skeleton.

**Acceptance Scenarios**:

1. **Given** el código de `apps/web/src`, **When** se busca `Loader2|LoaderCircle|Loading02Icon|Loading03Icon`, **Then** no hay ocurrencias en código de producto; los spinners ad-hoc (`div` con `animate-spin`) tampoco existen.
2. **Given** un botón que envía un formulario, **When** está pendiente, **Then** muestra `<Spinner className="size-4">` + texto, y queda deshabilitado.
3. **Given** `auth/callback` o una carga de página completa, **When** se espera, **Then** se muestra BrandLoader centrado (tamaño grande) — y en ningún otro contexto pequeño.
4. **Given** listas/tablas con Suspense, **When** cargan, **Then** usan Skeleton con la forma del contenido (no spinner centrado).
5. **Given** `prefers-reduced-motion: reduce`, **When** se muestra Spinner o BrandLoader, **Then** la animación queda efectivamente estática (regla global existente) y la espera sigue siendo perceptible (opacidad/texto).
6. **Given** cualquier estado disponible/reservado/vendido o éxito/advertencia/peligro/info, **When** se renderiza un badge, **Then** proviene del componente `StatusBadge` con tokens semánticos (no clases crudas por archivo).

---

### User Story 4 - Coherencia visual por página: tokens, iconos y layout (Priority: P2)

Al navegar entre cualquier par de páginas (dashboard, proyectos, mesa, leads, settings, super-admin), el usuario percibe un solo producto: mismos márgenes y ancho (PageShell), un solo `h1` (PageHeader), una sola familia de iconos, y ningún color fuera del sistema de tokens — en ambos temas.

**Why this priority**: es el barrido que elimina la sensación de collage; depende de que US1 defina los tokens.

**Independent Test**: greps automatizados (colores crudos, imports de lucide) + recorrido visual por módulo en claro/oscuro.

**Acceptance Scenarios**:

1. **Given** `apps/web/src`, **When** se ejecuta el grep de clases de paleta cruda (`bg|text|border|ring`-`{slate,gray,zinc,red,blue,green,emerald,amber,purple,...}-N`), **Then** el resultado es cero fuera de la lista blanca documentada (estilos de capas MapLibre centralizados).
2. **Given** cualquier página del dashboard o super-admin, **When** se renderiza, **Then** está envuelta en PageShell y su título usa PageHeader (operations, agente, skills e integraciones incluidas; el `h1` duplicado de operations se elimina).
3. **Given** el código de producto, **When** se buscan imports de `lucide-react`, **Then** solo quedan dentro de primitivas `components/ui/*` generadas por shadcn; todo lo demás usa Hugeicons.
4. **Given** los estados de lote (disponible/reservado/vendido), **When** se muestran en KPIs, mapa, tablas o badges, **Then** usan los tokens de estado definidos en `design.md` v2 (utilities generadas por `@theme`), idénticos en toda la app.
5. **Given** el tema oscuro, **When** se recorre cada módulo migrado, **Then** no hay fondos claros pegados (`bg-*-50`), textos invisibles ni bordes desaparecidos.

---

### User Story 5 - Responsive de producción en todas las páginas (Priority: P3)

Un vendedor en terreno usa la app desde su teléfono (375 px): ninguna página produce scroll horizontal, las tablas se adaptan (scroll contenido o vista de tarjetas), la mesa de escritura reorganiza sus paneles como bottom sheet — replicando el patrón del visor de proyecto — y los targets táctiles son cómodos.

**Why this priority**: cierra el criterio "nivel de producción"; requiere que el layout (US2/US4) esté estable.

**Independent Test**: recorrido de todas las rutas renderizables en 375/768/1024/1440 px con verificación de overflow, más prueba táctil de acciones principales.

**Acceptance Scenarios**:

1. **Given** cualquier ruta del dashboard en 375 px, **When** se carga, **Then** no hay scroll horizontal de página (`document.scrollingElement.scrollWidth <= innerWidth`).
2. **Given** `/operations` en móvil, **When** se visita, **Then** los KPIs apilan, la tabla va en contenedor con scroll propio o vista tarjeta, y el padding es responsivo (página reconstruida sobre PageShell).
3. **Given** la mesa de escritura en móvil, **When** se abre un caso, **Then** el documento ocupa el ancho completo y el índice/panel de datos se acceden vía bottom sheet o secciones colapsables (patrón del visor de proyecto), sin perder acciones.
4. **Given** tablas de historial/leads/vendedores en móvil, **When** se renderizan, **Then** ninguna empuja el layout: usan wrapper `overflow-x-auto` o composición en tarjetas.
5. **Given** botones y controles primarios en móvil, **When** se miden, **Then** el área táctil es ≥44 px de alto.
6. **Given** el visor de proyecto, **When** se prueba tras el rediseño, **Then** conserva intacto su comportamiento responsive actual (regresión prohibida).

---

### Edge Cases

- **Fallo de carga de fuentes**: `next/font` con `display: swap` y fallbacks del sistema; la app debe ser usable sin FOIT y sin CLS perceptible (ajuste de métricas de fallback).
- **Recolor de marca**: cuando el usuario cambie el verde por carmesí en `brand/*.svg` y regenere assets, la web no debe requerir cambios de código (el color del plano en componentes sale de un token/prop).
- **Doble rol del carmesí (marca + crítico)**: `--primary` (carmesí) y `--destructive` son tokens distintos aunque vecinos; las acciones destructivas siempre usan `--destructive` + confirmación, y una tarjeta de alerta carmesí nunca contiene un botón primario carmesí (regla de uso documentada en design.md v2).
- **Estado colapsado persistido del sidebar**: el cambio a variant flotante no debe romper la cookie/estado existente de colapso ni el atajo de teclado del trigger.
- **Popups de MapLibre en dark**: los popups y controles del mapa deben heredar tokens (hoy hay overrides `!` en globals.css); los colores de las capas del mapa son la única excepción permitida de hex directos, centralizados en un módulo de constantes.
- **Páginas super-admin**: comparten tokens y PageShell; el layout super-admin no puede quedar con la identidad vieja.
- **`prefers-reduced-motion`**: ya existe regla global; Spinner/BrandLoader deben seguir siendo informativos sin movimiento.
- **Emails/PDFs generados**: los documentos generados (escrituras) NO cambian de tipografía por este feature; la serif de la mesa es solo presentación en pantalla.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001 (Tokens)**: `globals.css` DEBE definir la paleta "Tinta nítida" completa en `:root` y `.dark` — superficies (página, panel `#F6F6F6`/`#161616`, tarjeta, sidebar oscuro fijo), tinta/foreground, muted, `--primary` carmesí `#A93439`/`#C24444` con foregrounds AA, `--destructive` propio, semánticos `--success/--warning/--info`, tokens de estado de lote (`--status-available/reserved/sold` + foregrounds), radios (base 12 px, paneles 16 px) y `--brand` (color del plano del isotipo). El gradiente `--brand-gradient` se elimina.
- **FR-002 (design.md v2)**: `design.md` DEBE actualizarse a v2.0.0 manteniendo el protocolo de frontmatter YAML de tokens (formato actual, estilo design-tokens): cada token con `value` y `description`, secciones light/dark/status/typography/spacing/radius sincronizadas 1:1 con `globals.css`, y las secciones narrativas (Do's & Don'ts, políticas PageShell/PageHeader/Bento) actualizadas a la nueva dirección. `brand/colors.md` DEBE actualizar su decisión pendiente: acento UI = carmesí; el verde deja de ser color de marca cuando el usuario recoloree los SVG.
- **FR-003 (Fuentes)**: `layout.tsx` DEBE cargar vía `next/font/google` Bricolage Grotesque (`--font-display`, 500/600), Onest (`--font-sans`, 400/500) y Source Serif 4 (`--font-serif`); mantener Geist Mono (`--font-geist-mono`); eliminar Inter y Geist Sans. `@theme` DEBE mapear `--font-display`, `--font-sans`, `--font-serif`, `--font-mono` para generar las utilities. La mesa usa `font-serif`; títulos/cifras usan `font-display`.
- **FR-004 (Marca en la app)**: el sidebar DEBE mostrar el mark real de `brand/` (componente derivado de `brand-mark-paths.tsx`); el color del plano en `brand-mark-paths.tsx` DEBE salir de `var(--brand)` (con fallback) en vez de `#16A34A` literal; favicon/íconos/manifest DEBEN regenerarse con `brand/scripts/generate_assets.py` cuando el usuario recoloree los maestros (tarea documentada, no bloqueante).
- **FR-005 (Sidebar)**: `app-sidebar.tsx` DEBE reestructurarse a lista plana — Buscar (⌘K), Panel, Proyectos, Escrituras, Leads (badge), Vendedores, Agente — con Configuración y NavUser en el footer; usar `variant="inset"` (panel flotante redondeado); tokens `--sidebar-*` fijos en oscuro para ambos temas; ítem activo con fondo elevado + icono carmesí; estado activo correcto para sub-rutas (`/documentos/*` → Escrituras).
- **FR-006 (Tabs internos)**: Escrituras (`/documentos`) DEBE mostrar tabs Mesa · Historial · Plantillas y Agente (`/agente`) tabs Chat · Skills · Integraciones, implementados como navegación por links que conserva las URLs actuales (sin redirects ni cambios de rutas).
- **FR-007 (Command palette)**: DEBE existir un command palette global (componente `command` de shadcn ya instalado) abierto con ⌘K/Ctrl+K o el ítem del sidebar, con: navegación a secciones y settings, búsqueda de proyectos del workspace, y acciones rápidas (cambiar tema). Accesible por teclado, cierra con Escape.
- **FR-008 (Header)**: el header del dashboard DEBE quedar en: SidebarTrigger, breadcrumb/título, NotificationBell, ModeToggle y avatar. Sin input de búsqueda. Altura y estilo según tokens nuevos.
- **FR-009 (Loaders)**: `Spinner` y `BrandLoader` son los ÚNICOS indicadores de actividad: completar la migración de los usos actuales (Loader2, LoaderCircle, Loading02/03Icon, divs `animate-spin`); BrandLoader queda reservado a pantallas completas (auth callback, splash); cargas de contenido usan `Skeleton`. Añadir un test de guardia (grep) que falle si reaparecen loaders prohibidos.
- **FR-010 (StatusBadge)**: DEBE crearse `components/ui/status-badge.tsx` cubriendo estados de lote (disponible/reservado/vendido) y semánticos (éxito/advertencia/peligro/info/neutro), consumiendo exclusivamente tokens; migrar todos los badges ad-hoc.
- **FR-011 (EmptyState)**: toda vista de lista/colección DEBE usar el componente `EmptyState` (título + descripción + acción) en vez de textos "No hay…" sueltos.
- **FR-012 (Barrido de color)**: los 86 archivos con clases de paleta cruda DEBEN migrarse a tokens semánticos. Lista blanca única: colores de capas/pintura de MapLibre centralizados en un módulo de constantes documentado. El barrido se hace por módulo (proyectos → documentos/mesa → dashboard/operations → agente/settings/auth → super-admin) verificando ambos temas por módulo.
- **FR-013 (Iconos)**: Hugeicons es la única librería de iconos en código de producto; migrar los ~30 archivos con `lucide-react` (excepción: primitivas `components/ui/*` generadas por shadcn que lo usan internamente).
- **FR-014 (Layout)**: TODAS las páginas del dashboard y super-admin DEBEN usar PageShell + PageHeader (único `h1`); eliminar paddings ad-hoc (`p-8`) de operations, agente, skills, integraciones; PageShell/BentoPanel se ajustan a la nueva superficie (panel suave, radios, sin hairlines).
- **FR-015 (Responsive)**: todas las rutas renderizables DEBEN cumplir 375/768/1024/1440 px sin scroll horizontal; tablas con wrapper de scroll o vista tarjeta; la mesa de escritura adopta en móvil el patrón del visor (bottom `Sheet`/colapsables, `100dvh`); `/operations` se reconstruye responsiva; el visor de proyecto no debe regresionar.
- **FR-016 (Accesibilidad)**: contraste AA (4.5:1 texto normal, 3:1 grande) verificado para cada par token en ambos temas; focus-visible conservado; targets táctiles ≥44 px en móvil; `aria-label` en botones de solo icono; reduced-motion respetado.
- **FR-017 (Gates)**: `pnpm typecheck:web`, `pnpm test:web` y `pnpm build:web` DEBEN pasar al cierre de cada fase; los tests de componentes existentes que referencien clases/estructuras cambiadas se actualizan en la misma fase.

### Key Entities

No hay cambios de datos ni esquema: el feature es exclusivamente de presentación (tokens CSS, componentes React, layout y assets estáticos). No se tocan migraciones, RLS ni contratos API.

## Success Criteria _(mandatory)_

- **SC-001**: grep de clases de paleta cruda en `apps/web/src` = 0 ocurrencias fuera de la lista blanca (hoy: 86 archivos).
- **SC-002**: grep de `Loader2|LoaderCircle|Loading0[23]Icon` y divs spinner = 0 en código de producto (hoy: ~60 usos en 4 variantes).
- **SC-003**: imports de `lucide-react` fuera de `components/ui/*` = 0 (hoy: 30 archivos).
- **SC-004**: 100% de páginas dashboard/super-admin bajo PageShell + PageHeader (hoy: ~10 de 14+).
- **SC-005**: todas las rutas renderizables sin scroll horizontal en 375 px, verificado con recorrido documentado en quickstart.
- **SC-006**: cada par foreground/background de tokens cumple AA en claro y oscuro (tabla de contraste en design.md v2).
- **SC-007**: la app no descarga Inter ni Geist Sans; Bricolage/Onest/Source Serif 4 cargan con `display: swap`.
- **SC-008**: cambiar el color de marca = editar 1 token + regenerar assets de brand (cero cambios en componentes).
- **SC-009**: `pnpm typecheck:web && pnpm test:web && pnpm build:web` verdes al cierre.

## Assumptions

- Las URLs actuales se conservan; no hay SEO ni deep-links externos que cambien.
- El recolor de los SVG maestros de `brand/` lo hará el usuario; este feature solo deja el terreno tokenizado y el proceso documentado.
- La calibración exacta de los oklch/hex finales puede afinarse durante la implementación de US1 siempre que respete la dirección (tinta + carmesí + superficies suaves) y el gate AA.
- Los documentos legales generados (PDF/DOCX) están fuera de alcance visual.
