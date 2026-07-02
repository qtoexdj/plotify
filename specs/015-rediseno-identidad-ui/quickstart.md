# Quickstart: Verificación del Rediseño (015)

## 1. Verificación de identidad (Fase 1 / US1)

```bash
pnpm dev:web
```

1. Abrir `http://localhost:3000/dashboard` en tema claro y oscuro (toggle o preferencia de sistema).
2. DevTools → computed font de `body` = Onest; de un `h1`/cifra KPI = Bricolage Grotesque.
3. Network → no se descargan Inter ni Geist Sans; Bricolage/Onest/Source Serif 4 con `font-display: swap`.
4. `getComputedStyle(document.documentElement).getPropertyValue('--primary')` = carmesí (claro) y su par al activar `.dark`.
5. Mesa de escritura (`/documentos/matriz/...` con el caso demo sembrado): el documento se ve en Source Serif 4.

## 2. Verificación de navegación (Fase 3 / US2)

- Sidebar: 6 ítems planos + Buscar + Configuración/usuario abajo; panel flotante oscuro en AMBOS temas.
- ⌘K (y Ctrl+K) abre el palette desde cualquier página; Escape cierra; navegar a Proyectos/Settings/un proyecto.
- `/documentos/historial` muestra tabs con "Historial" activo y "Escrituras" activo en sidebar.
- Móvil (DevTools 375px): sidebar como drawer; misma estructura.
- Header: sin input de búsqueda.

## 3. Recorrido responsive completo (Fase 6 / US5)

Rutas a verificar en 375 / 768 / 1024 / 1440 px, ambos temas, sin scroll horizontal:

```text
/dashboard          /projects            /projects/[id] (visor: regresión prohibida)
/documentos         /documentos/historial /documentos/plantillas
/documentos/matriz/proyecto/[id]         /operations
/clients            /vendors             /agente
/agente/skills      /agente/integrations /settings/profile
/settings/workspace /onboarding/new      /auth/login
/super-admin (+ organizations, users, audit-logs, prompt-ops, labs)
```

Chequeo por ruta: `document.scrollingElement.scrollWidth <= window.innerWidth`.

## 4. Gates y greps

```bash
pnpm typecheck:web && pnpm test:web && pnpm build:web

# colores crudos (esperado: 0 fuera de lib/map/lot-colors.ts)
grep -rEn '(bg|text|border|ring|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+' apps/web/src --include='*.tsx' | grep -v 'lib/map/lot-colors'

# loaders prohibidos (esperado: 0)
grep -rEn 'Loader2|LoaderCircle|Loading0[23]Icon' apps/web/src --include='*.tsx'

# lucide fuera de primitivas (esperado: 0)
grep -rln "from 'lucide-react'" apps/web/src --include='*.tsx' | grep -v 'components/ui/'
```

## 5. Recolor de marca (cuando el usuario lo haga)

1. Editar los SVG maestros en `brand/` (verde → carmesí) y `brand/colors.md`.
2. `cd apps/api && ./.venv/bin/python ../../brand/scripts/generate_assets.py`
3. En la web solo cambia el token `--brand` en `globals.css`. Nada más.
