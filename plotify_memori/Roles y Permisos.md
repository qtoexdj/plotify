# Roles y Permisos

**Tag:** #producto #seguridad
**Relacionado:** [[Vision y Alcance]], [[Politicas RLS]], [[Flujo de Usuario]]

---

## Tabla de roles

| Rol | Scope | Acceso principal |
|-----|-------|-----------------|
| **Super Admin** | Global | Todas las organizaciones, usuarios, proyectos, audit logs, prompt ops |
| **Organization Admin** | Workspace | CRUD completo dentro de su org: crear proyectos, gestionar vendors, pestanas legales |
| **Organization User (Vendor)** | Workspace limitado | Solo ve proyectos asignados, solo lotes que reservo/vendio, SIN pestana Clientes ni Legal, SIN creacion de proyectos |

## Como se implementa

### En la DB

- `profiles.is_super_admin` — Boolean flag en la tabla profiles.
- `organization_members.org_role` — Enum `'admin' | 'user'` en organization_members.
- **~70 politicas RLS** (Row Level Security) en 21 tablas filtran datos por `organization_id`.

### En el Frontend

- **Route Groups:** `(dashboard)` protegido, `(super-admin)` con guard adicional.
- `src/lib/auth/super-admin.ts` — Guard que verifica `is_super_admin`.
- **Sidebar condicional** — Vendors no ven links de Clientes, Legal, ni creacion de proyectos.

### Flujo de pertenencia

1. Usuario se registra → trigger `handle_new_user` crea `profiles`.
2. Admin de org invita a usuario → se crea `organization_members` con rol.
3. Usuario accede → middleware refresca sesion → RLS filtra por org.

## Notas

- Un usuario puede pertenecer a **multiples organizaciones** con distintos roles.
- El cambio de workspace se hace via **team switcher** en el sidebar.
- Los vendors solo ven lotes con `sale_state` en `'reservado'` o `'vendido'` que ellos hayan gestionado.

## Relacionado
- [[Politicas RLS]] — Detalle tecnico de las politicas de seguridad
- [[Flujo de Usuario]] — Como un usuario navega segun su rol
