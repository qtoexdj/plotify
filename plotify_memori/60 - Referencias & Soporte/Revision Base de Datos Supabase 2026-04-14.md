---
title: Revision Base de Datos Supabase 2026-04-14
date: 2026-04-14
tags:
  - revision
  - db
  - supabase
  - documentos
  - seguridad
  - migraciones
status: draft
---

# Revision Base de Datos Supabase 2026-04-14

> [!summary]
> Revision hecha con MCP `supabase-local`. La DB local esta mas avanzada que las migraciones versionadas: tiene tablas de documentos, bucket `documents`, prompts, skills y funciones aplicadas, pero el repo no contiene todos los archivos de migracion que explican ese estado. Esto es el riesgo mas importante para terminar el proyecto y para moverlo a monorepo.

## Alcance revisado

- Esquema `public`.
- Buckets de `storage`.
- Migraciones aplicadas en `supabase_migrations.schema_migrations`.
- Extensiones instaladas.
- Politicas RLS de documentos, Prompt Ops y MCP.
- Advisors de seguridad y performance de Supabase.
- Contrato real contra codigo en `plotify/` y `plotify_chat/`.

## Estado actual de la DB local

### Tablas principales

La DB local tiene 29 tablas en `public`. Las tablas con datos relevantes son:

| Tabla | Filas |
| --- | ---: |
| `projects` | 1 |
| `lots` | 449 |
| `lot_records` | 449 |
| `geometries` | 937 |
| `audit_logs` | 1 |
| `document_blocks` | 20 |
| `document_templates` | 1 |
| `template_block_items` | 0 |
| `generated_documents` | 0 |
| `system_prompts` | 2 |
| `prompt_versions` | 2 |
| `agent_skills` | 3 |
| `mcp_connections` | 0 |

Lectura:

- El core de lotes y geometria tiene datos reales para probar flujos.
- Documentos esta inicializado a medias: hay bloques y un template, pero no hay bloques asociados al template.
- Prompt Ops tiene dos prompts activos (`admin_intelligence`, `sales_agent`) con una version activa cada uno.
- MCP esta modelado en DB, pero no tiene conexiones configuradas.

### Storage

Buckets encontrados:

| Bucket | Publico | Limite | MIME types |
| --- | --- | ---: | --- |
| `avatars` | si | sin limite visible | sin restriccion visible |
| `project-files` | si | sin limite visible | sin restriccion visible |
| `documents` | no | 10 MB | PDF, DOCX |

Lectura:

- El bucket `documents` existe y esta bien orientado: privado, con limite de 10 MB y MIME types acotados.
- Hay que validar las storage policies versionadas porque varias migraciones aplicadas de storage no estan presentes en los archivos actuales del repo.

### Extensiones

Instaladas:

- `pgcrypto`
- `pgjwt`
- `pg_graphql`
- `supabase_vault`
- `pg_net`
- `uuid-ossp`
- `pg_stat_statements`
- `plpgsql`

Lectura:

- `supabase_vault` y `pgcrypto` calzan con credenciales cifradas para Telegram/MCP.
- PostGIS no esta instalado; hoy la geometria vive en estructuras propias/JSON, no en tipos geoespaciales de Postgres.

## Documentos legales en DB

### Modelo real

Tablas:

- `document_blocks`
- `document_templates`
- `template_block_items`
- `generated_documents`

Constraints relevantes:

- `document_blocks.category` solo permite: `encabezado`, `clausula`, `articulo`, `firma`, `anexo`, `variable`.
- `document_templates.document_type` solo permite: `escritura`, `reserva`, `promesa`, `deslinde`, `otro`.
- `generated_documents.file_format` solo permite: `pdf`, `docx`.
- `template_block_items` tiene `UNIQUE (template_id, position)`.
- `document_blocks` tiene `UNIQUE (organization_id, name)`.

Indices relevantes:

- `idx_doc_blocks_org_category` en `(organization_id, category)`.
- `idx_generated_docs_org` en `(organization_id, created_at desc)`.
- `idx_generated_docs_lot` en `lot_id` cuando no es null.

### Datos actuales

- Hay 20 bloques, todos con categoria `articulo`.
- Hay 1 template llamado `prueba`, tipo `escritura`.
- Hay 0 filas en `template_block_items`.
- Hay 0 documentos generados.

Impacto directo:

- `plotify_chat/services/document_engine.py` falla con `ValueError("Template {template_id} has no blocks")` cuando intenta renderizar el template actual.
- La DB tiene catalogo legal atomico, pero no tiene una plantilla armada lista para generar.
- El constructor de documentos no puede considerarse terminado hasta persistir el orden de bloques en `template_block_items`.

## Contrato DB contra codigo

### Alto: frontend no envia `organization_id` al generador

Evidencia:

- Backend `plotify_chat/api/v1/endpoints/documents.py` exige `organization_id` en `PreviewRequest` y `GenerateRequest`.
- Frontend `plotify/src/lib/services/document-generation.service.ts` define `PreviewRequest` y `GenerateRequest` sin `organization_id`.
- `plotify/src/actions/documents.action.ts` llama al generador solo con `template_id`, `lot_id`, `format` y `generated_by`.

Impacto:

- La generacion real puede fallar con 422 antes de llegar al motor documental.
- Si se corrige solo en frontend sin validacion backend, queda riesgo cross-tenant porque el microservicio usa service role.

Decision recomendada:

- El backend debe derivar y verificar `organization_id` desde `template_id` y `lot_id`, o aceptar `organization_id` solo como dato auxiliar y validarlo contra DB.

### Alto: respuesta esperada no coincide

Evidencia:

- Backend responde `{ file_url, format }`.
- Frontend espera `{ file_url, document_id }`.
- Tabla `generated_documents` si tiene `id`, pero `persist_document` no lo devuelve al endpoint actual.

Impacto:

- La UI puede mostrar exito parcial, pero perder el identificador de auditoria del documento generado.

Decision recomendada:

- Devolver `{ document_id, file_url, format }` desde FastAPI y tiparlo igual en Next.js.

### Alto: variables legales no tienen un contrato unico

Evidencia:

- DB sembrada usa variables con nombres anidados como `vendedor.nombre`, `comprador.rut`, `lote.deslindes`, `matriz.nombre_predio`.
- Backend `resolve_variables()` entrega variables planas como `cliente_nombre`, `cliente_run`, `numero_lote`, `proyecto_comuna`, `org_nombre`.
- El wizard frontend usa `EscrituraVariables` con estructura anidada.

Impacto:

- Un bloque puede renderizar lleno en el preview local y salir vacio/default en PDF/DOCX real, o al reves.
- Esto explica por que el UI/UX de documentos se siente flojo: el modelo mental del usuario, el preview y el generador no comparten una fuente canonica.

Decision recomendada:

- Crear un contrato canonico `DocumentVariables`.
- Usarlo en DB seeds, frontend preview, backend resolver y tests.
- Mantener aliases solo durante migracion, no como modelo permanente.

### Medio: seed local viejo no calza con constraint actual

Evidencia:

- `plotify/supabase/migrations/20260331014000_seed_document_blocks.sql` inserta categorias como `objeto`, `precio`, `servidumbre`, `desistimiento`.
- La DB actual solo acepta `encabezado`, `clausula`, `articulo`, `firma`, `anexo`, `variable`.

Impacto:

- Si alguien llama `seed_default_document_blocks()` contra el esquema actual, la funcion puede fallar por check constraint.
- El seed valido para escritura parece ser el de bloques atomicos `articulo`, no el seed base anterior.

Decision recomendada:

- Deprecar o corregir `seed_default_document_blocks()`.
- Dejar un solo seed soportado para documentos legales.

## Migraciones y drift

### Hallazgo principal

La DB local registra 60 migraciones aplicadas. En los repositorios actuales solo hay 29 archivos `.sql` bajo:

- `plotify/supabase/migrations`
- `plotify_chat/supabase/migrations`

Esto no es solo "faltan archivos"; tambien hay versiones distintas para migraciones equivalentes.

Ejemplos importantes aplicados en DB que no aparecen como archivo con esa version:

- `20260331013014 create_mcp_connections`
- `20260331013051 create_document_tables`
- `20260331013132 create_documents_bucket`
- `20260331012826 vault_setup_and_refactor_telegram`
- `20260331034442 notification_triggers`
- `20260331204746 seed_escritura_blocks`
- `20260330133105 add_project_media_and_docs`
- `20260330134634 fix_storage_policies`
- `20260330134700 security_defined_storage_checks`

Ejemplos presentes en repo pero con version distinta/no aplicada como tal:

- `20260331014000_seed_document_blocks.sql`
- `20260331030000_seed_admin_prompt.sql`
- `20260331050000_seed_escritura_blocks.sql`
- `20260310192937_create_leads_table.sql`
- `20260326160000_add_payment_info_and_dlq.sql`

Impacto:

- Un entorno nuevo creado solo desde el repo puede quedar sin tablas de documentos o sin bucket `documents`.
- Los tipos generados de Supabase pueden diferir segun desde que DB se generen.
- El monorepo puede funcionar, pero primero hay que congelar una fuente unica de migraciones.

Decision recomendada:

- Crear una migracion baseline o recuperar los archivos exactos aplicados.
- Elegir una sola carpeta canonica de migraciones.
- Si se adopta monorepo, mover Supabase a un paquete/carpeta raiz tipo `infra/supabase/migrations`.

## RLS y seguridad

### RLS

Todas las tablas funcionales nuevas de documentos, Prompt Ops, skills, orgs, vendors, lots y leads tienen RLS habilitado. Excepciones visibles sin RLS:

- `checkpoint_blobs`
- `checkpoint_migrations`
- `checkpoint_writes`
- `checkpoints`
- `dead_letter_queue`

Lectura:

- `dead_letter_queue` sin RLS puede ser aceptable si solo la usa service role, pero debe documentarse como tabla interna.
- Las tablas `checkpoint_*` parecen internas de LangGraph/checkpointing; si quedan en `public`, conviene decidir ownership y acceso.

### Advisors de seguridad

Supabase reporta warnings `function_search_path_mutable` en varias funciones. Ejemplos:

- `add_mcp_connection`
- `get_mcp_credentials`
- `encrypt_credential`
- `decrypt_credential`
- `register_telegram_bot`
- `get_decrypted_bot_token`
- `approve_reservation`
- `reject_reservation`
- `seed_escritura_blocks`
- `seed_default_document_blocks`
- `is_org_user`
- `is_project_admin`
- `notify_stage_change`

Riesgo:

- En funciones `SECURITY DEFINER`, un `search_path` no fijo puede abrir superficie de ataque si un objeto malicioso shadowea nombres esperados.

Remediacion:

- Fijar `search_path` explicitamente, por ejemplo `SET search_path = public`.
- Referencia Supabase: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

### Advisors de performance

Supabase reporta tres familias de deuda:

- Foreign keys sin indice.
- Politicas RLS que llaman `auth.<function>()` sin envolver en subselect.
- Multiples politicas permisivas para misma tabla/rol/accion.

Ejemplos de FKs sin indice que afectan documentos:

- `document_blocks.created_by`
- `document_templates.created_by`
- `generated_documents.generated_by`
- `generated_documents.lot_record_id`
- `generated_documents.template_id`
- `template_block_items.block_id`

Referencias Supabase:

- FK sin indice: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- RLS initplan: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- Multiples politicas permisivas: https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

## Monorepo: lectura desde la DB

Mi opinion tecnica: si, puede resultar monorepo, pero no como simple movimiento de carpetas.

Condiciones para que resulte:

- Una sola fuente de migraciones Supabase.
- Contratos compartidos para documentos, prompts, auth interna y tipos de DB.
- Tests de contrato entre Next.js y FastAPI.
- Un ownership claro: frontend consume, microservicio ejecuta IA/documentos, Supabase define verdad transaccional.

Si no se corrige el drift de DB antes, el monorepo solo va a juntar el desorden en una carpeta mas grande.

## PRD recomendado

Si conviene hacer PRD, pero acotado. No un PRD gigante del proyecto completo.

PRDs utiles ahora:

- PRD de Documentos Legales V1.
- PRD de Prompt Ops y Admin Intelligence.
- PRD tecnico de Monorepo y Contratos Compartidos.

Para documentos, el PRD debe cerrar:

- Variables canonicas.
- Flujo de template builder.
- Preview real vs preview local.
- Generacion PDF/DOCX.
- Historial y auditoria.
- UX para ordenar, agrupar y validar articulos.
- Estados de error legibles para datos incompletos.

## Prioridad de cierre

1. Congelar DB: recuperar/baseline de migraciones y definir carpeta canonica.
2. Arreglar contrato documentos: `organization_id`, respuesta `{document_id, file_url, format}` y validacion tenant.
3. Poblar `template_block_items` para al menos una escritura real de prueba.
4. Unificar `DocumentVariables` entre DB, frontend y backend.
5. Corregir funciones con `search_path` mutable.
6. Agregar indices FK de alto uso.
7. Redisenar UI/UX de documentos sobre el flujo real, no sobre un preview local aislado.

## Notas relacionadas

- [[Revision Integral 2026-04-14]]
- [[Riesgos y Brechas Tecnicas]]
- [[Mapa de Integracion Frontend Backend]]
- [[Generacion de Documentos]]
- [[Tablas Documentos BD]]
- [[Politicas RLS]]
- [[Storage Buckets]]
- [[Migraciones]]



## Actualizacion implementada 2026-04-14

El hallazgo de drift de migraciones fue cerrado en [[Implementacion Punto 1 - Congelar DB Supabase]].

Estado actualizado:

- La fuente canonica ahora es packages/database/supabase/migrations.
- El baseline 20260414000100_baseline_local_validated.sql reconstruye el estado aceptado de la DB local.
- Las migraciones 20260414000200 y 20260414000300 cubren search_path mutable e indices FK faltantes.
- Las carpetas antiguas plotify/supabase/migrations y plotify_chat/supabase/migrations fueron removidas despues de validar reset.
- Punto 1 de la prioridad de cierre queda terminado.

Pendiente derivado: decidir como versionar packages/database porque la raiz actual no es repo git.