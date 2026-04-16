# Plotify - Stack Tecnológico

## 🏗️ Stack Principal

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Framework** | Next.js (App Router) | 16.1.1 |
| **Runtime** | React | 19.2.3 |
| **Lenguaje** | TypeScript | ^5 |
| **Estilos** | Tailwind CSS | ^4 |
| **Base de datos** | Supabase (PostgreSQL) | - |
| **Auth** | Supabase Auth (SSR) | @supabase/ssr ^0.8.0 |
| **Validación** | Zod | ^4.2.1 |
| **Formularios** | React Hook Form | ^7.69.0 |

---

## 📦 Dependencias Obligatorias

### Core
```json
{
  "next": "16.1.1",
  "react": "19.2.3",
  "react-dom": "19.2.3",
  "@supabase/ssr": "^0.8.0",
  "@supabase/supabase-js": "^2.89.0"
}
```

### UI Components (shadcn/ui + Radix)
```json
{
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.4.0",
  "@radix-ui/react-scroll-area": "^1.2.10",
  "@radix-ui/react-tooltip": "^1.2.8",
  "radix-ui": "^1.4.3",
  "cmdk": "^1.1.1",
  "next-themes": "^0.4.6"
}
```

**Componentes shadcn/ui instalados** (`src/components/ui/`):

| Componente | Uso principal |
|---|---|
| `button`, `badge`, `input`, `label`, `textarea` | Formularios y acciones |
| `card`, `dialog`, `sheet`, `popover`, `tooltip` | Contenedores y overlays |
| `tabs`, `scroll-area`, `separator`, `collapsible` | Layouts y navegación |
| `select`, `switch`, `checkbox`, `toggle`, `toggle-group` | Controles |
| `form` | Integración con React Hook Form |
| `dropdown-menu` | Menús contextuales |
| `table` | Tablas de datos |
| `sidebar`, `resizable` | Estructura del dashboard |
| `skeleton`, `sonner`, `avatar` | Feedback y estado |
| `alert-dialog` | Confirmaciones destructivas |
| `input-group` | Inputs con prefijo/sufijo |
| **`command`** | **Combobox con búsqueda (cmdk) — desde 02/2026** |

### Canvas/Geometría
```json
{
  "maplibre-gl": "^5.19.0",
  "@turf/bbox": "^7.3.4",
  "konva": "^10.0.12",
  "react-konva": "^19.2.1"
}
```
*Nota*: El visor principal de proyectos (`GeometryViewer`) usa **MapLibre GL** vía el wrapper **mapcn** (`src/components/ui/map.tsx`). `konva` y `react-konva` **solo se usan en el Onboarding** (`GeometryAssignmentPanel`).

### Motor de Servidumbre (Turf.js)
```json
{
  "@turf/buffer": "^7.3.4",
  "@turf/intersect": "^7.3.4",
  "@turf/area": "^7.3.4",
  "@turf/boolean-point-in-polygon": "^7.3.4",
  "@turf/destination": "^7.3.4",
  "@turf/helpers": "^7.3.4",
  "@turf/length": "^7.3.4",
  "@turf/line-intersect": "^7.3.4",
  "@turf/line-to-polygon": "^7.3.4"
}
```
*Nota*: `number-to-words.ts` es una utilidad interna en `src/lib/legal/` (no npm), convierte números y decimales a palabras para el formato legal chileno ("ciento siete coma dos").

### Procesamiento Geoespacial (KMZ/KML + CAD Frozen)
```json
{
  "jszip": "^3.10.1",
  "@tmcw/togeojson": "^7.1.2",
  "xmldom": "^0.6.0",
  "proj4": "^2.15.0",
  "@types/proj4": "^2.5.5"
}
```

### Validación y Formularios
```json
{
  "zod": "^4.2.1",
  "react-hook-form": "^7.69.0",
  "@hookform/resolvers": "^5.2.2"
}
```

### Iconos
```json
{
  "@hugeicons/react": "^1.1.4",
  "@hugeicons/core-free-icons": "^3.1.1"
}
```
*Nota*: `lucide-react` fue completamente removido en favor de la consistencia visual y ligereza del paquete core-free de HugeIcons.

---

## 🛠️ DevDependencies

```json
{
  "@tailwindcss/postcss": "^4",
  "@types/node": "^20",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "eslint": "^9",
  "eslint-config-next": "16.1.1",
  "shadcn": "^3.6.2",
  "tailwindcss": "^4",
  "typescript": "^5",
  "vitest": "^4.0.17"
}
```

---

## 🧪 Testing

### Vitest — Configuración (`vitest.config.ts`)
```typescript
// vitest.config.ts
// environment: 'node'
// alias '@' → src/
// includes: tests/**/*.test.ts
```

### Estructura de Tests
```
tests/
├── lot-routes.test.ts          # Tests de rutas API de lotes
├── lots.service.test.ts        # Tests unitarios del servicio de lotes
└── lib/
    └── geometry/
        └── engine-e2e.test.ts    # Suite E2E del motor geométrico (27 tests)
```

### Restricción TypeScript en Tests
- `target: "ES2017"` → no soporta regex flag `s` (dotAll). Usar `[\s\S]*?` como equivalente.

---

## ⚙️ Configuración TypeScript

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "strict": true,
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Path Aliases
| Alias | Ruta real |
|-------|-----------|
| `@/*` | `./src/*` |
| `@/components` | `./src/components` |
| `@/lib` | `./src/lib` |
| `@/types` | `./src/types` |
| `@/hooks` | `./src/hooks` |

---

## 🎨 Configuración shadcn/ui

```json
{
  "style": "radix-maia",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "baseColor": "gray",
    "cssVariables": true
  },
  "iconLibrary": "hugeicons",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

---

## 🔐 Variables de Entorno Requeridas

```env
# Supabase (obligatorias)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Solo server-side
```

---

## 📋 Convenciones Técnicas Observadas

### Naming
- **Archivos**: `kebab-case.ts` o `PascalCase.tsx` para componentes
- **Tipos**: `PascalCase` con sufijo `.types.ts`
- **Servicios**: `kebab-case.service.ts`
- **Variables**: `camelCase`
- **Constantes**: `SCREAMING_SNAKE_CASE`

### Imports
```typescript
// 1. Librerías externas
import { useState } from 'react'

// 2. Aliases internos
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import type { Project } from '@/types/database.types'

// 3. Relativos (solo si no hay alias)
import { useGeometryTransform } from './hooks/useGeometryTransform'
```

### Componentes
- **Server Components por defecto** (sin `'use client'`)
- **Client Components** solo cuando necesiten interactividad
- Props tipadas con interfaces
- Destructuring en parámetros

### API Routes
```typescript
export const dynamic = 'force-dynamic' // Si necesita datos frescos

export async function GET() {
  // Autenticación primero
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  
  // Lógica...
}
```

---

## 🧪 Herramientas de Build/Test/Deploy

| Herramienta | Comando | Estado |
|-------------|---------|--------|
| **Dev server** | `npm run dev` | ✅ Configurado |
| **Build** | `npm run build` | ✅ Configurado |
| **Lint** | `npm run lint` (ESLint 9) | ✅ Configurado |
| **Type check** | `npx tsc --noEmit` | ✅ Configurado |
| **Tests** | `npm run test` (Vitest) | ✅ Configurado — 27 tests E2E motor geométrico |
| **Deploy** | Vercel (inferido) | ⏳ Pendiente |

---

## 📝 Librerías Opcionales vs Obligatorias

### Obligatorias (core del sistema)
- `next`, `react`, `react-dom`
- `@supabase/ssr`, `@supabase/supabase-js`
- `zod`, `react-hook-form`, `@hookform/resolvers`
- `maplibre-gl` (visor principal)
- `konva`, `react-konva` (onboarding canvas)
- `jszip`, `@tmcw/togeojson`, `xmldom`

### Opcionales (pueden sustituirse)
- `react-resizable-panels` (layouts)
- `tw-animate-css` (animaciones)
