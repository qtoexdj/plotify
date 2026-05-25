# Schema General de la Base de Datos

**Tag:** #db #schema
**Relacionado:** [[00 - Home]], [[Arquitectura General]], [[Tablas Core BD]]

---

## Tecnologia

- **Supabase** (PostgreSQL)
- **29 tablas** en schema public
- **~35 foreign keys**
- **~70 politicas RLS** en 21 tablas
- **5 triggers**
- **2 storage buckets**: avatars, documents
- **Extensiones**: pgvector, pgcrypto

## Categorias de tablas

### Core del negocio

- profiles
- organizations
- organization_members
- projects
- lots
- lot_records
- geometries
- vendors
- vendor_projects
- audit_logs
- approval_requests

### Agente IA

- system_prompts
- prompt_versions
- agent_skills
- org_skill_configs
- agent_custom_instructions

### Documentos

- document_blocks
- document_templates
- template_block_items
- generated_documents

### Integraciones MCP

- mcp_connections

## Enums personalizados

- estado_lote: disponible, reservado, vendido
- geometry_type: lot, road, common_area
- source_type: kmz, kml
- sale_state: propuesta, reservado, vendido, cancelado
- org_role: admin, user
- process_stage: espera_firma_reserva, reserva_firmada, espera_firma_escritura, escritura_firmada

## Seguridad

- RLS en 21 tablas con ~70 politicas
- Procedimientos atomicos PL/pgSQL con FOR UPDATE locks
- Vault encryption para credenciales MCP
- Trigger handle_new_user para auto-crear profiles

## Migraciones

27 archivos de migracion que documentan la evolucion del schema.

## Relacionado
- [[Tablas Core BD]] — Tablas principales del negocio
- [[Enums Personalizados]] — Todos los enums
- [[Politicas RLS]] — Seguridad a nivel de fila
- [[Migraciones]] — Historial de cambios al schema