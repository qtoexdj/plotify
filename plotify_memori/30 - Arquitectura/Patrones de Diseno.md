# Patrones de Diseno

**Tag:** #arquitectura #frontend
**Relacionado:** [[Arquitectura General]], [[Estructura de Carpetas Frontend]], [[Servicios lib-services]]

---

## 1. Service Layer Pattern

**Ubicacion:** `src/lib/services/` (17 archivos)

Cada servicio encapsula queries a Supabase. Los componentes y Server Actions importan servicios, nunca llaman a `supabase.from()` directamente.

```
Componente → Server Action → Service → Supabase
```

Ejemplos: `projects.service.ts`, `lots.service.ts`, `dashboard.service.ts`, `kml-to-geojson.service.ts`.

## 2. Server Actions para Mutaciones

**Ubicacion:** `src/actions/` (9 archivos)

Todas las mutaciones pasan por Server Actions con validacion Zod:

- `reserve-lot.action.ts` — Reserva un lote.
- `request-approval.action.ts` — Solicita aprobacion de reserva.
- `lot-process.action.ts` — Cambia etapa de proceso.
- `documents.action.ts` — Genera documentos.
- `invite-vendor.action.ts` — Invita vendedor.

## 3. Route Groups para Aislamiento de Layout

**Ubicacion:** `src/app/`

- `(auth)` — Login/callback, sin sidebar.
- `(dashboard)` — Rutas protegidas, con sidebar y layout de dashboard.
- `(super-admin)` — Rutas de admin global, layout propio.

## 4. Multitenancy con RLS

Todas las tablas core tienen `organization_id`. Las politicas RLS filtran automaticamente segun el `auth.uid()` del usuario. El service layer siempre pasa `org_id` en las queries.

## 5. Strict Typing

- TypeScript en modo `strict`.
- Tipos de DB generados por Supabase CLI (`database.types.ts`).
- Tipos V2 (`v2.ts`) para nuevas features.
- Zod schemas para validacion en runtime.

## 6. Dual Geometry Engine

- **UTM** — Sistema oficial/legal (metros, proyeccion Gauss-Kruger).
- **WGS84** — Display web (lat/lng para MapLibre).
- Conversion via `proj4`.

## 7. Microservice Bridge

- Comunicacion HTTP sincrona con `plotify_chat`.
- Header `X-Internal-Secret` para autenticacion servicio-a-servicio.
- Wrapper `MicroserviceResponse<T>` para respuestas tipadas.

## 8. No Secrets en Cliente

- Jamas se exponen `SUPABASE_SERVICE_ROLE_KEY` ni `INTERNAL_API_SECRET` al browser.
- Solo `NEXT_PUBLIC_SUPABASE_ANON_KEY` en cliente.

## Relacionado
- [[Servicios lib-services]] — Detalle de cada servicio
- [[Server Actions]] — Detalle de cada action
