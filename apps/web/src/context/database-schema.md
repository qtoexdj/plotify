# Plotify - Auditoría Completa de Base de Datos

**Fecha de Auditoría**: 5 de marzo de 2026  
**Base de Datos**: Supabase Local (PostgreSQL)  
**Versión del Schema**: Motor Servidumbre v2 (FASE 7 completada)

---

## 📊 Resumen Ejecutivo

La base de datos **Plotify** está diseñada para gestionar proyectos inmobiliarios, lotes y geometrías geoespaciales, con una **ficha única por lote** (`lot_records`) que concentra datos de cliente, escritura, CBR y gastos. El modelo soporta **modo personal** (multitenancy por `owner_id`), **modo organización** (multitenancy por `organization_id`) con roles (`admin`, `user`) y **super admin global** vía `profiles.is_super_admin`.

| Métrica              | Valor                                                      |
| -------------------- | ---------------------------------------------------------- |
| **Tablas**           | 10 tablas en schema `public` (Esquema `plotify` eliminado) |
| **Columnas**         | 107 columnas en total                                      |
| **Foreign Keys**     | 20 FK activas                                              |
| **Índices**          | 28 índices (incluyendo PKs)                                |
| **Tipos Enum**       | 6 enums personalizados                                     |
| **Tipos Compuestos** | 10 table types (generados automáticamente)                 |
| **RLS**              | 47 políticas activas (10 tablas)                           |
| **Triggers**         | 2 triggers definidos en `public`                           |
| **Secuencias**       | 0 secuencias (usando UUID)                                 |

---

## 🏗️ Tablas Core

### 1. **profiles** (Perfiles de Usuario)

Gestiona información de perfiles de usuarios autenticados en Supabase.

| Columna          | Tipo           | Nullable | Default | Constraints                                  |
| ---------------- | -------------- | -------- | ------- | -------------------------------------------- |
| `id`             | `uuid`         | NO       | -       | PK, FK → `auth.users.id` (ON DELETE CASCADE) |
| `username`       | `text`         | YES      | -       | UNIQUE, CHECK: `length ≥ 3`                  |
| `avatar_url`     | `text`         | YES      | -       | -                                            |
| `website`        | `text`         | YES      | -       | -                                            |
| `is_super_admin` | `boolean`      | NO       | `false` | Rol global                                   |
| `updated_at`     | `timestamp tz` | YES      | -       | -                                            |

**RLS Policies**:

- ✅ SELECT: `uid() = id` o `is_super_admin()`
- ✅ INSERT: self y `is_super_admin = false` (o super admin)
- ✅ UPDATE: self sin escalar rol (o super admin)

**Índices**:

- `profiles_pkey` (PK on `id`)
- `profiles_username_key` (UNIQUE on `username`)

---

### 2. **organizations** (Empresas)

Representa una empresa que agrupa usuarios, proyectos y vendedores.

| Columna      | Tipo           | Nullable | Default             | Constraints                               |
| ------------ | -------------- | -------- | ------------------- | ----------------------------------------- |
| `id`         | `uuid`         | NO       | `gen_random_uuid()` | PK                                        |
| `name`       | `text`         | NO       | -                   | -                                         |
| `slug`       | `text`         | NO       | -                   | UNIQUE                                    |
| `created_by` | `uuid`         | NO       | -                   | FK → `auth.users.id` (ON DELETE SET NULL) |
| `created_at` | `timestamp tz` | NO       | `now()`             | -                                         |
| `updated_at` | `timestamp tz` | NO       | `now()`             | -                                         |

**RLS Policies**:

- ✅ Miembros pueden leer su organización
- ✅ Insert solo por el creador (`created_by = uid()`)
- ✅ Update/Delete solo por `admin`

**Índices**:

- `organizations_pkey` (PK on `id`)
- `organizations_slug_key` (UNIQUE on `slug`)

**Foreign Keys**:

- `organizations_created_by_fkey` → `auth.users.id`

---

### 3. **organization_members** (Miembros de Empresa)

Relaciona usuarios con organizaciones y define su rol.

| Columna           | Tipo            | Nullable | Default | Constraints                                  |
| ----------------- | --------------- | -------- | ------- | -------------------------------------------- |
| `organization_id` | `uuid`          | NO       | -       | PK, FK → `organizations.id`                  |
| `user_id`         | `uuid`          | NO       | -       | PK, FK → `auth.users.id` (ON DELETE CASCADE) |
| `role`            | `org_role` enum | NO       | -       | ('admin', 'user')                            |
| `created_at`      | `timestamp tz`  | NO       | `now()` | -                                            |
| `updated_at`      | `timestamp tz`  | NO       | `now()` | -                                            |

**RLS Policies**:

- ✅ Miembro puede leer su registro
- ✅ Admin puede insertar/actualizar/eliminar miembros

**Índices**:

- `organization_members_pkey` (PK on `organization_id, user_id`)
- `organization_members_user_id_key` (UNIQUE on `user_id`)
- `organization_members_org_id_idx` (btree on `organization_id`)

**Foreign Keys**:

- `organization_members_organization_id_fkey` → `organizations.id`
- `organization_members_user_id_fkey` → `auth.users.id`

---

### 4. **projects** (Proyectos Inmobiliarios)

Representa un proyecto de loteo con información geográfica y metadatos.

| Columna           | Tipo           | Nullable | Default             | Constraints                                            |
| ----------------- | -------------- | -------- | ------------------- | ------------------------------------------------------ |
| `id`              | `uuid`         | NO       | `gen_random_uuid()` | PK                                                     |
| `name`            | `text`         | NO       | -                   | -                                                      |
| `region`          | `text`         | YES      | -                   | -                                                      |
| `comuna`          | `text`         | YES      | -                   | (región administrativa chilena)                        |
| `descripcion`     | `text`         | YES      | -                   | -                                                      |
| `total_lotes`     | `integer`      | NO       | -                   | CHECK: `> 0`                                           |
| `estado`          | `text`         | NO       | `'activo'`          | ('activo', 'inactivo')                                 |
| `created_at`      | `timestamp tz` | NO       | `now()`             | -                                                      |
| `updated_at`      | `timestamp tz` | NO       | `now()`             | -                                                      |
| `owner_id`        | `uuid`         | YES      | `uid()`             | FK → `auth.users.id` (ON DELETE RESTRICT)              |
| `organization_id` | `uuid`         | YES      | -                   | FK → `organizations.id`                                |
| `road_geometry`   | `jsonb`        | YES      | -                   | GeoJSON con recorrido unificado de caminos             |
| `road_width_m`    | `numeric`      | YES      | `6`                 | Ancho del camino en metros para cálculo de servidumbre |

**Constraints Clave**:

- `owner_id` y `organization_id` son excluyentes (modo personal vs organización)

**RLS Policies**:

- ✅ Personal: `owner_id = uid()` y `organization_id IS NULL`
- ✅ Organización (admin): acceso total dentro de su organización
- ✅ Organización (user): SELECT solo si está asignado vía `vendor_projects`

**Índices**:

- `projects_pkey` (PK on `id`)
- `idx_projects_estado` (btree on `estado`)
- `projects_org_id_idx` (btree on `organization_id`)

**Foreign Keys**:

- `projects_owner_id_fkey` → `auth.users.id`
- `projects_organization_id_fkey` → `organizations.id`

---

### 5. **lots** (Lotes/Parcelas)

Cada lote es una parcela de un proyecto con estado comercial y asignación de geometría.

| Columna                | Tipo               | Nullable | Default             | Constraints                                                             |
| ---------------------- | ------------------ | -------- | ------------------- | ----------------------------------------------------------------------- |
| `id`                   | `uuid`             | NO       | `gen_random_uuid()` | PK                                                                      |
| `project_id`           | `uuid`             | NO       | -                   | FK → `projects.id`                                                      |
| `numero_lote`          | `text`             | NO       | -                   | Identificador del lote                                                  |
| `estado`               | `estado_lote` enum | NO       | `'disponible'`      | ('disponible', 'reservado', 'vendido')                                  |
| `observaciones`        | `text`             | YES      | -                   | -                                                                       |
| `vendedor_id`          | `uuid`             | YES      | -                   | FK → `vendors.id`                                                       |
| `precio`               | `numeric`          | YES      | -                   | -                                                                       |
| `m2`                   | `numeric`          | YES      | -                   | Superficie en metros cuadrados                                          |
| `reserved_at`          | `timestamp tz`     | YES      | -                   | Marca temporal de reserva                                               |
| `sold_at`              | `timestamp tz`     | YES      | -                   | Marca temporal de venta                                                 |
| `geometry_id`          | `uuid`             | YES      | -                   | FK → `geometries.id`                                                    |
| `area_official_m2`     | `numeric`          | YES      | -                   | Superficie oficial (SAG/CBR)                                            |
| `boundaries_official`  | `jsonb`            | YES      | -                   | Deslindes oficiales (Lista de `OfficialBoundary`, ver tipos compuestos) |
| `verified_status`      | `text`             | NO       | `'draft'`           | (draft, verified_exact, verified_override)                              |
| `verified_at`          | `timestamptz`      | YES      | -                   | Timestamp de verificación                                               |
| `verified_by`          | `uuid`             | YES      | -                   | FK → `auth.users.id`                                                    |
| `servidumbre_m2`       | `numeric`          | YES      | -                   | Metros cuadrados cedidos por el lote para camino                        |
| `superficie_neta_m2`   | `numeric`          | YES      | -                   | Área oficial o calculada menos servidumbre_m2                           |
| `servidumbre_ancho_m`  | `numeric`          | YES      | -                   | Ancho (en metros) de la servidumbre de tránsito que afecta al lote      |
| `perimeter_official_m` | `numeric`          | YES      | -                   | Perímetro oficial en metros (SAG/CBR)                                   |
| `valor_reserva`        | `numeric`          | YES      | -                   | Valor de reserva del lote (puede diferir del precio final)              |
| `created_at`           | `timestamp tz`     | NO       | `now()`             | -                                                                       |
| `updated_at`           | `timestamp tz`     | NO       | `now()`             | -                                                                       |

**RLS Policies**:

- ✅ Dueño/admin del proyecto: acceso total
- ✅ Vendedor asignado al proyecto: SELECT
- ✅ Vendedor asignado al lote: UPDATE si el lote no tiene vendedor o es su propio vendedor

**Índices**:

- `lots_pkey` (PK on `id`)
- `idx_lots_project` (btree on `project_id`)
- `idx_lots_estado` (btree on `estado`)
- `idx_lots_vendedor` (btree on `vendedor_id`)

**Foreign Keys**:

- `lots_project_id_fkey` → `projects.id`
- `lots_vendedor_id_fkey` → `vendors.id`
- `lots_geometry_fk` → `geometries.id`
- `lots_vendor_project_fkey` → `vendor_projects(vendor_id, project_id)`

---

### 6. **lot_records** (Ficha por Lote)

Tabla 1:1 con `lots` que concentra cliente, escritura, CBR, gastos y comisión por lote.

| Columna                     | Tipo                | Nullable | Default | Constraints                 |
| --------------------------- | ------------------- | -------- | ------- | --------------------------- |
| `lot_id`                    | `uuid`              | NO       | -       | PK, FK → `lots.id`          |
| `cliente_nombre`            | `text`              | YES      | -       | -                           |
| `cliente_run`               | `text`              | YES      | -       | -                           |
| `cliente_run_normalizado`   | `text`              | YES      | -       | Generado                    |
| `cliente_direccion`         | `text`              | YES      | -       | -                           |
| `cliente_estado_civil`      | `text`              | YES      | -       | -                           |
| `cliente_ocupacion`         | `text`              | YES      | -       | -                           |
| `cliente_telefono`          | `text`              | YES      | -       | -                           |
| `cliente_email`             | `text`              | YES      | -       | -                           |
| `valor`                     | `numeric`           | YES      | -       | -                           |
| `abono`                     | `numeric`           | YES      | -       | -                           |
| `saldo`                     | `numeric`           | YES      | -       | Generado (`valor - abono`)  |
| `detalle_deuda`             | `text`              | YES      | -       | -                           |
| `firma_estado`              | `text`              | YES      | -       | -                           |
| `firma_fecha`               | `date`              | YES      | -       | -                           |
| `firma_lugar`               | `text`              | YES      | -       | -                           |
| `gasto_notaria`             | `numeric`           | YES      | -       | -                           |
| `gasto_cbr`                 | `numeric`           | YES      | -       | -                           |
| `gasto_abogado`             | `numeric`           | YES      | -       | -                           |
| `cbr_estado`                | `text`              | YES      | -       | -                           |
| `cbr_numero_petitorio`      | `text`              | YES      | -       | -                           |
| `cbr_fecha_salida_estimada` | `date`              | YES      | -       | -                           |
| `cbr_reparo`                | `text`              | YES      | -       | -                           |
| `comision_monto`            | `numeric`           | YES      | -       | -                           |
| `comision_pagada_at`        | `timestamp tz`      | YES      | -       | -                           |
| `etapa_proceso`             | `ProcessStage` enum | YES      | -       | Etapa del flujo legal/venta |
| `created_at`                | `timestamp tz`      | NO       | `now()` | -                           |
| `updated_at`                | `timestamp tz`      | NO       | `now()` | -                           |

**RLS Policies**:

- ✅ Dueño/admin del proyecto: acceso total
- ✅ Vendedor asignado al lote: SELECT/UPDATE

**Índices**:

- `lot_records_pkey` (PK on `lot_id`)
- `idx_lot_records_run` (btree on `cliente_run_normalizado`)

**Foreign Keys**:

- `lot_records_lot_id_fkey` → `lots.id` (ON DELETE CASCADE)

---

### 7. **geometries** (Geometrías Geoespaciales)

Almacena geometrías (polígonos, líneas) en formato GeoJSON provenientes de archivos KMZ/KML.

| Columna         | Tipo                 | Nullable | Default             | Constraints                                                                                                                  |
| --------------- | -------------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`            | `uuid`               | NO       | `gen_random_uuid()` | PK                                                                                                                           |
| `project_id`    | `uuid`               | NO       | -                   | FK → `projects.id`                                                                                                           |
| `lot_id`        | `uuid`               | YES      | -                   | FK → `lots.id`, asignación opcional. NULL = Geometría "raw" (importación), NOT NULL = Geometría asignada (visible en visor). |
| `geometry_type` | `geometry_type` enum | NO       | -                   | ('lot', 'road', 'common_area')                                                                                               |
| `source_type`   | `source_type` enum   | NO       | -                   | ('kmz', 'kml')                                                                                                               |
| `geometry`      | `jsonb`              | NO       | -                   | GeoJSON FeatureCollection                                                                                                    |
| `properties`    | `jsonb`              | YES      | -                   | Metadatos adicionales                                                                                                        |
| `name`          | `text`               | YES      | -                   | Nombre descriptivo                                                                                                           |
| `is_assigned`   | `boolean`            | NO       | `false`             | Indica si la geometría es válida y debe renderizarse (ej. áreas comunes)                                                     |
| `created_at`    | `timestamp tz`       | NO       | `now()`             | -                                                                                                                            |
| `updated_at`    | `timestamp tz`       | NO       | `now()`             | -                                                                                                                            |

**RLS Policies**:

- ✅ Personal: acceso por dueño del proyecto
- ✅ Organización (admin): acceso total
- ✅ Organización (user): SELECT por proyectos asignados

**Índices**:

- `geometries_pkey` (PK on `id`)
- `idx_geometries_project` (btree on `project_id`)

**Foreign Keys**:

- `geometries_project_id_fkey` → `projects.id`
- `geometries_lot_id_fkey` → `lots.id`

---

### 8. **vendors** (Vendedores)

Información de vendedores/agentes inmobiliarios.

| Columna           | Tipo           | Nullable | Default             | Constraints                                       |
| ----------------- | -------------- | -------- | ------------------- | ------------------------------------------------- |
| `id`              | `uuid`         | NO       | `gen_random_uuid()` | PK                                                |
| `nombre`          | `text`         | NO       | -                   | -                                                 |
| `email`           | `text`         | YES      | -                   | -                                                 |
| `phone`           | `text`         | YES      | -                   | -                                                 |
| `active`          | `boolean`      | NO       | `true`              | Estado activo                                     |
| `notas`           | `text`         | YES      | -                   | -                                                 |
| `created_at`      | `timestamp tz` | NO       | `now()`             | -                                                 |
| `updated_at`      | `timestamp tz` | NO       | `now()`             | -                                                 |
| `owner_id`        | `uuid`         | YES      | `uid()`             | FK → `auth.users.id` (ON DELETE CASCADE)          |
| `organization_id` | `uuid`         | YES      | -                   | FK → `organizations.id`                           |
| `user_id`         | `uuid`         | YES      | -                   | UNIQUE, FK → `auth.users.id` (ON DELETE SET NULL) |

**Constraints Clave**:

- `owner_id` y `organization_id` son excluyentes (modo personal vs organización)
- FK compuesto `(organization_id, user_id)` → `organization_members(organization_id, user_id)`

**RLS Policies**:

- ✅ Personal: `owner_id = uid()` y `organization_id IS NULL`
- ✅ Organización (admin): acceso total
- ✅ Organización (user): SELECT vendedores asignados a proyectos compartidos

**Índices**:

- `vendors_pkey` (PK on `id`)
- `vendors_org_id_idx` (btree on `organization_id`)
- `vendors_user_id_key` (UNIQUE on `user_id`)

**Foreign Keys**:

- `vendors_owner_id_fkey` → `auth.users.id`
- `vendors_organization_id_fkey` → `organizations.id`
- `vendors_user_id_fkey` → `auth.users.id`
- `(organization_id, user_id)` → `organization_members(organization_id, user_id)`

---

### 9. **vendor_projects** (Relación Vendor-Project)

Tabla de unión para asignar vendedores a proyectos con roles.

| Columna      | Tipo           | Nullable | Default | Constraints              |
| ------------ | -------------- | -------- | ------- | ------------------------ |
| `vendor_id`  | `uuid`         | NO       | -       | FK → `vendors.id`, PK    |
| `project_id` | `uuid`         | NO       | -       | FK → `projects.id`, PK   |
| `rol`        | `text`         | YES      | -       | Ej: 'gestor', 'vendedor' |
| `created_at` | `timestamp tz` | NO       | `now()` | -                        |

**RLS Policies**:

- ✅ Personal: acceso por dueño del proyecto
- ✅ Organización (admin): acceso total
- ✅ Organización (user): SELECT por proyectos asignados

**Índices**:

- `vendor_projects_pkey` (UNIQUE on `vendor_id, project_id`)
- `idx_vendor_projects_vendor` (btree on `vendor_id`)
- `idx_vendor_projects_project` (btree on `project_id`)

**Foreign Keys**:

- `vendor_projects_vendor_id_fkey` → `vendors.id`
- `vendor_projects_project_id_fkey` → `projects.id`

---

### 10. **audit_logs** (Registros de Auditoría)

Tabla para registrar cambios en entidades críticas.

| Columna      | Tipo           | Nullable | Default             | Constraints                   |
| ------------ | -------------- | -------- | ------------------- | ----------------------------- |
| `id`         | `uuid`         | NO       | `gen_random_uuid()` | PK                            |
| `actor`      | `text`         | YES      | -                   | Usuario que realizó la acción |
| `action`     | `text`         | YES      | -                   | CREATE, UPDATE, DELETE        |
| `entity`     | `text`         | YES      | -                   | Tabla afectada                |
| `entity_id`  | `uuid`         | YES      | -                   | ID del registro               |
| `payload`    | `jsonb`        | YES      | -                   | Datos de cambio               |
| `created_at` | `timestamp tz` | NO       | `now()`             | -                             |

**RLS Policies**:

- ✅ SELECT/INSERT solo para el propio `actor`

---

## 📋 Tipos de Datos Personalizados

### Enums

#### 1. **estado_lote** (Estado del Lote)

```sql
ENUM ('disponible', 'reservado', 'vendido')
```

Define el ciclo de vida de un lote.

#### 2. **geometry_type** (Tipo de Geometría)

```sql
ENUM ('lot', 'road', 'common_area')
```

Clasifica geometrías según su propósito en el proyecto.

#### 3. **source_type** (Origen de Geometría)

```sql
ENUM ('kmz', 'kml', 'dxf', 'dwg')
```

Define el origen del archivo geoespacial.

#### 4. **sale_state** (Estado de Venta, legacy)

```sql
ENUM ('propuesta', 'reservado', 'vendido', 'cancelado')
```

Enum legacy sin tabla `sales` activa.

#### 5. **org_role** (Rol de Organización)

```sql
ENUM ('admin', 'user')
```

Define permisos base dentro de una organización.

#### 6. **VerifiedStatus** (Estado de Verificación)

```sql
ENUM ('draft', 'verified_exact', 'verified_override')
```

Define el estado de validación legal del lote frente a planos oficiales.

#### 7. **ProcessStage** (Etapa del Proceso)

```sql
ENUM ('espera_firma_reserva', 'reserva_firmada', 'espera_firma_escritura', 'escriturado')
```

Define la etapa del flujo de venta/legal.

### Estructuras JSON (Interfaces TypeScript)

#### 1. **OfficialBoundary** (Objeto en `boundaries_official`)

Define la estructura de un deslinde oficial o calculado.

```typescript
interface OfficialBoundary {
  label: string // Orientación (e.g. "Suroriente")
  description: string // Texto libre (legacy compat)
  distance?: number // Distancia en metros (editable)
  colinda?: string // Con quién colinda (editable)
  es_servidumbre?: boolean // true = toca el camino/servidumbre
  neighbors_metadata?: NeighborMetadata[] // Detalle de vecinos solapados
}
```

#### 2. **NeighborMetadata**

Metadatos de un vecino detectado en un tramo.

```typescript
interface NeighborMetadata {
  name: string // Nombre del lote vecino (ej: "11")
  is_partial: boolean // true si solo solapa parte del vecino (overlap < FaceLen - 0.5m)
}
```

### Table Types (Auto-generados)

PostgreSQL genera automáticamente tipos compuestos para cada tabla:

- `audit_logs`, `geometries`, `lot_records`, `lots`, `organization_members`,
  `organizations`, `profiles`, `projects`, `vendor_projects`, `vendors`

---

## 🔐 Políticas Row-Level Security (RLS)

### Resumen General

- **Total de políticas**: 47
- **RLS habilitado**: 10 tablas (todas las tablas de negocio en `public`)
- **Tablas sin RLS**: 0
- **Patrón de seguridad**: modo personal (`owner_id`) o modo organización (`organization_id`) con roles y asignaciones por proyecto + super admin global
- **Super admin**: acceso global controlado por `public.is_super_admin()`
- **Prevención de Recursión**: Uso de funciones `SECURITY DEFINER` (`is_project_admin`, `is_org_admin`, `is_project_vendor`) para romper ciclos de dependencias en políticas.

### Funciones Helper (Security Definer)

Estas funciones son críticas para evitar errores "Infinite recursion" (500) en RLS complejos. Se ejecutan con privilegios del definidor para evitar disparar políticas en cascada.

1.  **`public.is_org_admin(org_id uuid)`**: Verifica si `auth.uid()` es admin de la organización.
2.  **`public.is_project_admin(project_id uuid)`**: Verifica si `auth.uid()` es dueño del proyecto O admin de la organización del proyecto.
3.  **`public.is_project_vendor(project_id uuid)`**: Verifica si `auth.uid()` es un vendedor asignado al proyecto (vía tabla `vendor_projects`).

### Detalle por Tabla

| Tabla                    | Cobertura                   | Patrón de Acceso                                       |
| ------------------------ | --------------------------- | ------------------------------------------------------ |
| **profiles**             | SELECT/INSERT/UPDATE        | `uid() = id` o `is_super_admin()`                      |
| **organizations**        | SELECT/INSERT/UPDATE/DELETE | Miembro lee, admin modifica                            |
| **organization_members** | SELECT/INSERT/UPDATE/DELETE | Miembro lee, admin gestiona                            |
| **projects**             | SELECT/INSERT/UPDATE/DELETE | Dueño/admin, user asignado (SELECT)                    |
| **lots**                 | SELECT/INSERT/UPDATE/DELETE | Dueño/admin, vendedor asignado (SELECT/UPDATE)         |
| **lot_records**          | SELECT/INSERT/UPDATE/DELETE | Dueño/admin, vendedor asignado al lote (SELECT/UPDATE) |
| **geometries**           | SELECT/INSERT/UPDATE/DELETE | Dueño/admin, user asignado (SELECT)                    |
| **vendors**              | SELECT/INSERT/UPDATE/DELETE | Dueño/admin, user asignado por proyecto (SELECT)       |
| **vendor_projects**      | SELECT/INSERT/UPDATE/DELETE | Dueño/admin, user asignado (SELECT)                    |
| **audit_logs**           | SELECT/INSERT               | `actor = uid()` o super admin                          |

### ⚠️ Áreas de Mejora

- Revisar triggers para `updated_at`
- Establecer validaciones de flujo de estados (lotes/ficha)
- Definir estrategia de auditoría automática (triggers sobre tablas críticas)

---

## 📑 Índices

### Por Propósito

#### Primary Keys (PKs)

```
audit_logs_pkey, geometries_pkey, lot_records_pkey,
lots_pkey, organization_members_pkey, organizations_pkey,
profiles_pkey, projects_pkey, vendor_projects_pkey, vendors_pkey
```

#### Unique Constraints

```
organizations_slug_key (UNIQUE on slug)
organization_members_user_id_key (UNIQUE on user_id)
profiles_username_key (UNIQUE on username)
vendors_user_id_key (UNIQUE on user_id)
```

#### Performance Indexes

| Tabla                | Índice                            | Columna                   | Propósito                           |
| -------------------- | --------------------------------- | ------------------------- | ----------------------------------- |
| lots                 | `idx_lots_project`                | `project_id`              | Filtrar lotes por proyecto          |
| lots                 | `idx_lots_estado`                 | `estado`                  | Buscar lotes por estado             |
| lots                 | `idx_lots_vendedor`               | `vendedor_id`             | Filtrar lotes por vendedor          |
| lots                 | `idx_lots_verified_status`        | `verified_status`         | Filtrar por estado de verificación  |
| lot_records          | `idx_lot_records_run`             | `cliente_run_normalizado` | Búsqueda/agrupación por RUN         |
| projects             | `idx_projects_estado`             | `estado`                  | Filtrar proyectos activos           |
| projects             | `projects_org_id_idx`             | `organization_id`         | Filtrar proyectos por organización  |
| vendors              | `vendors_org_id_idx`              | `organization_id`         | Filtrar vendedores por organización |
| organization_members | `organization_members_org_id_idx` | `organization_id`         | Listar miembros por organización    |
| geometries           | `idx_geometries_project`          | `project_id`              | Obtener geometrías de proyecto      |
| geometries           | `idx_geometries_lot`              | `lot_id`                  | Filtrar geometrías por lote         |
| geometries           | `idx_geometries_type`             | `geometry_type`           | Filtrar geometrías por tipo         |
| vendor_projects      | `idx_vendor_projects_vendor`      | `vendor_id`               | Encontrar proyectos de vendedor     |
| vendor_projects      | `idx_vendor_projects_project`     | `project_id`              | Obtener vendedores de proyecto      |

---

## 🔗 Foreign Keys (Relaciones)

### Diagrama de Relaciones

```
auth.users
    ├── profiles (1:1)
    ├── organizations (1:N) [created_by]
    ├── organization_members (1:N)
    ├── vendors (1:1) [user_id, opcional]
    └── projects/vendors (1:N) [via owner_id, modo personal]

organizations
    ├── organization_members (1:N)
    ├── projects (1:N)
    └── vendors (1:N)

organization_members
    └── vendors (1:1) [organization_id + user_id]

projects
    ├── lots (1:N)
    ├── geometries (1:N)
    └── vendor_projects (N:N)

lots
    ├── geometries (N:1) [geometry_id]
    ├── lot_records (1:1)
    └── vendors (N:1) [vendedor_id]

lot_records
    └── lots (1:1)

vendor_projects
    └── lots (1:N) [vendedor_id + project_id]
```

### Cascadas

```sql
-- CASCADE: Todas las FKs relacionadas con `projects` tienen ON DELETE CASCADE
-- CASCADE (AUTH): `profiles` e `organization_members` se borran al eliminar el usuario.
-- SET NULL (AUTH): `organizations` y `vendors` se desvinculan pero persisten al eliminar el usuario.
-- RESTRICT (AUTH): `projects` bloquea el borrado del usuario si todavía es dueño de proyectos.
-- Esto permite eliminar un proyecto y limpiar sus datos asociados automáticamente, protegiendo la integridad de proyectos activos.
```

---

## 🔌 Extensiones PostgreSQL Activas

| Extensión              | Versión | Propósito                       |
| ---------------------- | ------- | ------------------------------- |
| **pg_graphql**         | 1.5.11  | API GraphQL automática          |
| **pg_net**             | 0.14.0  | HTTP async (webhooks)           |
| **pg_stat_statements** | 1.10    | Métricas de consultas           |
| **pgcrypto**           | 1.3     | Funciones criptográficas        |
| **pgjwt**              | 0.2.0   | JWT para autenticación Supabase |
| **plpgsql**            | 1.0     | Lenguaje procedural             |
| **supabase_vault**     | 0.3.1   | Vault para secretos             |
| **uuid-ossp**          | 1.1     | Generación de UUIDs             |

_Nota: PostGIS no está instalado pero las geometrías usan JSONB._

---

## ⏱️ Triggers y Automatizaciones

### Triggers Definidos

**Total**: 1 trigger personalizado.

| Trigger                     | Tabla  | Evento        | Propósito                                        |
| --------------------------- | ------ | ------------- | ------------------------------------------------ |
| `lot_records_on_lot_insert` | `lots` | AFTER INSERT  | Crear `lot_records` automáticamente              |
| `trg_guard_legal_fields`    | `lots` | BEFORE UPDATE | Solo `project_admin` puede editar campos legales |

**Recomendaciones**:

1. Agregar trigger para actualizar `updated_at` automáticamente en cambios
2. Validar transiciones de estado (ej: lot.estado puede pasar de 'disponible' → 'reservado' → 'vendido')
3. Crear trigger para mantener integridad: cuando `lot.estado = 'vendido'`, exigir datos mínimos en `lot_records`

---

## 📊 Migraciones Aplicadas

| Versión        | Nombre                              | Fecha      | Propósito                                                                                                    |
| -------------- | ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 20251202143135 | `create_parcela_tables`             | 2025-12-02 | Schema inicial (projects, lots, geometrías básicas)                                                          |
| 20260107170000 | `base_schema`                       | 2026-01-07 | Reconstrucción del schema core y enums                                                                       |
| 20260107170100 | `add_organizations_schema`          | 2026-01-07 | Organizaciones, miembros, columnas y constraints                                                             |
| 20260107170200 | `enforce_vendor_project_assignment` | 2026-01-07 | FK lotes→vendor_projects + índices                                                                           |
| 20260107170300 | `org_rls_policies`                  | 2026-01-07 | RLS por roles y asignaciones                                                                                 |
| 20260107170400 | `handle_new_user`                   | 2026-01-07 | Trigger para crear perfiles automáticamente                                                                  |
| 20260107170500 | `super_admin_profiles`              | 2026-01-07 | Super admin global en `profiles` + políticas                                                                 |
| 20260111151719 | `fix_org_members_rls_recursion`     | 2026-01-11 | Fix recursión en org_members (función `is_org_admin`)                                                        |
| 20260111152120 | `optimize_projects_lots_rls`        | 2026-01-11 | Fix recursión projects/lots (función `is_project_admin`)                                                     |
| 20260111152543 | `fix_projects_select_cycle`         | 2026-01-11 | Fix recursión en SELECT de projects                                                                          |
| 20260111153006 | `fix_geometries_sales_rls`          | 2026-01-11 | Ajustes RLS en geometries (legacy sales)                                                                     |
| 20260111160019 | `fix_lots_update_rls`               | 2026-01-11 | Ajuste RLS update en lots                                                                                    |
| 20260111160824 | `fix_vendor_projects_rls`           | 2026-01-11 | Fix recursión final en vendor_projects/vendors                                                               |
| 20260111164313 | `add_cascade_delete_projects`       | 2026-01-11 | ON DELETE CASCADE para FKs de proyectos                                                                      |
| 20260113141308 | `add_lot_records_and_cleanup_v2`    | 2026-01-13 | Ficha por lote + limpieza de tablas legacy                                                                   |
| 20260113171352 | `add_lot_records_insert_trigger`    | 2026-01-13 | Trigger para crear `lot_records` en nuevos lotes                                                             |
| 20260128154500 | `add_m2_to_lots`                    | 2026-01-28 | Agrega columna m2 a tabla lots                                                                               |
| 20260128195402 | `add_process_stage`                 | 2026-01-28 | Agrega enum ProcessStage y columna etapa_proceso en lot_records                                              |
| 20260129153730 | `fix_lot_records_pk`                | 2026-01-29 | Fix clave primaria en lot_records                                                                            |
| 20260203141322 | `fix_lot_records_constraint`        | 2026-02-03 | Fix constraint en lot_records + ajuste FKs para borrado seguro de usuarios                                   |
| 20260205161249 | `add_dxf_dwg_to_source_type`        | 2026-02-05 | Agrega 'dxf' y 'dwg' al enum source_type                                                                     |
| 20260212215844 | `add_lot_verification_and_guard`    | 2026-02-12 | Módulo Legal: columnas verificación oficial, trigger trg_guard_legal_fields                                  |
| 20260226211504 | `add_servidumbre_ancho_m_to_lots`   | 2026-02-26 | Agrega road_geometry/road_width_m en projects, servidumbre_m2/superficie_neta_m2/servidumbre_ancho_m en lots |

---

## ✅ Checklist de Seguridad

| Aspecto                 | Estado           | Notas                                               |
| ----------------------- | ---------------- | --------------------------------------------------- |
| **Multitenancy**        | ✅ Implementado  | `owner_id`/`organization_id` con exclusión          |
| **RLS**                 | ✅ Activo        | 10 tablas protegidas, roles admin/user              |
| **Auth**                | ✅ Supabase Auth | SSR con cookies                                     |
| **Encriptación**        | ✅ pgcrypto      | Disponible para datos sensibles                     |
| **Auditoría**           | ✅ Completa      | RLS aplicado + limpieza de esquema zombie `plotify` |
| **Validación FK**       | ✅ RESTRICT      | Previene orfandad de datos                          |
| **Índices Performance** | ✅ Optimizados   | Cubiertos filtros comunes                           |

---

## 🚀 Recomendaciones de Mejora

### Críticas

1. **Implementar triggers para `updated_at`**
   - Actualizar automáticamente en cambios

2. **Validar transiciones de estado**
   - CHECK constraints más estrictos para flujos

3. **Auditoría automática**
   - Triggers para poblar `audit_logs`

### Optimizaciones

1. **Índices adicionales**:
   - `lots(geometry_id)` para joins frecuentes
   - `lot_records(cliente_run_normalizado, lot_id)` para reportes por RUN

2. **Particionamiento**:
   - Si `lots` > 1M registros, particionar por `project_id`

3. **Caché**:
   - Implementar vistas materializadas para reportes

### Documentación

1. ✅ Diagrama ER completado
2. ⏳ Documentación de API GraphQL (generada automáticamente)
3. ⏳ Procedimientos almacenados para migraciones de datos

---

## 📝 Notas de Implementación

### Convenciones Seguidas

- **UUID**: Generación automática con `gen_random_uuid()`
- **Timestamps**: `created_at` y `updated_at` en todas las tablas
- **Valores por defecto**: `now()` para timestamps, `'activo'` para estados
- **Enum types**: Nombrados en singular descriptivo (`estado_lote`, `geometry_type`)
- **Foreign Keys**: Nombradas como `tabla_columna_fkey`
- **Índices**: Prefijo `idx_` para índices de performance
- **Modo exclusivo**: `owner_id` XOR `organization_id` en entidades principales
- **Asignaciones**: lotes validados contra `vendor_projects`
- **Super admin**: `profiles.is_super_admin` + `public.is_super_admin()` en RLS

### Patrones de Validación en Aplicación

```typescript
// Ejemplo desde el schema
projects.total_lotes > 0
profiles.username.length >= 3
lots.estado ∈ {'disponible', 'reservado', 'vendido'}
CHECK ((owner_id IS NULL) <> (organization_id IS NULL))
GENERATED (lot_records.saldo)
EXISTS vendor_projects (vendedor_id, project_id)
```

---

**Generado por**: Auditoría Automática de Supabase  
**Última actualización**: 2 de marzo de 2026  
**Estado**: Estable y Sincronizado (Motor Servidumbre v2 — FASE 7 completada)
