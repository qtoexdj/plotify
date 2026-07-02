# Research: Rediseño Integral de Identidad Visual y UX

**Feature**: `015-rediseno-identidad-ui` | **Date**: 2026-07-02

## R1. Auditoría del estado actual (fase 0, verificada con grep + codegraph)

### Colores

- **86 archivos** en `apps/web/src` usan clases de paleta Tailwind cruda. Top ocurrencias: `text-slate-500` ×60, `text-slate-400` ×42 (contraste ~3:1 sobre blanco — bajo AA), `text-slate-600` ×37, `border-slate-200` ×31, `bg-amber-500` ×28, `text-blue-600` ×27, `bg-emerald-500` ×23, más red/green/indigo/purple dispersos.
- `globals.css` SÍ define tokens semánticos (`--success`, `--warning`, `--destructive`, `--accent`, charts) que casi nadie consume.
- Consecuencias: dark mode roto en vistas con `bg-*-50`/`text-*-900`, contraste AA fallido, y percepción de "collage".

### Tipografía

- `apps/web/src/app/layout.tsx` carga 3 fuentes: Inter (`--font-sans`, usada), Geist Mono (usada), **Geist Sans (cargada y jamás usada — peso muerto)**.
- `components/documents/mesa/mesa-documento.tsx:500` usa `font-serif` **sin ninguna serif cargada** → el documento legal se renderiza con la serif del sistema operativo (Georgia/Times según OS).
- No hay escala tipográfica ni fuente display; `operations/page.tsx` define su propio `h1 text-3xl` duplicando el título del header.
- `brand/typography.md` ya define la jerarquía objetivo: Bricolage Grotesque 600/500 (display), Onest 400/500 (cuerpo/etiquetas), Geist Mono (datos).

### Loaders

- 60 usos de `animate-spin` en 4 variantes: `Loader2` (lucide) ×16, `LoaderCircle` ×2, `HugeiconsIcon Loading02/03Icon`, y 4 divs artesanales `rounded-full animate-spin`.
- El usuario creó los reemplazos canónicos (ya en el árbol de esta rama):
  - `apps/web/src/components/ui/spinner.tsx` — isotipo animado ("conveyor" de capas de datos hacia el plano), `aria-hidden`, hereda tamaño por `className`.
  - `apps/web/src/components/ui/brand-loader.tsx` — mark en baja opacidad + barrido de luz; reservado a 1–2 momentos grandes (splash/auth).
  - `apps/web/src/components/ui/brand-mark-paths.tsx` — paths compartidos; **`#16A34A` hardcodeado** (a tokenizar con `var(--brand)`).
  - Keyframes `--animate-spinner-conveyor` y `--animate-brand-sweep` ya declarados en `@theme` de `globals.css`.
- La migración ya está iniciada en ~20 archivos de la rama (auth/callback, documentos, operations, geometry-*, viewer, legal, dashboard forms, etc.). El SDD la completa y agrega el test de guardia.

### Iconos

- Dos librerías mezcladas: `@hugeicons/*` en 69 archivos, `lucide-react` en 30. `design.md` §Iconografía ya declara Hugeicons como oficial. Excepción técnica: primitivas shadcn en `components/ui/*` traen lucide interno.

### Layout

- `PageShell` (max-w 1600, padding responsivo, `animate-fade-in-up`) en ~10 páginas; **fuera**: `/operations`, `/agente`, `/agente/skills`, `/agente/integrations` (todas con `p-8` fijo).
- `EmptyState` existe pero solo 4 páginas lo usan; 24 textos "No hay…" ad-hoc.
- El sidebar actual (`app-sidebar.tsx`) tiene doble jerarquía: 3 grupos con etiqueta + 3 submenús colapsables (Agente, Documentos, Configuración) + logo placeholder SVG con gradiente `bg-brand-gradient`.

### Responsive

- **Bueno (patrón oro)**: `components/projects/geometry-viewer/index.tsx` — `useIsMobile()` + bottom `Sheet` al seleccionar lote en móvil + panel lateral desktop + alturas `h-[calc(100dvh-160px)] md:h-[calc(100vh-220px)]` + toolbar con `flex-wrap`. El usuario pidió explícitamente replicar esta UX.
- **Bueno**: PageShell, login, documentos (16 prefijos responsive), mesa (`xl:grid-cols-[260px_1fr_320px]` colapsa bajo 1280px), sidebar shadcn (drawer móvil automático).
- **Malo**: `/operations` con **0 prefijos responsive**; tablas secundarias sin wrapper `overflow-x-auto`; grids KPI apretados en tablet.

## R2. Decisiones de diseño (proceso iterativo con el usuario, 2026-07-02)

| # | Decisión | Alternativas descartadas |
|---|----------|--------------------------|
| D1 | Paleta "Tinta nítida": monocromo alto contraste + carmesí `#A93439`/`#C24444` | Verde/papel "escritorio de tierras"; cobalto/naranjo "plano maestro"; miel/grafito; vino/crema; bruma/coral; default shadcn actual |
| D2 | El logo migrará de verde `#16A34A` a carmesí (decisión explícita del usuario al resolver el pendiente de `brand/colors.md`) → tokenizar `--brand` | Acento verde de marca; tinta neutra |
| D3 | Sidebar flotante SIEMPRE oscuro, redondeado, plano de 6 ítems (referencia visual aportada por el usuario) | Grupos con etiquetas (actual); rail de iconos+panel |
| D4 | Tipografía: Bricolage Grotesque + Onest + Geist Mono + Source Serif 4 (mesa) | Fraunces, Space Grotesk, Instrument Serif, Schibsted, Gabarito, Inter |
| D5 | Búsqueda: command palette ⌘K; header sin input de búsqueda (rechazado explícitamente) | Barra en header; botón lupa |
| D6 | Tema por defecto: sistema | Claro fijo; oscuro fijo |
| D7 | Superficies sin hairlines: separación por contraste (panel `#F6F6F6`/`#161616`, tarjetas blancas/`#222`), radios 12–16 px | Bordes 0.5px estilo Linear |
| D8 | Alcance: rediseño completo en un SDD, fases P1→P3 | Split fundaciones (015) + barrido (016) |

## R3. Notas técnicas (context7 / Tailwind v4, verificado)

- **Tailwind v4 `@theme`**: los tokens custom (`--color-*`, `--font-*`, `--animate-*` con `@keyframes` inline) generan utilities automáticamente; el proyecto ya usa `@theme inline` con variables por referencia — mantener ese patrón para que `.dark` redefina los valores subyacentes.
- **Tokens de estado como utilities**: declarar `--color-status-available/reserved/sold(+-foreground)` en `@theme` habilita `bg-status-available`, `text-status-sold-foreground`, etc., eliminando la necesidad de clases crudas en KPIs/badges/mapa.
- **`next/font/google`**: Bricolage Grotesque, Onest y Source Serif 4 están disponibles; usar `variable:` + `display: 'swap'` y subsets `latin`. Quitar Inter/Geist Sans elimina ~2 requests de fuente por carga.
- **shadcn Sidebar**: `variant="inset"` ya implementa el layout flotante (sidebar separado + `SidebarInset` con fondo propio y radio); el estado colapsado persiste en cookie — el cambio de variant no lo afecta.
- **shadcn `command`**: ya está en `components/ui/command.tsx` (instalado); el patrón CommandDialog + listener de teclado global es el documentado por shadcn.
- **MapLibre**: las capas de mapa exigen colores literales en su spec de estilo → única lista blanca de hex, centralizada (constantes por estado de lote que espejan los tokens).

## R4. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Barrido de 86 archivos introduce regresiones visuales silenciosas | Migrar por módulo con verificación claro/oscuro por módulo (preview) + gates por fase |
| Carmesí primario vs destructive confundibles | Tokens separados, tabla AA en design.md v2, regla de uso documentada (US4/Edge) |
| Tests existentes acoplados a clases/estructura del sidebar viejo | FR-017: actualizar tests en la misma fase; correr `pnpm test:web` por fase |
| Cambio de fuentes altera métricas/line-height y rompe layouts densos (mesa, tablas) | Fase 1 incluye pasada visual por las 6 secciones antes de continuar |
| `variant="inset"` cambia estructura DOM del layout (header dentro del inset) | Ajustar `(dashboard)/layout.tsx` y `(super-admin)/layout.tsx` juntos |
