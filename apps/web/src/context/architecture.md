# Plotify - Arquitectura del Sistema

## 🏛️ Visión General

Plotify sigue una arquitectura **Next.js App Router** con:

- **Server Components** para renderizado inicial y SEO
- **Client Components** para interactividad (canvas, formularios)
- **API Routes** como capa de abstracción sobre Supabase
- **Servicios** como Data Access Layer
- **Supabase** para persistencia y autenticación

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTE                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Pages     │  │  Components │  │ Client Services │  │
│  │  (Server)   │  │  (Client)   │  │    (fetch)      │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
└─────────┼────────────────┼──────────────────┼───────────┘
          │                │                  │
          ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                   API ROUTES                            │
│  /api/projects  /api/projects/*/lots  /api/onboarding   │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    SERVICES                             │
│   projects.service   lots.service   onboarding.service  │
│   viewer.service     kmz-parser.service                 │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    SUPABASE                             │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐   │
│  │PostgreSQL│  │   Auth   │  │Storage │  │    RLS    │   │
│  └─────────┘  └──────────┘  └────────┘  └───────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Estructura de Módulos

```
plotify/
├── src/                      # Source Code Refactor
│   ├── app/                  # Next.js App Router (Unificado)
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   └── callback/route.ts
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   ├── projects/
│   │   │   ├── clients/
│   │   │   ├── operations/
│   │   │   └── onboarding/
│   │   ├── (super-admin)/
│   │   │   ├── layout.tsx
│   │   │   └── super-admin/
│   │   └── api/
│   ├── components/           # Componentes React
│   │   ├── ui/               # shadcn/ui primitives
│   │   ├── auth/
│   │   ├── projects/
│   │   └── system/
│   ├── context/              # Documentación técnica
│   │   ├── architecture.md
│   │   └── ...
│   ├── lib/                  # Utilidades y servicios
│   │   ├── supabase/
│   │   ├── services/
│   │   ├── geometry/         # utm.ts, utils.ts, compute-m2.ts, canvas-transform.ts, servidumbre.ts
│   │   ├── legal/            # servidumbre-generator.ts, number-to-words.ts
│   │   └── utils.ts
│   ├── types/
│   ├── hooks/
│   └── proxy.ts              # Next.js proxy (ex-middleware)
├── public/                   # Assets estáticos
└── ...
```

---

## 🔲 Módulos y Responsabilidades

### 1. **Authentication Module** (`/app/(auth)`, `/src/components/auth`)

- **Responsabilidad**: Login, logout, protección de rutas
- **Componentes**: `LoginForm`, `UserMenu`
- **Servicios**: Supabase Auth SSR
- **Patrón**: Cookie-based sessions
- **Flujo Post-Login**: Redirección a `/dashboard` tras autenticación exitosa y validación de permisos.

### 2. **Projects Module** (`/app/(dashboard)/projects`, `/src/lib/services/projects.service.ts`)

- **Responsabilidad**: CRUD de proyectos, métricas
- **Endpoints**:
  - `GET/POST /api/projects`
  - `GET/DELETE /api/projects/[id]`
- **Reglas**: Auto-generación de N lotes al crear
- **Multitenancy**: si el usuario pertenece a una organización, los proyectos se crean/consultan con `organization_id` y `owner_id = null`
- **Permisos**: solo miembros `admin` pueden crear proyectos en modo organización

### 3. **Lots Module** (`/app/(dashboard)/projects/[projectId]`, `/src/lib/services/lots.service.ts`)

- **Responsabilidad**: Gestión de lotes y ficha contractual (`lot_records`)
- **Endpoints**:
  - `GET /api/projects/[id]/lots`
  - `PATCH /api/projects/[id]/lots/[lotId]`
- **Módulo Legal de Verificación**:
  - **Responsabilidad**: Validación de superficies y deslindes frente a planos oficiales (`area_official_m2`, `boundaries_official`).
  - **Protección de Datos**: Los campos legales están protegidos por el trigger `trg_guard_legal_fields` (solo accesible para `project_admin`).
  - **Acciones**: `markLotVerified`, `saveOfficialOverride` (Server Actions).
- **Reglas**: 1 ficha por lote, estado de lote y vendedor asignado

### 4. **Onboarding Module** (`/app/(dashboard)/onboarding`, `/src/lib/services/onboarding.service.ts`)

- **Responsabilidad**: Wizard de creación de proyecto con KMZ
- **Endpoints**:
  - `POST /api/uploads/geometry` (Soporta KMZ/KML y CAD DXF/DWG)
  - `GET /api/onboarding/[projectId]/lots`
  - `GET /api/onboarding/[projectId]/geometries`
  - `POST /api/onboarding/assign`
  - `DELETE /api/onboarding/unassign-geometry`
  - `POST /api/onboarding/save-and-assign`
  - `POST /api/onboarding/save-infrastructure`
- **Componentes**: `KmzUploadPanel`, `GeometryAssignmentPanel`
- **Auto-cálculo de superficie y servidumbre**: Al asignar una geometría o guardar infraestructura:
  - Se calcula `lots.m2` y áreas usando utilidades en `utm.ts`.
  - Se calcula `servidumbre_m2` cruzando el lote con el camino (`projects.road_geometry`) usando `intersect` y `area` de Turf.js en `servidumbre.ts`.
  - Se calcula `superficie_neta_m2 = m2 - servidumbre_m2`.
- **Selección de lote (pestaña Asignar)**: La selección del lote objetivo se realiza mediante un **Combobox** (`shadcn/ui Command + Popover`) embebido directamente en la sección "Asignar al lote", sin necesidad de cambiar a la pestaña "Lotes". Incluye búsqueda instantánea client-side, feedback visual del lote seleccionado (con check verde) y solo muestra lotes no asignados (`availableLots = lots.filter(l => !assignedLotIds.has(l.id))`).
- **Desasignación de Geometría**: El sistema permite revertir una asignación errónea. Al desasignar, se elimina el `geometry_id` del lote en la base de datos y se restaura el polígono a la lista de "disponibles" en la memoria del cliente (para DXF/KMZ).
- **Inicialización de Precios y Formatos**: En el Paso 1, el servicio `createProject` inyecta dinámicamente el `precio` y `valor_reserva` si se configuran como fijos, además de aplicar el `lotPrefix` configurado por el usuario.
- **Optimizaciones de Rendimiento**: Ver sección "Optimizaciones de Canvas" abajo

### 5. **Viewer Module** (`/app/(dashboard)/projects/[projectId]`, `/src/components/projects/geometry-viewer`)

- **Responsabilidad**: Visualización interactiva de geometrías asignadas (Lotes y Caminos)
- **Tecnología**: **MapLibre GL** (`maplibre-gl ^5.19.0`) con wrapper **mapcn** (`src/components/ui/map.tsx`)
- **Componentes del Visor**:
  - `index.tsx` — Shell principal: data fetching, sidebar, selección, layout
  - `MapPanel.tsx` — Componente `<Map>` de mapcn, auto-fit `bbox`, controles
  - `MapLotLayers.tsx` — Capas GeoJSON (fill, stroke, labels, hover) con `useTheme()` para colores dinámicos light/dark
  - `LotHoverCard.tsx` — Tooltip HTML sobre el mapa al hover
  - `ItemDetailPanel.tsx` — Router de detalle (LotInfoView, LotEditForm, infraestructura)
- **Características**:
  - Basemap automático light/dark via `useTheme()`
  - Zoom/Pan nativo de MapLibre GL (WebGL)
  - Labels de lotes como `symbol` layer sobre el source GeoJSON principal
  - Sincronización Realtime (Supabase Channels)
  - Panel lateral integrado para gestión de lotes
- **Cálculo Geoespacial**: Motor Dual (`src/lib/geometry`):
  - **Legal/Proyectado**: UTM (WGS84 Sur) vía `proj4` para conformidad con planos oficiales (SAG/CBR). Cálculo de deslindes UTM automáticos.
  - **Detección de Vecinos**: La utilidad `getBoundariesWithNeighbors` utiliza algoritmos de proximidad de segmentos (tolerancia de ~1m) para identificar lotes adyacentes.
    - **Suma Colineal (FaceLen)**: Para resolver fragmentación CAD en los polígonos de vecinos, el motor identifica todos los segmentos del vecino colineales al tramo actual (tolerancia 3°) y suma sus distancias. Esto permite calcular la longitud real de la cara del vecino (`FaceLen`) y compararla con el solape (`overlap`) de forma precisa.
  - **Detección de Servidumbre (Caminos)**: Cada segmento del polígono se evalúa contra la geometría del camino (`road_geometry`) para determinar si toca una servidumbre. El algoritmo implementa:
    - **Distancia en metros reales**: Cálculo con corrección `cos(lat)` para evitar anisotropía entre ejes E-W y N-S (`DEG_TO_M_LAT`, `DEG_TO_M_LON`). Umbral configurable (`ROAD_THRESHOLD_M = 4m`).
    - **Muestreo multi-punto**: 3 puntos (0%, 50%, 100%) a lo largo de cada segmento para capturar contacto.
    - **Distinción `roadContactFull` vs `touchesRoad`**: Basado en el porcentaje de puntos que tocan el camino.
  - **Orientación Cardinal (Azimut)**: El rumbo geográfico de cada deslinde se obtiene calculando la **Normal Exterior del Segmento**. Esta normal se evalúa usando un sistema de cuadrantes de Azimut con saltos precisos de `22.5°` para garantizar agrupaciones coherentes (Norte, Sur, Oriente, Poniente).
  - **Auto-relleno de Colindancia e `is_partial`**: El campo "Colinda con" se rellena automáticamente.
    - **Contrato `is_partial`**: Si `overlap < FaceLen - 0.5m`, se marca el vecino como parcial (`is_partial: true`).
    - **Generación de Texto**: El generador legal (`deslinde-generator.ts`) utiliza esta bandera para anteponer el prefijo "parte del" al nombre del vecino.
    - **Enriquecimiento**: Si existen datos oficiales (`boundaries_official`), se preserva su integridad mientras se enriquecen con la metadata de vecinos detectada.
- **Endpoints**: `GET /api/viewer/[projectId]/feature-collection`
- **Filtro y Renderizado de Geometrías**: El visor implementa reglas críticas para la integridad visual:
  - Solo muestra geometrías de lote asignadas explícitamente (`lot_id NOT NULL`), eliminando "geometrías zombies".
  - Áreas comunes (`common_area`) se renderizan solo si `is_assigned = true`.
  - **Caminos Unificados**: Los caminos se renderizan a partir de una única capa unificada guardada en `projects.road_geometry`, optimizando la persistencia y permitiendo el cálculo preciso de servidumbres.
- **Panel lateral**: Siempre visible al cargar (no colapsado). Muestra datos del lote seleccionado o mensaje de bienvenida.
- **Superficie auto-calculada**: La card de Superficie muestra `area_official_m2` (si verificado) → `legalMetrics.area_legal_m2` (calculado en tiempo real) → "--" (sin geometría). Sin tooltip.
- **Pestaña Legal**: Muestra únicamente el panel de **Verificación Legal** (deslindes oficiales editables, superficie oficial, estados de verificación). La sección "Deslindes Geodésicos" (tabla read-only) fue eliminada de la interfaz.
- **Dark Mode completo**: Todos los componentes del visor usan tokens semánticos CSS (`bg-card`, `text-foreground`, `border-sidebar-border`, etc.) y variantes `dark:` para compatibilidad total con `next-themes`.
- **Estado**: ✅ Implementado (MapLibre GL + motor dual + filtro de asignación + auto-superficie + dark mode)

#### 🚀 Optimizaciones de Canvas (Konva — Solo Onboarding)

El visor de Onboarding (`GeometryAssignmentPanel`) aún usa Konva y mantiene las siguientes optimizaciones:

| Optimización                       | Descripción                                                          | Impacto           |
| ---------------------------------- | -------------------------------------------------------------------- | ----------------- |
| **Pre-computación de coordenadas** | `useMemo` con `transformedFeatures` calcula transformaciones una vez | -40% CPU          |
| **Contadores en un solo paso**     | Un `forEach` vs múltiples `filter()`                                 | -15% iteraciones  |
| **`perfectDrawEnabled: false`**    | Desactiva anti-aliasing sub-pixel en Konva                           | +15% FPS          |
| **Shape caching**                  | `useEffect` cachea shapes del Layer tras render                      | +20% re-renders   |
| **Throttle 16ms en zoom**          | Limita eventos de wheel a 60fps                                      | Sin lag en scroll |
| **StrokeWidth dinámico**           | `strokeWidth / stageScale` mantiene proporción visual                | UX mejorada       |
| **Memoización de visibleShapes**   | `useMemo` evita recálculos innecesarios                              | -10% renders      |

> **Nota**: El visor principal de proyectos (`GeometryViewer`) fue migrado a MapLibre GL y ya no utiliza estas optimizaciones de Konva. MapLibre usa WebGL nativo.

### 8. **Legal Module — Motor de Servidumbre** (`/src/lib/geometry/servidumbre.ts`, `/src/lib/legal/servidumbre-generator.ts`)

- **Responsabilidad**: Cálculo geométrico y generación textual de servidumbres de tránsito en formato legal chileno.
- **Componente UI**: `src/components/projects/detail/legal-tab.tsx` (Client Component, pestaña "Legal" del proyecto)
- **Pipeline completo**:
  1. Fetch `ViewerFeatureCollection` desde `/api/viewer/[projectId]/feature-collection`
  2. Cálculo client-side con `analyzeServidumbreBoundaries()` (Turf.js)
  3. Caché por lote con `useRef<Map<lotId, ServidumbreAnalysis>>`
  4. Generación de texto con `generateServidumbreText(analysis, widthRoadMeters)`
- **Motor Geométrico** (`servidumbre.ts`):
  - `calculateServidumbre()`: buffer sobre `road_geometry` a `width/2` metros → intersección con lote → área m²
  - `sanitizeLotGeometry()`: convierte LineString/MultiLineString → Polygon (para lotes importados desde KMZ/CAD)
  - `analyzeServidumbreBoundaries()`: clasifica cada arista del mini-polígono como `internal` (lote propio), `neighbor` (lote vecino) o `external` (predio externo)
  - `fuseCollinearSegments()`: fusión colineal con tolerancia 3° (resiliencia a fragmentación de archivos CAD)
  - `detectNeighborsForSegment()`: detección de vecinos con micro-ray casting (0.1m inset)
  - `groupEdgesIntoTramos()`: agrupa aristas según el deslinde del camino → detecta escenario multi-tramo
- **Generador Legal** (`servidumbre-generator.ts`):
  - `consolidateEdges()`: agrupa micro-aristas (esquinas del buffer) por dirección + colindancia, descarta < 1.0m
  - `applyHeadOcclusion()`: oculta distancia en "cabezas" (lados cortos ≤ `widthRoadMeters + 2`m) — norma notarial chilena
  - `groupAndFormatEdges()`: consolida grupos por label cardinal con soporte multi-segmento
  - `renderGroupedBoundaries()`: genera texto legal ("en X metros con servidumbre que grava al lote N")
  - `generateServidumbreText(analysis, widthRoadMeters)`: orquesta simple y multi-tramo
  - `generateServidumbreTextLegacy(lot)`: fallback para lotes sin `ServidumbreAnalysis` (**@deprecated**)
- **Tipos** (`/types/database.types.ts`):
  ```typescript
  ServidumbreFrontierType // 'internal' | 'neighbor' | 'external'
  ServidumbreEdge // direction, distance, frontierType, neighbors[], bearing, p1, p2
  ServidumbreTramo // direction, edges[]
  ServidumbreAnalysis // lotNumber, areaM2, isMultiTramo, tramos[], allEdges[]
  ```
- **Guardrails implementados**:
  - Ray-casting offset 0.1m para evitar falsos positivos en vértices compartidos
  - Fusión colineal antes de clasificación de fronteras
  - Umbral de cabeza configurable (`widthRoadMeters + 2`)
- **Suite de Integración QA** (`tests/lib/geometry/engine-e2e.test.ts`):
  - **27 tests** que validan la cadena completa Geometría → Vecinos → Deslinde → Servidumbre
  - Mocks WGS84 centrados en Santiago: `loteObjetivo` (100×100m), `loteVecinoCompleto`, `loteVecinoParcial` (150×150m), `camino`, `loteFragmentado` (3 sub-aristas CAD)
  - **Edge Cases Topográficos**: `loteEnL` (polígono cóncavo), `loteAgudo` (triángulo <15°), `caminoQuebrado` (quiebre 90° → multi-tramo)
  - Corre con: `npx vitest run tests/lib/geometry/engine-e2e.test.ts`
- **Estado**: ✅ Implementado (Motor v2 – FASE 1-7 completadas + Suite QA 27/27)

### 6. **Geometry Processing** (`/src/lib/services/kmz-parser.service.ts`, `kml-to-geojson.service.ts`)

- **Responsabilidad**: Parseo y clasificación de archivos geoespaciales
- **Flujo Legacy**: KMZ → unzip → KML → GeoJSON → Clasificación
- **Flujo CAD**: DXF/DWG → Microservice (Python) → GeoJSON → Clasificación (**Congelado V2.1** vía Feature Flags)

### 7. **Super Admin Module** (`/app/(super-admin)/super-admin`)

- **Responsabilidad**: Vista global de empresas, usuarios, proyectos y auditoría
- **Acceso**: Solo `profiles.is_super_admin = true`
- **Helpers**: `src/lib/auth/super-admin.ts`
- **Rutas**: `/super-admin`, `/super-admin/organizations`, `/super-admin/users`, `/super-admin/projects`, `/super-admin/audit-logs`
- **Redirección**: root y dashboard envían a super admin cuando el flag está activo

---

## 🧱 Capas y Boundaries

### Capa de Presentación

```
app/(dashboard)/**/*.tsx  →  Solo UI y navegación
src/components/**/*.tsx   →  Componentes reutilizables
```

**NO DEBE**: Acceder a Supabase directamente (excepto `createClient()` en Server Components)

### Capa de API

```
app/api/**/route.ts
```

**DEBE**:

- Validar autenticación
- Validar payloads
- Delegar a servicios
- Retornar JSON estandarizado

**NO DEBE**: Contener lógica de negocio compleja

### Capa de Servicios

```
src/lib/services/**/*.service.ts
```

**DEBE**:

- Encapsular queries a Supabase
- Manejar errores de DB
- Retornar tipos definidos

**NO DEBE**:

- Acceder a `request`/`response`
- Manejar autenticación (ya validada en API)

### Capa de Datos

```
Supabase (PostgreSQL + RLS)
```

**Responsabilidad**:

- Persistencia
- Row Level Security por `owner_id` y `organization_id`
- Relaciones y constraints

---

## 🔀 Patrones Usados

### 1. **Repository Pattern (implícito)**

Los servicios actúan como repositorios abstractos sobre Supabase:

```typescript
// projects.service.ts
export async function getProjectsWithMetrics(userId: string): Promise<ProjectWithMetrics[]>
export async function createProject(payload, userId): Promise<{ project; lots }>
export async function deleteProject(projectId, userId): Promise<void>
```

### 2. **Route Groups (Next.js)**

```
app/(auth)/   →  Rutas públicas de autenticación
app/(dashboard)/  →  Rutas protegidas con layout compartido
app/(super-admin)/  →  Rutas protegidas para super admin
```

### 3. **Compound Components (parcial)**

El `GeometryAssignmentPanel` agrupa canvas, toolbar, sidebar en un solo módulo exportado.

### 4. **Custom Hooks**

```typescript
// hooks/useGeometryTransform.ts
export function useGeometryTransform(dimensions: CanvasDimensions) {
  // Lógica de transformación geométrica
}
```

### 5. **Type-First Development**

Todos los tipos definidos en `/types/*.types.ts` antes de implementar.

---

## ⚠️ Antipatrones Detectados

### 1. **Lógica duplicada de autenticación**

Cada API Route repite:

```typescript
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
```

**Recomendación**: Crear middleware o HOF de autenticación.

### 2. **Componente monolítico**

`GeometryAssignmentPanel` tiene ~1000 líneas con múltiples responsabilidades.
**Recomendación**: Dividir en sub-componentes más pequeños.

### 3. **Validation & Security Pattern (Server Actions)**

Se ha implementado un patrón centralizado para Server Actions que tocan datos sensibles:

- **Validación de Schema**: Uso de Zod en `/src/lib/validations` para validar inputs antes de cualquier operación.
- **Chequeo de Permisos**: Función `checkUserPermissions` que consulta la DB (proyectos/organizaciones) respetando RLS para verificar acceso antes de ejecutar lógica de negocio.
- **Revalidación**: Uso de `revalidatePath` para asegurar que el cliente vea los datos actualizados inmediatamente.

**Recomendación**: Migrar todas las Server Actions a este patrón.

### 4. **Manejo de errores inconsistente** (Antiguo punto 3)

Se están centralizando las validaciones en `/lib/validations/*.schema.ts`.
**Recomendación**: Seguir moviendo validaciones inline a esquemas de Zod reutilizables.

---

## 🔒 Seguridad

- **Tablas protegidas**: `projects`, `lots`, `lot_records`, `geometries`, `vendors`, `vendor_projects`, `organizations`, `organization_members`, `profiles`, `audit_logs`
- **Policy**: `owner_id = auth.uid()` o `is_org_admin()` etc.
- **Service Role**: Solo para operaciones server-side sin filtros (usar con precaución).
- **Backend Validation**: Los Server Actions validan el acceso consultando la DB explícitamente (`checkUserPermissions`) además de confiar en RLS.
- **Prevención de Recursión**: Uso de funciones `SECURITY DEFINER` para romper ciclos en políticas complejas (ver `database-schema.md`).

### Middleware de Rutas (Proxy)

```typescript
// src/proxy.ts
// Protege: /dashboard, /projects, /onboarding, /clients
// Redirige a /auth/login si no autenticado
```

### CORS

- Manejado por Next.js
- API Routes solo accesibles desde mismo origen

---

## 📊 Diagrama de Base de Datos

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   profiles   │     │   projects   │     │    lots      │
├──────────────┤     ├──────────────┤     ├──────────────┤
│ id (PK)      │     │ id (PK)      │◄────│ project_id   │
│ username     │     │ name         │     │ id (PK)      │
│ avatar_url   │     │ region       │     │ numero_lote  │
└──────────────┘     │ owner_id ────┼────►│ estado       │
                     │ total_lotes  │     │ vendedor_id  │
                     └──────────────┘     └──────┬───────┘
                                                 │
                                                 │
                     ┌──────────────┐            │
                     │  geometries  │◄───────────┘
                     ├──────────────┤
                     │ id (PK)      │
                     │ project_id   │
                     │ lot_id (FK)  │
                     │ geometry_type│
                     │ geometry     │ (JSONB)
                     └──────────────┘

                     ┌──────────────┐
                     │ lot_records  │
                     ├──────────────┤
                     │ lot_id (PK)  │
                     │ cliente_*    │
                     │ firma_*      │
                     │ cbr_*        │
                     │ gastos_*     │
                     └──────────────┘

┌──────────────┐     ┌──────────────┐
│   vendors    │     │ vendor_proj  │
├──────────────┤     ├──────────────┤
│ id (PK)      │◄────│ vendor_id    │
│ nombre       │     │ project_id   │
│ user_id      │     │ (PK comp.)   │
└──────────────┘     └──────────────┘
```
