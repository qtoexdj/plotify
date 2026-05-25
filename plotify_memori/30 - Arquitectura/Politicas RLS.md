# Politicas RLS (Row Level Security)

**Tag:** #db #seguridad
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Tablas Core BD]], [[Seguridad Backend]]

---

## Vision general

- **~70 politicas** distribuidas en **21 tablas**.
- Todas filtran por `organization_id` vinculado al usuario via `auth.uid()`.
- El microservicio puede bypass RLS usando `service_role_key`.

## Principio base

```sql
-- Ejemplo tipico de politica
CREATE POLICY org_isolation ON lots
  USING (organization_id = (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  ));
```

## Categorias de politicas

### 1. Aislamiento por organizacion

Aplicadas a: projects, lots, geometries, vendors, document_blocks, document_templates, generated_documents, audit_logs, etc.

- SELECT: solo ve datos de su org.
- INSERT: fuerza el org_id del usuario.
- UPDATE/DELETE: solo puede modificar datos de su org.

### 2. Roles dentro de la org

Aplicadas a: organization_members.

- Solo admins pueden gestionar miembros.
- Los users solo pueden leer.

### 3. Super Admin bypass

- Los usuarios con `profiles.is_super_admin = true` tienen politicas que les dan acceso global.

### 4. Tablas publicas

- `profiles`, `organizations` — Lectura limitada.
- `agent_skills` — Catalogo global, lectura publica autenticada.

## Tablas con RLS

21 tablas con politicas activas, incluyendo:
- organizations, organization_members
- projects, lots, lot_records, geometries
- vendors, vendor_projects
- audit_logs, approval_requests
- system_prompts, agent_skills, org_skill_configs
- document_blocks, document_templates, generated_documents
- agent_custom_instructions, mcp_connections

## Tablas sin RLS

- Tablas de catalogo global (agent_skills base).
- Seed data inicial.

## Notas de seguridad

- RLS se aplica incluso al admin de la base de datos si la conexion usa un rol con RLS habilitado.
- El service_role bypass solo debe usarse en el microservicio con supervision.

## Relacionado
- [[Seguridad Backend]] — Como el backend maneja RLS
- [[Roles y Permisos]] — Roles que RLS hace cumple
