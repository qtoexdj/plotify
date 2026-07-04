# Checklist Diseño/UX: SDD 015

## Fundaciones

- [x] `design.md` está en v2.0.0 y sincronizado con `globals.css`.
- [x] `--primary` usa carmesí claro/oscuro; `--brand` mantiene el verde del isotipo.
- [x] Bricolage Grotesque, Onest, Source Serif 4 y Geist Mono están cargadas con `next/font`.
- [x] Inter y Geist Sans no se cargan desde `layout.tsx`.
- [x] `BrandMark`, `Spinner` y `BrandLoader` comparten paths del isotipo.

## Navegación

- [x] Sidebar dashboard es una lista plana: Buscar, Panel, Proyectos, Escrituras, Leads, Vendedores, Agente.
- [x] Sidebar usa `variant="inset"` y el componente base redondea el panel en esa variante.
- [x] Header dashboard queda sin búsqueda ni toggle de tema.
- [x] Command palette está montado en dashboard y super-admin.
- [x] Tabs de Escrituras conservan `/documentos`, `/documentos/historial`, `/documentos/plantillas`.
- [x] Tabs de Agente conservan `/agente`, `/agente/skills`, `/agente/integrations`.

## Feedback Y Estados

- [x] No quedan imports prohibidos `Loader2`, `LoaderCircle`, `Loading02Icon` ni `Loading03Icon`.
- [x] No quedan `animate-spin` ad-hoc fuera de `Spinner`/`BrandLoader`.
- [x] `BrandLoader` queda reservado a auth callback.
- [x] `StatusBadge` cubre estados de lote y estados semánticos principales.
- [x] `EmptyState` cubre vistas vacías principales; textos de tabla/filtro quedan como estados inline.

## Coherencia Visual

- [x] Grep de colores Tailwind crudos da cero fuera de la lista blanca MapLibre.
- [x] Grep de `lucide-react` fuera de primitivas `components/ui/*` da cero.
- [x] Agente usa `PageShell` + `PageHeader` en Chat, Skills e Integraciones.
- [x] Super-admin usa tokens, PageShell/PageHeader en páginas principales.

## Responsive

- [x] `/operations` usa KPIs apilables, filtros responsivos, tabla con scroll propio y botones de al menos 44 px.
- [x] Mesa de escritura móvil usa documento a ancho completo y bottom sheets para índice/datos.
- [x] Tabs internos y menú lateral cumplen target táctil mínimo de 44 px.
- [x] Wrappers de tablas principales usan `Table`/`overflow-x-auto` o composición equivalente.
- [x] Quickstart lista las rutas para recorrido 375/768/1024/1440.

## Pendientes Operativos

- [ ] Recorrido visual manual con datos reales de super-admin si no hay rol disponible en ambiente local.
- [ ] Regenerar assets de marca solo si se recolorean los SVG maestros de `brand/`.
