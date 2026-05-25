# Tablas Legacy y Adicionales

**Tag:** #db
**Relacionado:** [[00 - Home]], [[Schema General BD]], [[Tablas Core BD]]

---

## Vision general

Ademas de las 18 tablas documentadas en migraciones CREATE TABLE, existen tablas que fueron creadas via Supabase Dashboard o mecanismos no capturados en archivos de migracion.

---

## Tablas Legacy (base_schema)

Estas tablas existen desde la primera migracion pero tienen documentacion limitada:

### clients

Tabla de clientes/compradores original.

- Datos de contacto de compradores.
- Vinculada a ventas y proyectos de clientes.
- Posiblemente reemplazada por datos en  para el flujo actual.

### sales

Tabla de ventas original.

- Registro de transacciones de venta.
- Posiblemente reemplazada por  + estado de lotes.

### client_projects

Vinculacion cliente-proyecto.

- Que clientes estan interesados o asignados a que proyectos.

---

## Tablas sin migracion explicita

### approval_requests

Solicitudes de aprobacion de reserva.

- Referenciada en TypeScript types y contexto.
- Sin archivo CREATE TABLE en migraciones.
- Creada probablemente via Supabase Dashboard.

### mcp_connections

Conexiones OAuth encriptadas.

- Documentada en nota propia [[Tablas MCP]].
- Sin migracion CREATE TABLE.

### document_blocks, document_templates, template_block_items, generated_documents

Sistema de documentos legales.

- Documentadas en [[Tablas Documentos BD]].
- Sin migracion CREATE TABLE (seed en migracion 25).

---

## Tablas adicionales en database.types.ts

Estas aparecen en los tipos generados pero no tienen documentacion dedicada:

### checkpoint_blobs, checkpoints

Tablas de LangGraph para persistencia de conversaciones.

- Usadas por el checkpointer PostgreSQL del agente IA.
- Almacenan estados de conversacion para el grafo LangGraph.

### dead_letter_queue

Cola de mensajes fallidos del microservicio.

- Almacena jobs de ARQ que fallaron tras 3 reintentos.
- Para revision y re-proceso manual.

### leads

Leads/contactos capturados por el agente IA.

- Datos de personas que interactuaron con el bot.
- Usado por la herramienta .

### notification_subscriptions

Suscripciones de notificacion.

- Config de quienes reciben notificaciones proactivas.

---

## Resumen de las 29+ tablas

| Categoria | Cantidad | Tablas |
|-----------|----------|--------|
| Core negocio | 11 | profiles, orgs, org_members, projects, lots, lot_records, geometries, vendors, vendor_projects, audit_logs, approval_requests |
| Legacy | 3 | clients, sales, client_projects |
| Agente IA | 5 | system_prompts, prompt_versions, agent_skills, org_skill_configs, agent_custom_instructions |
| Documentos | 4 | document_blocks, document_templates, template_block_items, generated_documents |
| MCP | 1 | mcp_connections |
| Infra LangGraph | 3 | checkpoint_blobs, checkpoints, dead_letter_queue |
| Otros | 2 | leads, notification_subscriptions |

## Relacionado
- [[Tablas Core BD]] — Tablas principales
- [[Schema General BD]] — Vista completa del schema