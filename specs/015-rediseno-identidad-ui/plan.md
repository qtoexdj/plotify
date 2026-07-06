# Implementation Plan: Rediseño Integral de Identidad Visual y UX (Tinta y Marca)

**Branch**: `015-rediseno-identidad-ui` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-rediseno-identidad-ui/spec.md`

## Summary

Aplicar la dirección visual "Tinta y Marca" a toda la web app sin tocar lógica de negocio: (1) reescribir los design tokens en `globals.css` y sincronizar `design.md` v2 como fuente canónica; (2) cargar la tipografía de marca (Bricolage Grotesque / Onest / Source Serif 4) y eliminar fuentes muertas; (3) reestructurar el shell — sidebar flotante oscuro plano de 6 ítems, header limpio, command palette ⌘K, tabs internos en Escrituras y Agente; (4) consolidar feedback con los componentes de marca ya creados (Spinner, BrandLoader) más StatusBadge y EmptyState; (5) barrer los 86 archivos con colores crudos y los 30 con lucide; (6) llevar todas las páginas a PageShell y a responsive de producción replicando el patrón del visor de proyecto.

La entrega es incremental por user story: US1 (tokens+fuentes+marca) y US2 (navegación) son el MVP perceptible; US3/US4 consolidan componentes y el barrido; US5 cierra responsive y QA.

## Technical Context

**Language/Version**: TypeScript 5 / React 19 / Next.js App Router en `apps/web`. No se toca `apps/api`.

**Primary Dependencies**: Tailwind CSS 4 (`@theme` CSS-first, sin config JS), shadcn/ui (Sidebar con `variant="inset"`, Command, Sheet, Skeleton, Tabs), `next/font/google` (Bricolage Grotesque, Onest, Source Serif 4, Geist Mono), `next-themes` (attribute class, defaultTheme system), `@hugeicons/react` + `@hugeicons/core-free-icons`, MapLibre GL (solo constantes de color).

**Storage**: N/A — cero migraciones, cero cambios de esquema.

**Testing**: Vitest (`pnpm test:web`) para componentes y tests de guardia (greps de loaders/colores prohibidos); `pnpm typecheck:web`; `pnpm build:web`; verificación visual con dev server (claro/oscuro × 375/768/1024/1440).

**Target Platform**: Web dashboard (admin + vendedor) y super-admin.

**Project Type**: Web app (capa de presentación exclusivamente).

**Performance Goals**: sin regresión de CLS por fuentes (`display: swap` + fallbacks); menos requests de fuente que hoy (eliminar Inter y Geist Sans); sin JS nuevo pesado (el palette usa el componente ya instalado).

**Constraints**:

- No cambiar URLs ni estructura de rutas (tabs = links a rutas existentes).
- No tocar el motor de variables/escrituras ni servicios; solo presentación.
- El color de marca debe quedar en un único token (`--brand`), aunque su valor vigente se mantiene verde `#16A34A` (decisión 2026-07-03: el logo no migra a carmesí; ambos colores coexisten sin mezclarse).
- Colores literales solo en el módulo de constantes de MapLibre (lista blanca).
- El visor de proyecto (`geometry-viewer`) es patrón de referencia: prohibido regresionar su UX.
- `design.md` conserva su protocolo de frontmatter YAML de tokens (estilo design-tokens) y se mantiene 1:1 con `globals.css`.

**Scale/Scope**: ~120 archivos tocados estimados (1 CSS global, 2 layouts, 1 sidebar, ~6 componentes nuevos/ajustados, 86 archivos de barrido de color, ~30 de iconos — con solapamiento), 6 secciones de dashboard + super-admin + auth.

## Constitution Check

_Gate evaluado contra `.specify/memory/constitution.md` v1.0.0:_

- **I. Producto Piloto Primero**: el feature endurece la experiencia del flujo core (visor, mesa, operaciones, Telegram-web del vendedor en móvil) sin agregar funcionalidad experimental. PASS.
- **II. Geometría Espacial como Origen**: no se altera cálculo ni dato geométrico; el mapa solo centraliza sus colores. PASS.
- **III. Supabase y Migraciones Canónicas**: sin cambios de esquema. PASS (N/A).
- **IV. Contratos Tipados**: sin cambios de API ni OpenAPI. PASS (N/A).
- **V. Seguridad Multi-Tenant**: el command palette busca proyectos usando los servicios existentes con scoping por workspace ya vigente; no introduce endpoints nuevos. PASS condicionado a reutilizar servicios existentes.
- **VI. Testing y Gates**: se exige `typecheck/test/build` por fase, tests de guardia nuevos y actualización de tests de componentes afectados. La constitución exige además cumplir el estándar shadcn/Tailwind 4 con variables del sistema — este feature ES ese estándar. PASS.

**Resultado**: PASS. Sin violaciones aceptadas.

## Project Structure

### Documentation (this feature)

```text
specs/015-rediseno-identidad-ui/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
├── checklists/
│   └── diseno-ux.md
└── tasks.md
```

### Source Code (áreas afectadas)

```text
apps/web/src/
├── app/
│   ├── globals.css                  # Tokens v2 (Fase 1)
│   ├── layout.tsx                   # Fuentes (Fase 1)
│   ├── (dashboard)/layout.tsx       # Shell: inset + header limpio + palette (Fase 2)
│   ├── (super-admin)/layout.tsx     # Mismo shell (Fase 2)
│   └── (dashboard)/**/page.tsx      # PageShell/tabs/barrido (Fases 2–5)
├── components/
│   ├── app-sidebar.tsx              # Sidebar plano 6 ítems (Fase 2)
│   ├── command-palette.tsx          # NUEVO — ⌘K global (Fase 2)
│   ├── brand/brand-mark.tsx         # NUEVO — mark de marca reutilizable (Fase 1)
│   ├── ui/brand-mark-paths.tsx      # Tokenizar --brand (Fase 1)
│   ├── ui/spinner.tsx               # Existente (adopción Fase 3)
│   ├── ui/brand-loader.tsx          # Existente (adopción Fase 3)
│   ├── ui/status-badge.tsx          # NUEVO (Fase 3)
│   ├── dashboard/page-shell.tsx     # Superficie panel (Fase 2)
│   └── **                           # Barrido color/iconos (Fase 4)
├── lib/map/lot-colors.ts            # NUEVO — lista blanca MapLibre (Fase 4)
design.md                            # v2.0.0 (Fase 1)
brand/colors.md                      # Decisión acento resuelta (Fase 1)
```

## Fases de implementación

### Fase 1 — Fundaciones: tokens, tipografía y marca (US1)

`globals.css` con la paleta completa (claro/oscuro, superficies, carmesí, semánticos, estados de lote, radios, `--brand`); fuentes en `layout.tsx`; `design.md` v2 y `brand/colors.md` sincronizados; `brand-mark-paths.tsx` tokenizado y `BrandMark` como componente de marca; PageHeader/tipografía display. **Gate**: app corriendo con identidad nueva en ambos temas, AA verificado, typecheck/test/build verdes.

### Fase 2 — Shell de navegación (US2)

Sidebar plano `variant="inset"` siempre oscuro; header limpio; command palette ⌘K; tabs internos en Escrituras y Agente; PageShell ajustado a superficie de panel; ambos layouts (dashboard y super-admin). **Gate**: todas las rutas accesibles vía sidebar/tabs/palette en desktop y móvil.

### Fase 3 — Sistema de feedback (US3)

Completar adopción de Spinner (resto de los 60 usos), BrandLoader solo en pantallas completas, StatusBadge, EmptyState en todas las listas, skeletons para Suspense; test de guardia de loaders prohibidos. **Gate**: SC-002 en verde.

### Fase 4 — Barrido de coherencia (US4)

Módulo por módulo (proyectos → documentos/mesa → dashboard/operations → agente/settings/auth → super-admin): colores crudos → tokens, lucide → hugeicons, PageShell/PageHeader donde falte, constantes MapLibre. Verificación claro/oscuro por módulo. **Gate**: SC-001/003/004 en verde.

### Fase 5 — Responsive y QA de producción (US5)

`/operations` reconstruida; mesa móvil con patrón del visor (Sheet/colapsables); wrappers de tablas; recorrido 375/768/1024/1440 de todas las rutas; regresión del visor; checklist final + gates. **Gate**: SC-005/006/009 en verde.

## Protocolo de edición por página (obligatorio)

Regla acordada con el usuario (2026-07-02). Antes de editar **cada página** (en cualquier fase que la toque):

1. **Anunciar**: el agente informa qué página viene a continuación (ruta + qué tareas la tocan).
2. **Preguntar** (AskUserQuestion o equivalente): _"¿Mantenemos la UX y cambiamos solo la UI, o cambiamos también la UX?"_
   - **Solo UI** → se aplica exclusivamente la piel (tokens, fuentes, superficies, StatusBadge, Spinner, PageShell) sin mover estructura, flujos ni posiciones de acciones. Sin wireframes.
   - **Cambiar UX** → el agente genera 2–3 wireframes de opciones ANTES de codear; el usuario elige (o mezcla) y recién ahí se implementa.
3. **Excepciones pre-aprobadas** (no requieren pregunta, ya decididas en spec): sidebar plano, header sin búsqueda + ⌘K, tabs de Escrituras/Agente, reconstrucción de `/operations`, mesa móvil con bottom sheet. Para estas, los wireframes de la conversación de diseño son el contrato; aun así `/operations` y la mesa móvil se presentan con wireframes de detalle antes de codear por ser reestructuraciones grandes.
4. **Móvil**: la pregunta del paso 2 cubre también la versión móvil. Si la adaptación es **mecánica** (grids que apilan, tablas con scroll propio, paddings responsivos) se hace directo, sin preguntar. Si la página necesita una **UX móvil diseñada** (reorganizar interacción: sheets, paneles colapsables, toolbars táctiles — nivel visor de proyecto), el agente lo anuncia y presenta wireframes móviles antes de codear. Candidatas ya identificadas: mesa de escritura (T037), operations (T036), geometry-assignment, paneles de verificación de lotes.
5. **Prohibido**: cambiar UX de una página sin pasar por el paso 2, aunque parezca "mejora obvia".

El visor de proyecto queda fuera de todo cambio de UX (regresión prohibida, T041).

## Verification Commands

```bash
# Gates por fase
pnpm typecheck:web && pnpm test:web && pnpm build:web

# SC-001 — colores crudos (debe dar 0 fuera de lib/map/lot-colors.ts)
grep -rEn '(bg|text|border|ring|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+' apps/web/src --include='*.tsx' | grep -v 'lib/map/lot-colors'

# SC-002 — loaders prohibidos (debe dar 0)
grep -rEn 'Loader2|LoaderCircle|Loading0[23]Icon' apps/web/src --include='*.tsx'

# SC-003 — lucide fuera de primitivas ui (debe dar 0)
grep -rln "from 'lucide-react'" apps/web/src --include='*.tsx' | grep -v 'components/ui/'
```
