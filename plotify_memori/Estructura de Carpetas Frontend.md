# Estructura de Carpetas Frontend

**Tag:** #frontend
**Relacionado:** [[00 - Home]], [[Tech Stack Frontend]], [[Rutas y Endpoints API]]

---

## Directorio src

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Login, callback (sin sidebar)
│   ├── (dashboard)/       # Rutas protegidas (con sidebar)
│   │   ├── agente/        # Config agente IA
│   │   ├── clients/       # Gestion compradores
│   │   ├── dashboard/     # KPIs
│   │   ├── documentos/    # Generador documentos legales
│   │   ├── onboarding/    # Wizard creacion proyecto
│   │   ├── operations/    # Vista operaciones
│   │   ├── projects/      # CRUD proyectos
│   │   ├── settings/      # Perfil, workspace
│   │   └── vendors/       # Gestion vendedores
│   ├── (super-admin)/     # Admin global
│   ├── api/               # API Routes REST
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Redirect a /dashboard
├── components/
│   ├── ui/                # 35 primitivas shadcn/ui
│   ├── dashboard/         # KPICards, TelegramSetup
│   ├── operations/        # KPICards, OperationsTable
│   ├── projects/          # Detail, geometry viewer, onboarding
│   ├── super-admin/       # Componentes admin global
│   ├── vendors/           # Gestion vendedores
│   ├── app-sidebar.tsx    # Sidebar principal
│   ├── nav-main.tsx       # Navegacion principal
│   ├── nav-projects.tsx   # Navegacion proyectos
│   ├── nav-user.tsx       # Navegacion usuario
│   ├── team-switcher.tsx  # Switch de workspace
│   └── mode-toggle.tsx    # Toggle dark/light
├── lib/
│   ├── supabase/          # Clientes browser y server
│   ├── services/          # 17 service files
│   ├── models/            # Modelos de datos (lot.model.ts)
│   ├── geometry/          # Motor geometrico
│   ├── legal/             # Generacion texto legal
│   ├── validations/       # Zod schemas
│   ├── validators/        # Validadores de geometria
│   ├── auth/              # Super admin guard
│   ├── logger.ts          # Pino logger
│   └── utils.ts           # Utilidades generales
├── actions/               # 9 Server Actions
├── hooks/                 # use-mobile.ts
├── types/                 # Tipos TypeScript
└── context/               # Documentacion tecnica (11 .md)
```

## Convenciones

- **Server Components** por defecto. Usar `"use client"` solo cuando se necesita interactividad (event handlers, state, hooks).
- **Path alias** `@/*` apunta a `src/*`.
- **Un componente por archivo**, nombrado en kebab-case o PascalCase.
- **Services** tienen extension `.service.ts`.
- **Actions** tienen extension `.action.ts`.

## Relacionado
- [[Rutas y Endpoints API]] — Detalle de cada ruta
- [[Servicios lib-services]] — Los 17 service files
- [[Server Actions]] — Las 9 server actions
