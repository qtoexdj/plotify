# Quickstart: SDD 015 Rediseño Identidad UI

## Alcance Verificado

Este quickstart cierra la verificación funcional del rediseño "Tinta nítida":

- Tokens, fuentes y marca en `globals.css`, `layout.tsx`, `design.md` y `brand/colors.md`.
- Sidebar oscuro flotante, header limpio y command palette en dashboard y super-admin.
- Tabs internos de Escrituras y Agente.
- Spinner/BrandLoader/StatusBadge/EmptyState/guard tests.
- Barrido de colores crudos y `lucide-react`.
- Responsive base de `/operations` y mesa de escritura móvil con bottom sheets.

## Comandos

```bash
pnpm typecheck:web
pnpm test:web
pnpm build:web
```

Greps de cierre:

```bash
rg -n "Loader2|LoaderCircle|Loading0[23]Icon" apps/web/src --glob '*.tsx'
rg -n "from ['\"]lucide-react['\"]" apps/web/src --glob '*.tsx'
rg -n "(bg|text|border|ring|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+" apps/web/src --glob '*.tsx'
```

Los tres greps deben devolver cero resultados, excepto colores literales centralizados en `apps/web/src/lib/map/lot-colors.ts`.

## Rutas De Recorrido

Recorrer en claro y oscuro, con anchos 375, 768, 1024 y 1440 px:

- `/dashboard`
- `/projects`
- `/projects/[projectId]`
- `/documentos`
- `/documentos/historial`
- `/documentos/plantillas`
- `/documentos/matriz/[caseId]`
- `/documentos/matriz/proyecto/[projectId]`
- `/clients`
- `/vendors`
- `/operations`
- `/agente`
- `/agente/skills`
- `/agente/integrations`
- `/settings/profile`
- `/settings/workspace`
- `/ayuda/vendedor`
- `/onboarding/new`
- `/super-admin`
- `/super-admin/audit-logs`
- `/super-admin/organizations`
- `/super-admin/projects`
- `/super-admin/prompt-ops`
- `/super-admin/prompt-ops/[promptId]`
- `/super-admin/users`
- `/super-admin/labs/escrituras`

## Criterios Manuales

- `document.documentElement.scrollWidth <= window.innerWidth` en 375 px para cada ruta renderizable.
- Sidebar desktop se ve como panel oscuro flotante redondeado; sidebar móvil abre como drawer.
- `Cmd/Ctrl+K` abre el command palette en dashboard y super-admin.
- Header dashboard no contiene input de búsqueda ni toggle de tema.
- Tabs de Escrituras y Agente conservan URLs actuales y tienen target táctil de al menos 44 px.
- Mesa de escritura móvil muestra documento a ancho completo y mueve índice/datos a bottom sheets.
- Visor de proyecto conserva selección de lote, panel lateral desktop, bottom sheet móvil, toolbar y export.
- No hay fondos claros pegados ni texto ilegible en dark mode.

## Resultado Actual

- Gates técnicos: pasan (`typecheck:web`, `test:web`, `build:web`).
- Greps SC-001/SC-002/SC-003: cero resultados en código de producto.
- Assets de marca: no se regeneraron porque el usuario no recoloreó los SVG maestros; el flujo queda documentado en `brand/colors.md`.
