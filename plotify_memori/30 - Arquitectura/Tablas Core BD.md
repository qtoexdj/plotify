# Tablas Core de la Base de Datos

**Tag:** #db
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Procedimientos Atomicos]]

---

## profiles

Usuarios del sistema. Vinculada a auth.users via trigger.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK, referencia auth.users |
| is_super_admin | bool | Flag de admin global |
| email, nombre, avatar_url | text | Datos del perfil |

## organizations

Workspaces/empresas (multitenancy).

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| name | text | Nombre de la org |
| slug | text | Identificador unico |

## organization_members

Membresia usuario-org con roles.

| Campo | Tipo | Notas |
|-------|------|-------|
| org_id | uuid | FK -> organizations |
| user_id | uuid | FK -> profiles |
| org_role | enum | admin / user |

## projects

Proyectos de loteo.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK -> organizations |
| name, location, sag_data | text | Datos del proyecto |

## lots

Lotes individuales dentro de proyectos.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK -> projects |
| numero_lote | text | Identificador |
| estado | enum | disponible, reservado, vendido |
| sale_state | enum | propuesta, reservado, vendido, cancelado |
| process_stage | enum | etapa del proceso de venta |
| m2_utiles, m2_servidumbre | numeric | Areas calculadas |
| verified_status | enum | estado de verificacion |
| valor_reserva | numeric | Precio de reserva |

## lot_records

Ficha 1:1 por lote reservado/vendido. Datos contractuales.

| Campo | Tipo | Notas |
|-------|------|-------|
| lot_id | uuid | PK, FK -> lots |
| comprador_nombre, rut, contacto | text | Datos del comprador |
| documentos_pendientes | jsonb | Lista de docs pendientes |
| estado_cbr | text | Estado Conservador de Bienes Raices |
| gastos, comision | numeric | Gastos y comision del vendedor |

## geometries

GeoJSON de poligonos (lotes, caminos, areas comunes).

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK -> projects |
| geometry_type | enum | lot, road, common_area |
| source_type | enum | kmz, kml |
| geojson | jsonb | Geometria completa |
| assigned_lot_id | uuid | FK nullable -> lots |

## vendors

Vendedores/agentes de venta.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK -> organizations |
| nombre, contacto, plataforma | text | Datos del vendedor |

## vendor_projects

Asignacion vendedor-proyecto.

| Campo | Tipo | Notas |
|-------|------|-------|
| vendor_id | uuid | FK -> vendors |
| project_id | uuid | FK -> projects |

## audit_logs

Trail de auditoria.

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK -> organizations |
| action, entity_type, entity_id | text | Que paso |
| user_id | uuid | Quien lo hizo |
| created_at | timestamptz | Cuando |

## Relacionado
- [[Procedimientos Atomicos]] — reserve_lot, direct_sale_lot
- [[Politicas RLS]] — Como se protege cada tabla
