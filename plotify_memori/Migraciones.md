# Migraciones de la Base de Datos

**Tag:** #referencia #db
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Tablas Core BD]]

---

## Vision general

27 archivos de migracion en  que documentan la evolucion completa del schema.

## Cronologia

| # | Migracion | Fecha | Que hizo |
|---|-----------|-------|----------|
| 1 | base_schema | 2026-01-07 | Tablas core: profiles, projects, lots, geometries, clients, vendors, sales, audit_logs |
| 2 | add_organizations | 2026-01-07 | Multi-tenant: organizations, organization_members, org_id en tablas core |
| 3 | vendor_assignment | 2026-01-07 | FK que enforcea que vendor debe estar asignado al proyecto |
| 4 | org_rls_policies | 2026-01-07 | Politicas RLS para aislamiento multi-tenant |
| 5 | handle_new_user | 2026-01-07 | Trigger auto-creacion de profiles al registrarse |
| 6 | super_admin | 2026-01-07 | Flag is_super_admin en profiles |
| 7 | lot_records | 2026-01-13 | Tabla lot_records para datos contractuales |
| 8 | lot_records_trigger | 2026-01-13 | Auto-creacion de lot_record al reservar lote |
| 9 | add_m2_to_lots | 2026-01-28 | Campos m2_utiles, m2_servidumbre en lots |
| 10 | add_process_stage | 2026-01-28 | Enum process_stage para pipeline de venta |
| 11 | fix_user_deletion | 2026-02-02 | Fix CASCADE/RESTRICT en borrado de usuarios |
| 12 | add_lot_verification | 2026-02-12 | verified_status, verified_at, verified_by en lots |
| 13 | add_valor_reserva | 2026-02-18 | Campo valor_reserva en lots |
| 14 | profile_fields_avatar | 2026-03-10 | Campos de perfil + bucket avatars |
| 15 | enable_realtime_lots | 2026-03-13 | Supabase Realtime en tabla lots |
| 16 | fix_org_members_fk | 2026-03-16 | Fix FK de profiles en org_members |
| 17 | add_reserve_lot_rpc | 2026-03-26 | Funcion RPC para reserva atomica |
| 18 | org_id_audit_logs | 2026-03-26 | organization_id en audit_logs |
| 19 | prompt_ops_tables | 2026-03-31 | system_prompts + prompt_versions |
| 20 | agent_skills_tables | 2026-03-31 | agent_skills + org_skill_configs |
| 21 | custom_instructions | 2026-03-31 | agent_custom_instructions |
| 22 | v2_rls_policies | 2026-03-31 | RLS para todas las tablas v2 |
| 23 | seed_prompt_and_skills | 2026-03-31 | Seed data de prompts y skills |
| 24 | seed_new_skills | 2026-03-31 | Skills adicionales |
| 25 | seed_document_blocks | 2026-03-31 | Seed del sistema de bloques de documento |
| 26 | seed_admin_prompt | 2026-03-31 | Seed del prompt de admin |
| 27 | seed_escritura_blocks | 2026-03-31 | Seed de 18 articulos atomicos de escritura |

## Fases de evolucion

### Fase 1 (migraciones 1-6): Schema base
Schema inicial con auth, CRUD basico, y multi-tenant.

### Fase 2 (migraciones 7-13): Datos contractuales
Lot records, stages de venta, verificacion de lotes.

### Fase 3 (migraciones 14-18): Refinamiento
Perfiles, realtime, RPC de reserva, auditoria.

### Fase 4 (migraciones 19-27): Agente IA y Documentos
Prompt ops, skills, documento legal con 18 articulos.

## Relacionado
- [[Schema General BD]] — Estado actual del schema
- [[Tablas Core BD]] — Tablas creadas en las primeras migraciones


## Estado canonico desde 2026-04-14

Ver [[Implementacion Punto 1 - Congelar DB Supabase]].

La cronologia historica anterior queda como contexto, no como fuente activa. La fuente activa de migraciones Supabase ahora es:

packages/database/supabase/migrations

Migraciones canonicas actuales:

- 20260414000100_baseline_local_validated.sql
- 20260414000200_fix_security_definer_search_path.sql
- 20260414000300_add_missing_fk_indexes.sql

Las migraciones antiguas en plotify y plotify_chat fueron eliminadas despues de validar supabase db reset. No crear nuevas migraciones en esas rutas.