# Data Model: Hardening de producción del pipeline core

**Feature**: SDD019 · `019-hardening-produccion`
**Database**: Supabase PostgreSQL 17
**Rule**: toda migración se crea con `supabase migration new <name>` y vive solo en `packages/database/supabase/migrations`.

## Design invariants

1. Un identificador enviado por cliente selecciona contexto; sesión + filas persistidas conceden autoridad.
2. Toda mutación crítica y su `audit_logs` se confirman en la misma transacción.
3. Misma idempotency key + mismo request hash devuelve el mismo resultado; hash distinto es conflicto.
4. Proyecto+lotes, importación+features y asignación+superficie base tienen fronteras transaccionales separadas y explícitas.
5. Una feature importada es evidencia canónica; una unión/footprint es un derivado versionado.
6. Una generación automática tiene una huella inmutable única. Una regeneración humana no la suplanta.
7. Ninguna generación entregable existe sin veredicto `passed` ligado a sus bytes exactos.
8. Venta aprobada y obligación de workflow nacen en el mismo commit.
9. Una entrega es única por generación+destinatario+canal; tokens en claro no se persisten.
10. Los datos ambiguos se ponen en cuarentena; no se deduplican ni borran automáticamente.
11. Archivo privado y metadata tienen una identidad server-side única; paths o columnas legacy nunca conceden autoridad.
12. Aprobación jurídica requiere un grant persistido y vigente cuya identidad queda congelada en el veredicto.
13. Una aprobación humana o automática solo se vuelve efectiva al finalizar un intento semántico inmutable contra versiones/hashes aún vigentes.
14. Los tres controles de rollout viven en Supabase, faltante/error significa OFF y ningún flag puede relajar permisos ni reactivar writers legacy.
15. `escritura_firmada` solo puede existir junto a un evento de firma externo, idempotente, evidenciado y auditado del mismo caso.
16. Los owners que crean objetos canónicos tienen default ACL restrictiva por schema/tipo; `PUBLIC`, `anon`, `authenticated` y `service_role` reciben solo grants explícitos por objeto.

## 1. `idempotency_operations` (new)

Registro durable común para web, Mini App, RPC y worker.

| Column                                     | Type          | Rules                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                       | `uuid`        | PK, `gen_random_uuid()`                                                                                                                                                                                                                                                                                                                                                                         |
| `organization_id`                          | `uuid`        | FK organizations, required                                                                                                                                                                                                                                                                                                                                                                      |
| `principal_type`                           | `text`        | enum: `user`, `miniapp`, `service`                                                                                                                                                                                                                                                                                                                                                              |
| `principal_subject`                        | `text`        | UUID o subject estable; nunca display name                                                                                                                                                                                                                                                                                                                                                      |
| `operation_type`                           | `text`        | allowlist versionada: project create/update, file upload/replace/delete, geometry import/assign/unassign/derive/replace/recalculate, capability renew/revoke, sale approve, recipient reassign, `seller_fact_resolve`, `legal_approval_grant`, `legal_approval_revoke`, `matriz_approval_begin`, `matriz_approval_finalize`, minuta generate/regenerate, signature record y rollout control set |
| `resource_scope`                           | `text`        | recurso lógico canónico, sin PII                                                                                                                                                                                                                                                                                                                                                                |
| `idempotency_key`                          | `text`        | 1–128 chars, required                                                                                                                                                                                                                                                                                                                                                                           |
| `request_hash`                             | `text`        | SHA-256 hex de payload normalizado                                                                                                                                                                                                                                                                                                                                                              |
| `status`                                   | `text`        | enum: `processing`, `succeeded`, `failed`                                                                                                                                                                                                                                                                                                                                                       |
| `resource_type`                            | `text`        | nullable hasta completar                                                                                                                                                                                                                                                                                                                                                                        |
| `resource_id`                              | `uuid`        | nullable hasta completar                                                                                                                                                                                                                                                                                                                                                                        |
| `response_summary`                         | `jsonb`       | solo IDs/status/códigos; sin documentos/PII                                                                                                                                                                                                                                                                                                                                                     |
| `error_code`                               | `text`        | estable, nullable                                                                                                                                                                                                                                                                                                                                                                               |
| `source_kind`                              | `text`        | `web \| miniapp \| telegram \| meta \| service`                                                                                                                                                                                                                                                                                                                                                 |
| `provider_event_key`                       | `text`        | nullable; SHA-256 de provider+bot/account+update/message ID, nunca el ID crudo                                                                                                                                                                                                                                                                                                                  |
| `created_at`, `updated_at`, `completed_at` | `timestamptz` | timestamps auditables                                                                                                                                                                                                                                                                                                                                                                           |

**Constraints/indexes**:

```text
UNIQUE (organization_id, principal_type, principal_subject,
        operation_type, resource_scope, idempotency_key)
CHECK request_hash ~ '^[0-9a-f]{64}$'
INDEX (status, updated_at)
UNIQUE (organization_id, source_kind, provider_event_key)
  WHERE provider_event_key IS NOT NULL
```

Una función estrecha reclama la fila bajo lock. `failed` no cambia de hash; una reparación explícita retoma la misma identidad y conserva intentos en audit/outbox. `request_hash` usa RFC 8785/JCS con identificador `jcs-rfc8785-v1`; TS y Python consumen los mismos vectores golden para orden, Unicode, números, null/omisión, fechas y listas. En uploads se canoniza metadata con JCS y se incorpora `sha256(raw_bytes)` como campo, nunca el nombre de archivo como identidad de contenido. Telegram/Meta crean `provider_event_key` en el primer borde autenticado y propagan el mismo `operation_id` por reserva, aprobación, outbox y notificación; un replay después de claim sigue chocando con esta fila y no depende solo de la deduplicación del webhook.

**RLS/grants**: RLS enabled; sin DML directo para `anon/authenticated`. RPCs user-facing validan `auth.uid()` y workspace. `service_role` puede operar con tenant explícito. Admin/superadmin solo ve resumen de su scope a través de API.

## 2. `audit_logs` (extend)

Agregar:

| Column          | Type            | Purpose                                            |
| --------------- | --------------- | -------------------------------------------------- |
| `operation_id`  | `uuid` nullable | FK `idempotency_operations` para legacy-compatible |
| `event_key`     | `text` nullable | clave estable por evento crítico                   |
| `result`        | `text`          | enum: `succeeded`, `denied`, `failed`              |
| `reason_code`   | `text` nullable | código redactado                                   |
| `actor_user_id` | `uuid` nullable | actor humano, sin depender de `actor` libre        |

Índice único parcial `(organization_id, event_key) WHERE event_key IS NOT NULL` evita dos auditorías del mismo evento. La fórmula es `sha256('audit-v1' | organization_id | aggregate_type | aggregate_id | transition_name | transition_version | operation_id)`: un replay de la misma operación conserva clave, mientras una transición legítima nueva incrementa versión y usa otra operación. Los RPCs de proyecto, geometría, venta y roles insertan audit dentro del mismo commit. Intentos denegados usan un `attempt_id` separado sin esa unicidad: con DB disponible, `record_denied_attempt` confirma el evento antes de responder; si la auditoría no está disponible, la autorización sigue fail-closed y un spool/contador local redactado de alta severidad crea un blocker operativo hasta reconciliarlo. Fallar audit nunca habilita la operación.

## 2A. `project_file_objects` (new)

Metadata autoritativa para imágenes, documentos legales y fuentes geográficas privadas.

| Column                                           | Type             | Rules                                                                    |
| ------------------------------------------------ | ---------------- | ------------------------------------------------------------------------ |
| `id`                                             | `uuid`           | PK; único identificador público                                          |
| `organization_id`, `project_id`                  | `uuid`           | FK required, mismo tenant                                                |
| `category`                                       | `text`           | allowlist versionada del contrato de seguridad                           |
| `bucket`, `object_path`                          | `text`           | bucket privado y path canónico server-side, unique                       |
| `source_sha256`, `size_bytes`, `content_type`    | text/bigint/text | bytes verificados                                                        |
| `original_filename`                              | `text`           | sanitizado, solo display                                                 |
| `visibility`                                     | `text`           | enum: `admin_only`, `assigned_project`                                   |
| `bound_escritura_case_id`, `bound_generation_id` | uuid nullable    | requeridos e inmutables para `escritura_signature_evidence`; mismo scope |
| `status`                                         | `text`           | enum: pending, ready, superseded, deleted, repair_required               |
| `replaces_file_id`                               | `uuid` nullable  | self FK, misma categoría/proyecto                                        |
| `retention_class`                                | `text`           | enum: `media`, `legal`, `geometry_source`                                |
| `operation_id`, `created_by`, timestamps         | audit            | required en filas nuevas                                                 |

El gateway crea paths y escribe metadata; clientes nunca envían un path como autoridad. Upload a path determinista + commit de metadata convergen mediante compensación o finding durable. Toda proyección pública conserva solo `fileId`, metadata de display permitida y estado; `bucket`/`object_path` nunca se serializan. Backfill transforma `projects.images`, columnas `doc_*` y `legal_documents` en filas; faltantes, colisiones o paths ambiguos generan findings bloqueantes.

`legal_documents.project_file_object_id` es nullable solo para legacy y obligatorio en el writer nuevo. `commit_project_file_with_reference` confirma `project_file_objects + legal_documents + audit_logs` para categorías legales; si los bytes ya fueron aceptados y falla la referencia, marca `repair_required` y devuelve error, nunca éxito parcial. Para `escritura_signature_evidence`, el gateway deriva y bloquea caso/generación `ready` antes de leer el body, persiste ambos bindings y prohíbe cambiarlos; una evidencia solo puede ser consumida por un signature event. Onboarding/proyecto transportan `fileId`, no arrays de paths ni `ProjectLegalDocumentUploadMetadata`. Un lector compatible sirve columnas legacy solo antes del enforcement; apagar un control de rollout nunca reabre acceso Storage directo. En SDD019 todo delete es lógico/auditado; ninguna `retention_class` ejecuta purga física automática.

## 2B. `legal_approval_grants` (new)

| Column                                    | Type        | Rules                              |
| ----------------------------------------- | ----------- | ---------------------------------- |
| `id`                                      | `uuid`      | PK                                 |
| `organization_id`, `user_id`              | `uuid`      | member activo del mismo tenant     |
| `capability`                              | `text`      | inicialmente `approve_escritura`   |
| `valid_from`, `valid_until`, `revoked_at` | timestamptz | ventana explícita                  |
| `granted_by`, `revoked_by`                | `uuid`      | admins/superadmin autorizados      |
| `reason`, `evidence_ref`                  | text        | requeridos, sin documento sensible |
| `operation_id`, timestamps                | audit       | grant/revoke idempotente           |

Un admin activo puede delegar a otro miembro, nunca auto-otorgarse; el bootstrap de una organización con un solo admin requiere superadmin, razón y auditoría. Revocación afecta nuevas aprobaciones/promociones, no reescribe historia. Cada aprobación captura `legal_approval_grant_id` y su vigencia; preflight convierte aprobaciones legacy sin autoridad demostrable en finding bloqueante, no en grant implícito.

## 2C. `feature_rollout_controls` y `feature_rollout_projects` (new)

Fuente operacional compartida por web, API y worker para los tres controles canónicos:

```text
automatic_escritura | canonical_geometry_import | document_capabilities
```

`feature_rollout_controls`:

| Column                                      | Type           | Rules                                         |
| ------------------------------------------- | -------------- | --------------------------------------------- |
| `id`, `organization_id`                     | uuid           | PK/FK, una fila por org+feature               |
| `feature_key`                               | text           | allowlist exacta                              |
| `mode`                                      | text           | `off \| projects \| on`; default efectivo off |
| `version`                                   | bigint         | compare-and-set, incrementa por cambio        |
| `operation_id`, `updated_by`, `reason`      | audit          | requeridos                                    |
| `created_at`, `updated_at`, `last_audit_id` | timestamptz/id | mutación atómica                              |

Unique `(organization_id, feature_key)`. `feature_rollout_projects` usa PK `(control_id, project_id)` y trigger de mismo tenant. `resolve_feature_rollout(feature, organization, project)` devuelve OFF si falta fila, hay scope inconsistente o error; solo el resolver server-side puede consultarlo y el cliente nunca aporta tenant como autoridad. `set_feature_rollout_control(..., expected_version, reason)` es service-only/release-owner, confirma control+scope+audit en una transacción y rechaza versión stale.

El hard-off server-side usa exactamente:

```text
PLOTIFY_HARD_OFF_AUTOMATIC_ESCRITURA
PLOTIFY_HARD_OFF_CANONICAL_GEOMETRY_IMPORT
PLOTIFY_HARD_OFF_DOCUMENT_CAPABILITIES
PLOTIFY_RELEASE_CONFIG_VERSION
```

Cada booleano faltante/inválido se interpreta `true` (apagado). `runtime_release_attestations` es service-only y conserva `environment_fingerprint`, `deployment_id`, `runtime_role (web|api|worker)`, `slot_id` estable dentro de ese deployment, `instance_id` por encarnación, `release_sha`, `artifact_digest`, `config_version`, los tres booleanos, `hard_off_fingerprint = sha256('hard-off-v1' | config_version | claves/estados ordenados)`, `lifecycle (active|retired)`, `heartbeat_at`, `retired_at`, `retired_by_operation_id` y metadata operativa sin secretos. `artifact_digest` es el SHA-256 inmutable del bundle o imagen realmente cargado por esa instancia, no un tag mutable. PK `(deployment_id, runtime_role, slot_id, instance_id)`; no hay lectura cliente. El manifiesto autenticado identifica el `deployment_id`/revisión actual y su roster exacto de slots+instancias. Reemplazo registra primero una nueva encarnación manifestada y retira la anterior mediante compare-and-set/auditoría; scale-down llama `retire_runtime_slot` antes de excluirlo. Solo filas retiradas o stale de deployments históricos dejan de contar; cualquier fila fresca no retirada del mismo environment, incluso de otro deployment, es un runtime inesperado y bloquea. Un heartbeat posterior a `retired_at` es conflicto bloqueante. El gate exige una fila activa <120 s por cada slot/instancia esperada y ninguna activa extra, igualdad de SHA/config/fingerprint y coincidencia de cada digest. Ausencia, extra, staleness, digest inválido/no esperado, retiro sin audit o discrepancia fuerza los tres controles efectivos OFF y bloquea rollout, aunque una fila persistida diga ON.

Semántica OFF:

- `automatic_escritura`: outbox durable queda diferido sin consumir intento;
- `canonical_geometry_import`: nuevos import/replace devuelven `FEATURE_DISABLED`; lectura existente continúa;
- `document_capabilities`: no emite, renueva ni sirve capacidades; descarga autenticada same-origin sigue segura.

## 2D. `escritura_approval_attempts` (new)

| Column                                                           | Type          | Rules                                        |
| ---------------------------------------------------------------- | ------------- | -------------------------------------------- |
| `id`, `organization_id`, `project_id`, `escritura_case_id`       | uuid          | PK/FKs same tenant                           |
| `matriz_id`, `matriz_version`, `template_id`, `template_version` | uuid/int      | candidato inmutable                          |
| `snapshot_hash`, `evidence_manifest_hash`, `policy_fingerprint`  | text          | required                                     |
| `legal_approval_grant_id`                                        | uuid          | vigente al begin y finalize                  |
| `origin`, `requested_by`                                         | text/uuid     | `human \| system`; system actor nullable     |
| `operation_id`                                                   | uuid          | idempotency FK, unique                       |
| `status`                                                         | text          | `validating \| failed \| stale \| finalized` |
| `semantic_validation_id`, `approval_decision_id`                 | uuid nullable | se ligan al finalizar                        |
| timestamps                                                       | timestamptz   | begin/validated/finalized                    |

`begin_matriz_approval` bloquea la matriz, valida estado/grant/policy y crea el intento sin mutar `matriz.status`. `finalize_matriz_approval` bloquea intento+matriz+grant, exige PASS y los mismos hashes/versiones y confirma `legal_review_decision + semantic binding + matriz approved + audit` en un commit. Si cambia cualquier fuente marca `stale`/`409 APPROVAL_CANDIDATE_STALE`; una falla semántica deja `failed`/`422 DOCUMENT_SEMANTIC_INVALID` y cero aprobación.

## 2E. Versioned runtime security artifacts (new)

Estos artefactos son fuente versionada revisable y sus snapshots generados son evidencia; no son listas manuales de conteo:

| Artifact                                       | Key/identity                                | Required fields                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `privileged-http-surfaces.classification.json` | method+route/symbol+runtime                 | callsite hash, callers, trusted principal, resource→tenant, business role, service capability, audit, idempotency and negative test IDs          |
| `runtime-egress-surfaces.classification.json`  | runtime+symbol/callsite hash                | scheme/host/path/redirect allowlist, data/secret class, total timeout, transaction boundary, retry/idempotency, redaction and test IDs           |
| `structured-log-policy.json`                   | logger/sink+symbol                          | allowed fields, prohibited PII/secret/body/stack fields, redaction rule, severity, retention and capture test IDs                                |
| `runtime-config.schema.json`                   | schema version+environment class            | exact required secrets/endpoints, HTTPS/host allowlist, prohibited blank/default/placeholder patterns and browser-exposure classification        |
| `evidence-archive.schema.json`                 | run ID+release SHA+evidence-manifest digest | immutable locator, archive digest, source/report/deployment hashes, provenance, readback timestamp, retention-until and redaction-policy version |

Los generadores derivan el universo desde código/catálogo y exigen igualdad exacta contra la clasificación: missing, stale, duplicate o callsite desconocido falla. Los snapshots contienen hashes y metadata redactada, nunca secretos, URLs firmadas, bodies, PII o texto documental. El archivo de evidencia final debe ser recuperable por locator y revalidable contra su digest durante al menos 365 días.

## 3. `geometry_imports` (new)

| Column                                                 | Type            | Rules                                            |
| ------------------------------------------------------ | --------------- | ------------------------------------------------ |
| `id`                                                   | `uuid`          | PK                                               |
| `organization_id`, `project_id`                        | `uuid`          | FK required, scope validado                      |
| `source_file_id`                                       | `uuid`          | FK `project_file_objects`, geometry_source ready |
| `operation_id`                                         | `uuid`          | FK `idempotency_operations`, unique              |
| `source_sha256`                                        | `text`          | hash de bytes fuente                             |
| `normalized_sha256`                                    | `text`          | hash del conjunto normalizado                    |
| `original_filename`                                    | `text`          | nombre sanitizado, solo display                  |
| `source_format`                                        | `text`          | enum: `kmz`, `kml`                               |
| `status`                                               | `text`          | enum: committed, superseded, quarantined         |
| `feature_count`, `coordinate_count`, `zip_entry_count` | `integer`       | non-negative                                     |
| `compressed_bytes`, `expanded_bytes`                   | `bigint`        | non-negative                                     |
| `limits_snapshot`                                      | `jsonb`         | versión y límites usados                         |
| `replaced_by_id`                                       | `uuid` nullable | self FK                                          |
| `created_by`, `created_at`, `superseded_at`            | actor/time      | audit                                            |

**Constraints/indexes**:

- index `(project_id, source_sha256) WHERE status='committed'` para buscar/replayar contenido activo sin imponer unicidad histórica redundante;
- unique `(project_id) WHERE status='committed'`: el producto conserva exactamente una importación fuente activa por proyecto y todo cambio usa reemplazo explícito;
- `replaced_by_id` solo cuando `status='superseded'`;
- RLS admin/superadmin; vendedor asignado puede `SELECT` resumen, nunca DML.

La deduplicación global de bytes vive en el objeto fuente inmutable de `project_file_objects`, no en la historia versionada de `geometry_imports`. Si el contenido ya es el import activo, la misma operación devuelve esa versión. Si fue superseded, un reemplazo posterior puede crear una nueva fila de importación que reutiliza el mismo `source_file_id`; así A→B→A conserva tres versiones y dos enlaces `replaced_by_id` sin reactivar ni reescribir historia.

## 4. `geometries` (extend)

Agregar:

| Column                 | Type                      | Rules                                         |
| ---------------------- | ------------------------- | --------------------------------------------- |
| `geometry_import_id`   | `uuid` nullable legacy    | FK `geometry_imports`                         |
| `source_feature_index` | `integer` nullable legacy | posición canónica                             |
| `source_feature_hash`  | `text` nullable legacy    | hash GeoJSON normalizado                      |
| `canonical_state`      | `text`                    | active/superseded/quarantined; default active |
| `area_m2`              | `numeric` nullable        | cálculo base persistido                       |

**Constraints/indexes**:

```text
UNIQUE (geometry_import_id, source_feature_index)
UNIQUE (lot_id) WHERE lot_id IS NOT NULL AND canonical_state = 'active'
CHECK ((lot_id IS NULL AND is_assigned IN (true,false)) OR
       (lot_id IS NOT NULL AND is_assigned = true))
```

Para filas nuevas KMZ/KML, import/index/hash son obligatorios por trigger/función; legacy nullable se clasifica antes. La identidad canónica es `(geometry_import_id, source_feature_index)`, no el hash: dos features con geometría idéntica pero rol/propiedades distintos pueden conservarse como evidencia separada. Un duplicado exacto de geometría **y** propiedades se detecta antes del commit, deja la importación `quarantined` con `GEOMETRY_DUPLICATE_FEATURE` y no se deduplica silenciosamente. La unicidad parcial de `lot_id` permite conservar vínculos históricos `superseded/quarantined` y complementa `lots.geometry_id`; la función transaccional confirma que ambas referencias activas apuntan a la misma fila/proyecto.

`geometry_assignment_history` conserva, por reemplazo, `organization_id`, `project_id`, `old_import_id`, `old_geometry_id`, `lot_id`, hashes fuente, snapshot de superficie, `replacement_operation_id` y timestamp. La transacción de reemplazo captura estas filas antes de poner la fuente vieja `superseded` y nulificar ambas referencias activas; la nueva importación queda sin asignar y bloquea readiness hasta reconciliación explícita.

## 5. `project_geometry_derivations` y `project_geometry_derivation_sources` (new)

La unión de líneas/polígonos para camino o área común no consume geometrías canónicas. `project_road_segments` conserva lectura compatible mediante `derivation_id`/vista mientras migra el código.

`project_geometry_derivations` contiene `organization_id`, `project_id`, `derivation_type (road | common_area)`, geometría derivada, `source_set_hash`, `config_hash`, `derivation_version`, status `pending | ready | failed | superseded`, causa/timestamps y audit.

`project_geometry_derivation_sources`:

| Column                | Type      | Rules                        |
| --------------------- | --------- | ---------------------------- |
| `derivation_id`       | `uuid`    | FK, cascade, PK compound     |
| `geometry_id`         | `uuid`    | FK `geometries`, PK compound |
| `source_order`        | `integer` | required                     |
| `source_feature_hash` | `text`    | copia de control             |

Trigger valida mismo proyecto y geometrías canónicas activas. Unique `(project_id, derivation_type, source_set_hash, config_hash, derivation_version)`.

## 5A. `geometry_enrichment_jobs` (new)

Obligación durable creada en el mismo commit que asignación o derivación:

| Column                                             | Type          | Rules                                                          |
| -------------------------------------------------- | ------------- | -------------------------------------------------------------- |
| `id`, `organization_id`, `project_id`              | uuid          | PK/FK tenant scope                                             |
| `lot_id`, `geometry_id`, `derivation_id`           | uuid nullable | recurso exacto                                                 |
| `kind`                                             | text          | enum: servidumbre, deslindes, derived_metrics                  |
| `job_fingerprint`                                  | text          | unique                                                         |
| `status`                                           | text          | pending/processing/retry_scheduled/ready/dead_letter/cancelled |
| `attempt_count`, `max_attempts`                    | int           | 0/8 default                                                    |
| `available_at`, `lease_expires_at`, `heartbeat_at` | timestamptz   | claim/recovery                                                 |
| `last_error_code`, `next_retry_at`                 | text/time     | redactado/visible                                              |
| timestamps                                         | timestamptz   | audit                                                          |

`job_fingerprint = sha256('geometry-enrichment-v1' | kind | organization_id | project_id | lot_id-or-derivation_id | source_hash | derivation_version)`. RPC service-only usa claim/lease/heartbeat; el worker reanuda y la UI muestra intentos/causa/acción. `ready` es requisito documental.

## 6. RPCs transaccionales de proyecto/geometría

No son tablas, pero definen la única ruta de escritura:

- `create_project_with_lots(p_active_org, p_operation_key, p_request_hash, p_project, p_lots)`;
- `commit_geometry_import(p_active_org, p_operation_key, p_request_hash, p_import, p_features)`;
- `assign_project_geometry(p_active_org, p_operation_key, p_request_hash, p_geometry_id, p_lot_id)`;
- `commit_project_infrastructure(p_active_org, p_operation_key, p_request_hash, p_source_geometry_ids, p_config)`;
- `supersede_geometry_import(...)` invalida derivados y readiness, nunca borra fuente.

Preferencia `SECURITY INVOKER`. Si una operación necesita `SECURITY DEFINER`, usa `SET search_path=''`, nombres calificados, grants mínimos y valida `auth.uid()`/tenant dentro de la función. Todas bloquean recursos con `FOR UPDATE` y escriben `idempotency_operations + audit_logs` en el mismo commit.

## 6A. Comparecientes vendedores estructurados

No requiere una tabla nueva: amplía el catálogo/versionado de resoluciones legales con `vendedor.comparecientes[]`, proyectado desde `titulo.propietarios[]`. Cada elemento conserva:

```json
{
  "personId": "uuid",
  "tratamiento": { "value": "Doña", "state": "approved", "evidenceRef": "uuid" },
  "nombre": { "value": "...", "state": "approved", "evidenceRef": "uuid" },
  "rut": { "value": "...", "state": "approved", "evidenceRef": "uuid" },
  "nacionalidad": { "value": null, "state": "missing", "evidenceRef": null },
  "estadoCivil": { "value": "...", "state": "approved", "evidenceRef": "uuid" },
  "profesionGiro": { "value": "...", "state": "approved", "evidenceRef": "uuid" },
  "domicilio": { "value": "...", "state": "approved", "evidenceRef": "uuid" }
}
```

`personId` es estable y nunca deriva del índice/nombre visible. El ingestor conserva el subject ID upstream cuando existe; en su ausencia crea una vez un UUID persistido y lo reconcilia en reanálisis mediante un hash HMAC server-side de la identidad documental normalizada (por ejemplo RUT) o una referencia de sujeto evidenciada. Si no hay match inequívoco, crea un finding/manual match; nunca reenumera por orden. Cada campo estructurado conserva además `resolutionId`, `version`, `legalApprovalGrantId`, `attestationRef`, `reason`, `reviewedBy/At` y evidencia hash en la versión de resolución legal subyacente. El endpoint usa `personId + field + expectedVersion`; toda corrección inserta nueva versión/audit y vuelve stale cualquier approval attempt abierto.

Nacionalidad, estado civil y tratamiento nunca se infieren. La fuente documental conserva person ID, path de propietario, resolution ID y evidence hash. Una corrección manual requiere actor con grant jurídico vigente, razón, attestation/referencia, `reviewed_by/at` y nueva versión. El snapshot/manifiesto conserva cada estado; si un campo requerido está `missing`, `titulo.comparecencia_vendedor_texto` no puede quedar `resolved` ni formar parte de una aprobación. El texto interno opcional se marca diagnóstico y nunca contiene `[NACIONALIDAD]` u otro filler.

## 7. `escritura_semantic_validations` (new)

| Column                                               | Type            | Rules                                                                        |
| ---------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `id`                                                 | `uuid`          | PK                                                                           |
| `organization_id`, `project_id`, `escritura_case_id` | `uuid`          | required FKs                                                                 |
| `matriz_id`, `matriz_version`                        | id/int          | required                                                                     |
| `template_id`, `template_version`                    | id/int          | required                                                                     |
| `snapshot_hash`                                      | `text`          | required                                                                     |
| `resolved_content_hash`                              | `text`          | AST final normalizado                                                        |
| `artifact_sha256`                                    | `text`          | bytes DOCX exactos                                                           |
| `approval_attempt_id`                                | uuid            | FK al candidato que se validó                                                |
| `approval_id`, `evidence_manifest_hash`              | uuid/text       | `approval_id` admite solo binding único NULL→id durante finalize + evidencia |
| `provenance_manifest_hash`                           | `text`          | snapshot+AST+matriz+template+renderer                                        |
| `renderer_version`, `ruleset_version`                | `text`          | required                                                                     |
| `status`                                             | `text`          | enum: `passed`, `failed`                                                     |
| `issues`                                             | `jsonb`         | array tipado, sin PII documental completa                                    |
| `validation_origin`                                  | `text`          | approval, generation or historical revalidation                              |
| `validated_by`                                       | `uuid` nullable | system => null                                                               |
| `validated_at`                                       | `timestamptz`   | required                                                                     |

**Issue schema**:

```json
{
  "code": "SEM_FACT_MISMATCH",
  "severity": "blocking",
  "clause_key": "comparecencia",
  "path": "vendedor.comparecientes[personId=<uuid>].nacionalidad",
  "evidence_ref": "legal_variable:<uuid>",
  "message_key": "semantic.fact_mismatch"
}
```

No se guarda el texto legal completo en `issues`. Índice por case/date y unique de `(artifact_sha256, ruleset_version, renderer_version, provenance_manifest_hash, approval_attempt_id)` dentro del mismo scope permite replay solo de una validación con idéntica procedencia. Un PASS técnico permanece no promovible mientras `approval_id IS NULL`; `finalize_matriz_approval` es la única rutina que puede hacer el binding único `NULL → approval_id` en el mismo commit que inserta la aprobación y cambia la matriz. Un trigger rechaza cambio posterior, segundo binding o modificación de cualquier hash/resultado/issues; el binding pasa a formar parte del envelope inmutable. Después de ese binding nunca se reutiliza un PASS tras cambiar/revocar aprobación o evidencia. Un PASS promovible exige hashes de evidencia/procedencia no nulos, capacidad jurídica vigente y coincidencia comprobada entre snapshot, AST/manifiesto, matriz/template versionados y bytes. La vigencia se revalida al generar y entregar. Una inspección histórica sin esa cadena registra `SEM_PROVENANCE_INCOMPLETE` y la generación permanece `unverified` aunque no encuentre defectos textuales.

RLS: grant holders/admin projection/superadmin ven según scope; vendedor solo recibe el estado agregado de su propia generación; DML solo API/worker.

## 8. `escritura_minuta_generations` (extend)

Agregar:

| Column                   | Type                      | Rules                                   |
| ------------------------ | ------------------------- | --------------------------------------- |
| `semantic_validation_id` | `uuid` nullable legacy    | FK validation `passed`                  |
| `generation_fingerprint` | `text` nullable legacy    | SHA-256 natural key                     |
| `generation_mode`        | `text`                    | automatic/manual; legacy default manual |
| `operation_id`           | `uuid` nullable legacy    | FK idempotency                          |
| `regeneration_reason`    | `text` nullable           | required para manual nueva              |
| `template_version`       | `integer` nullable legacy | version inmutable                       |
| `renderer_version`       | `text` nullable legacy    | audit                                   |
| `artifact_sha256`        | `text` nullable legacy    | debe coincidir validation/content       |
| `readiness_status`       | `text`                    | unverified/ready; legacy unverified     |

**Constraints**:

- fingerprint automático `sha256('minuta-generation-v2' | organization_id | case_id | snapshot_hash | matriz_id/version | template_id/version | renderer_version | ruleset_version | schema_version | normalization_version | approval_id | provenance_manifest_hash | review_policy_fingerprint)`;
- unique parcial `generation_fingerprint WHERE generation_mode='automatic'`;
- para manual nuevas, `operation_id` y `regeneration_reason` son `NOT NULL`; unique parcial `operation_id WHERE generation_mode='manual'`;
- para nuevas filas `ready`: validation no nula/status passed, hashes coincidentes y Storage path determinista;
- trigger scope existente se amplía a template/snapshot/validation.

No se insertan generaciones inválidas. Los intentos fallidos viven en validation/outbox/cascade/audit.

`storage_path` es interno y nunca forma parte de DTO, redirect ni log público. La identidad externa es `generation_id`; lectura autenticada o por capability resuelve generation→objeto dentro del gateway y, si necesita una URL Storage de ≤60 s, la consume server-side.

## 9. `workflow_outbox` (new)

| Column                                            | Type          | Rules                                                                                   |
| ------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| `id`                                              | `uuid`        | PK                                                                                      |
| `organization_id`                                 | `uuid`        | FK required                                                                             |
| `aggregate_type`, `aggregate_id`                  | text/uuid     | `sale_approval`, approval id                                                            |
| `event_type`                                      | `text`        | `sale_approved` inicialmente                                                            |
| `event_fingerprint`                               | `text`        | unique                                                                                  |
| `operation_id`                                    | `uuid`        | FK idempotency                                                                          |
| `payload`                                         | `jsonb`       | IDs/versiones + recipient snapshot, sin comprador/PII                                   |
| `status`                                          | `text`        | pending/deferred_feature_off/processing/retry_scheduled/completed/dead_letter/cancelled |
| `attempt_count`, `max_attempts`                   | int           | default 0/8                                                                             |
| `available_at`                                    | timestamptz   | schedule                                                                                |
| `lease_owner`, `lease_expires_at`, `heartbeat_at` | nullable      | claim                                                                                   |
| `deferred_reason`, `deferred_control_fingerprint` | text nullable | solo códigos/hash; nunca config ni PII                                                  |
| `last_error_code`, `last_error_class`             | text nullable | redactado                                                                               |
| `created_at`, `updated_at`, `completed_at`        | time          | audit                                                                                   |

`event_fingerprint = sha256('outbox-v1' | event_type | organization_id | approval_request_id | approved_transition_version)`. Un replay de la misma transición conserva huella; una reversa/nueva aprobación incrementa `approved_transition_version` y crea un evento legítimo distinto. Unique `event_fingerprint`; index `(status, available_at)` y `(lease_expires_at) WHERE status='processing'`. Claim/defer/release/complete son RPC service-only y usan DB time. Payload se valida contra schema y queda inmutable tras creación.

El claim resuelve `automatic_escritura` dentro de la misma transacción y antes de otorgar lease. Si falta, falla o resuelve OFF/hard-off, la fila debida pasa atómicamente a `deferred_feature_off`, conserva `attempt_count`, deja lease/heartbeat nulos, registra solo razón/fingerprint y mueve `available_at` a un backoff acotado para evitar hot-loop. Al volver elegible, un wakeup/CAS la retorna a `pending` sin crear otra obligación. El worker revalida después del claim y antes de iniciar el intento: si el control cambió, `release_workflow_outbox_for_feature_off` libera lease/heartbeat y difiere sin incrementar intento ni DLQ. `attempt_count` aumenta únicamente al comenzar el primer efecto del intento después de esa segunda validación.

RLS: sin acceso anon/authenticated. Admin ve proyección redactada mediante API; solo service role/worker reclama.

## 9A. `worker_job_failures` (new)

Registro durable para jobs ARQ generales que no están respaldados por `workflow_outbox`.

| Column                                             | Type          | Rules                                                                    |
| -------------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| `id`, `operation_id`                               | uuid          | PK; operación/idempotencia requerida                                     |
| `queue_name`, `task_name`, `job_id`                | text          | identificadores operativos sin payload; unique `(queue_name, job_id)`    |
| `payload_fingerprint`, `error_code`, `error_class` | text          | hashes/códigos redactados; nunca body, teléfono, chat, documento o stack |
| `status`                                           | text          | `retry_scheduled \| dead_letter \| resolved`                             |
| `attempt_count`, `max_attempts`, `next_attempt_at` | int/int/time  | backoff acotado y observable                                             |
| `first_failed_at`, `last_failed_at`, `resolved_at` | timestamptz   | historia durable                                                         |
| `resolution_operation_id`, `last_audit_id`         | uuid nullable | reparación idempotente/auditada                                          |

El wrapper común de jobs clasifica cada excepción. Una falla transitoria persiste/actualiza la fila y lanza `arq.Retry` con backoff; una falla terminal o el último intento persiste `dead_letter` y alerta. `on_job_end` solo observa el resultado explícito entregado por ARQ y nunca lee campos de éxito inventados del `ctx`; una excepción ordinaria no puede terminar como completed ni desaparecer. Los jobs respaldados por `workflow_outbox` conservan el outbox como autoridad y no duplican estado en esta tabla.

## 10. `escritura_cascade_runs` (extend)

Agregar `workflow_outbox_id`, `attempt_number`, `generation_fingerprint`, `delivery_state`, `started_at`, `finished_at`, `last_error_code`.

Outcomes válidos:

```text
awaiting_review | exception | document_ready |
delivery_pending | partial_delivery | completed | dead_letter
```

`completed` se aplica solo si semántica passed + generation ready + web requerida available. Una corrida por `(workflow_outbox_id, attempt_number)`. El historial no se sobreescribe.

## 11. `escritura_deliveries` (extend)

Agregar:

| Column                                         | Type                 | Rules                                                                 |
| ---------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `recipient_role`                               | `text`               | enum: sale_vendor, organization_admin                                 |
| `required`                                     | `boolean`            | web vendedor true; secundarios false                                  |
| `operation_id`                                 | `uuid`               | FK idempotency/outbox operation                                       |
| `active_capability_id`                         | `uuid` nullable      | FK diferida a la emisión activa; null cuando no existe acceso actual  |
| `delivery_status`                              | `text`               | pending/retry_scheduled/available/sent/failed/unavailable/cancelled   |
| `capability_status`                            | `text`               | proyección actual `none/active/expired/revoked`; no guarda renovación |
| `available_at`, `sent_at`, `first_accessed_at` | timestamptz nullable | historia separada de acceso actual                                    |
| `attempt_count`                                | `integer`            | default 0                                                             |
| `last_attempt_at`, `next_attempt_at`           | timestamptz nullable | retry                                                                 |
| `last_error_code`, `last_error_class`          | text nullable        | redactado                                                             |
| `updated_at`                                   | timestamptz          | required                                                              |

La obligación y la capacidad son ejes distintos. Web pasa a `available` cuando el documento queda disponible por la ruta autenticada same-origin o, solo con `document_capabilities` efectivo, por una capacidad válida; Telegram pasa a `sent` cuando el proveedor acepta. Expirar/revocar un token cambia `capability_status` pero no borra `available_at/sent_at/first_accessed_at` ni convierte historia en fracaso. La UI muestra link expirado y renovación; el agregado histórico permanece completo si la obligación requerida fue satisfecha, mientras disponibilidad actual se muestra separada.

**Constraints**:

```text
UNIQUE (generation_id, recipient_user_id, channel)
CHECK (recipient_user_id IS NOT NULL) -- filas nuevas
CHECK (
  (capability_status = 'none' AND active_capability_id IS NULL)
  OR
  (capability_status = 'active' AND active_capability_id IS NOT NULL)
  OR
  (capability_status IN ('expired','revoked') AND active_capability_id IS NULL)
)
```

`link_token` legacy deja de leerse solo después de una transición auditada: con los controles/hard-off todavía OFF, inventariar links vigentes y destinatarios, verificar para cada destinatario acceso autenticado same-origin al mismo artefacto y recién entonces revocar el link antiguo y nulificarlo. Casos sin destinatario activo inequívoco o sin reemplazo autenticado comprobable quedan como finding bloqueante; no se rompen silenciosamente ni se emite una capacidad para sortear el OFF. Tras un GO, T121 puede habilitar `document_capabilities` y emitir una capacidad hash nueva mediante el flujo normal, nunca durante el cutover pre-enforcement. El endpoint compara hash constant-time, revalida membresía/asignación y transmite bytes server-side; una URL Storage de 60 s puede usarse internamente pero nunca se expone al cliente.

Las proyecciones públicas excluyen `link_token`, `storage_path`, bucket y toda URL Storage. Solo exponen delivery/generation IDs, ejes de estado y una ruta Plotify same-origin. Telegram y Mini App reciben esa ruta/capability o un estado no disponible; nunca captions/JSON con signed URL.

## 11A. `escritura_delivery_capabilities` (new)

Cada emisión/renovación es una fila inmutable; la obligación apunta como máximo a una activa.

| Column                                     | Type                  | Rules                                                        |
| ------------------------------------------ | --------------------- | ------------------------------------------------------------ |
| `id`, `delivery_id`, `operation_id`        | uuid                  | PK/FKs; emisión idempotente                                  |
| `token_hash`                               | text                  | SHA-256 contextual del token; unique global; nunca plaintext |
| `status`                                   | text                  | `active \| expired \| revoked \| rotated`                    |
| `issued_at`, `expires_at`                  | timestamptz           | `expires_at > issued_at` y `<= issued_at + 7 days`           |
| `revoked_at`, `rotated_to_id`              | timestamptz/uuid null | una rotación enlaza la nueva fila; no reactiva la previa     |
| `issued_by`, `revoked_by`, `last_audit_id` | uuid nullable         | actor/service y auditoría                                    |
| `created_at`                               | timestamptz           | inmutable                                                    |

```text
UNIQUE (token_hash)
UNIQUE (delivery_id) WHERE status = 'active'
CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '7 days')
```

El servidor obtiene exactamente 32 bytes de un CSPRNG, codifica base64url sin padding, devuelve el plaintext una sola vez y persiste solo el hash contextual. `renew_delivery_capability` bloquea la entrega y la fila activa, crea otro token/row con `issued_at=DB now()`, marca la anterior `rotated`+`rotated_to_id`, cambia `active_capability_id` y escribe audit en una transacción. Dos renovaciones concurrentes con distinta operación dejan una sola activa; replay posterior devuelve IDs/status y `CAPABILITY_TOKEN_ALREADY_CONSUMED`, sin volver a revelar plaintext; una nueva operation key rota otra vez. El token previo falla inmediatamente. Renovar reinicia el TTL desde la nueva emisión, no desde `delivery.created_at`; `renewed` es un evento/historia, no un estado de acceso actual.

## 12. Estado comercial y venta (extend existing)

### `approval_requests`

- backfill determinista de `idempotency_key` legacy desde su ID, luego `NOT NULL`;
- unicidad autoritativa `(organization_id, vendor_id, idempotency_key)`;
- agregar `request_hash` y `operation_id` para conflicto/replay;
- `approve_sale` usa exactamente esa fila para snapshot del vendedor.
- si el vendedor de la solicitud no tiene `vendors.user_id` vinculado y activo, la aprobación se rechaza antes del commit con `VENDOR_USER_LINK_REQUIRED`; legacy ambiguo produce finding y nunca una entrega con destinatario nulo.

### `lots` y `lot_records`

- `approve_sale` actualiza `lots.updated_at`;
- venta aprobada deja `lot_records.etapa_proceso='espera_firma_escritura'`;
- `escritura_firmada` requiere evento de firma auditable (`firma_fecha`, actor/evidencia); no se deriva de generación o delivery;
- preflight convierte casos históricos inequívocos sin evidencia a finding; no inventa fecha/firma.

### Recipient snapshot

El payload inmutable de `workflow_outbox` contiene:

```json
{
  "approval_request_id": "uuid",
  "sale_vendor_user_id": "uuid",
  "admin_user_ids": ["uuid"],
  "channels": {
    "vendor_web_required": true,
    "vendor_telegram_configured": true,
    "admin_telegram_user_ids": ["uuid"]
  }
}
```

Un cambio de membresía no reescribe el snapshot: revoca/cancela la obligación afectada y exige reasignación explícita auditada.

## 12A. `escritura_signature_events` (new)

| Column                                                               | Type        | Rules                                                                      |
| -------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `id`, `organization_id`, `project_id`, `lot_id`, `escritura_case_id` | uuid        | PK/FKs same tenant                                                         |
| `generation_id`                                                      | uuid        | FK `ready` con semantic PASS vigente                                       |
| `signed_at`                                                          | timestamptz | fecha declarada no futura                                                  |
| `evidence_file_id`, `evidence_sha256`                                | uuid/text   | objeto ready, categoría y bindings exactos de caso/generación; file unique |
| `recorded_by`                                                        | uuid        | actor autenticado/activo derivado                                          |
| `operation_id`, `request_hash`                                       | uuid/text   | idempotencia, unique                                                       |
| `created_at`                                                         | timestamptz | evento inmutable                                                           |

Unique `(escritura_case_id, generation_id)`, `evidence_file_id` y `operation_id`. `record_escritura_signature` valida actor, etapa `espera_firma_escritura`, generation/validation y que la evidencia esté ligada inmutablemente al mismo caso+generación y no haya sido consumida; bloquea evidencia+caso+lote y confirma evento, `lot_records.etapa_proceso='escritura_firmada'`, resultado idempotente y audit en una transacción. Un trigger impide escribir la etapa firmada sin evento correspondiente. Replays idénticos devuelven el evento; payload distinto o reuso de evidencia produce conflicto estable. El evento registra una firma ocurrida fuera de Plotify y no ejecuta firma electrónica.

## 13. `production_readiness_findings` (new)

| Column                                                     | Type               | Rules                                                                                                |
| ---------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `id`                                                       | uuid               | PK                                                                                                   |
| `fingerprint`                                              | text               | unique, estable por query/resource                                                                   |
| `organization_id`                                          | uuid nullable      | FK si aplica                                                                                         |
| `kind`                                                     | text               | duplicate_geometry, null_idempotency, duplicate_generation, false_signed_stage, orphan_storage, etc. |
| `severity`                                                 | text               | enum: blocking, warning                                                                              |
| `resource_type`, `resource_id`                             | text/uuid nullable | no PII                                                                                               |
| `details`                                                  | jsonb              | IDs/conteos/códigos redactados                                                                       |
| `status`                                                   | text               | enum: open, resolved, false_positive                                                                 |
| `owner`, `impact`, `budget`, `resolution`, `review_due_at` | audit              | required al cerrar/aceptar warning/advisor                                                           |
| timestamps                                                 | timestamptz        | detected/resolved                                                                                    |

Un `blocking/open` impide GO. `false_positive` solo aplica a scanner/advisor demostrable; nunca a cross-tenant, corrupción, drift, secreto activo o invalidez documental.

## 14. Storage object path conventions

```text
project-files/{project_id}/{category}/{content_hash}-{safe_name}
project-files/{project_id}/geometry_source/{content_hash}-{safe_name}
documents/{organization_id}/escritura-minutas/{case_id}/{generation_fingerprint}.docx
```

- path no concede acceso;
- nombre original se guarda solo como metadata sanitizada;
- upload proyecto usa content hash e idempotencia; DB failure elimina o deja una reparación durable identificable;
- generación usa path determinista y solo se vuelve visible tras commit de generación `ready`;
- deletes/replacements son acciones server-side auditadas.

## 15. State transitions

```text
idempotency:  processing -> succeeded
                         -> failed -> processing (repair explícito, mismo hash)

geometry import: committed -> superseded
                            -> quarantined

semantic validation: [attempt] -> failed | passed[approval_id=NULL] -> passed[approval_id=id]
                                      (única mutación: NULL->id dentro de finalize; envelope luego inmutable)
approval attempt: validating -> failed | stale | finalized
historical readiness: unverified -> ready           (solo con procedencia completa + bytes coincidentes)

outbox: pending/retry_scheduled -> deferred_feature_off -> pending
                     \-> processing -> completed
                           |-> retry_scheduled
                           |-> deferred_feature_off (flip antes del primer efecto; lease libre, mismo attempt_count)
                           |-> dead_letter
                           |-> cancelled

delivery obligation: pending -> available | sent
                              -> retry_scheduled -> available | sent | failed
                              -> unavailable | cancelled
capability access: none -> active -> expired | revoked
                   active -> rotated -> active (new issuance row)

rollout control: off -> projects -> on
                    \-> off (kill switch CAS + audit)

sale stage: espera_firma_escritura -> escritura_firmada
            (solo al insertar signature event + audit en el mismo commit)

finding: open -> resolved | false_positive
```

No se permite transición desde `ready`, `passed` ya ligado o `completed` que reescriba historia. `passed[approval_id=NULL] → passed[approval_id=id]` es un binding único, no una revalidación: solo completa `approval_id` dentro de `finalize_matriz_approval`, conserva resultado/hashes/issues y luego queda protegido por trigger. Cambios de fuente crean nuevas versiones y marcan lo anterior como histórico/no vigente.

## 16. RLS and grant matrix

| Entity                       | anon                                | authenticated vendor                             | authenticated admin                        | superadmin        | service_role             |
| ---------------------------- | ----------------------------------- | ------------------------------------------------ | ------------------------------------------ | ----------------- | ------------------------ |
| private Storage objects      | none (capability gateway only)      | none direct                                      | none direct                                | none direct       | server gateway           |
| avatars                      | known-object read; no list/mutation | known-object read + own mutation; no global list | no blanket list; own/admin projection only | audited repair    | repair only              |
| project file metadata        | none                                | assigned visible projection only                 | own org via gateway                        | audited           | full with tenant check   |
| legal approval grants        | none                                | own active grant                                 | org grant/revoke API                       | audited/bootstrap | validate/mutate          |
| approval attempts            | none                                | aggregate own case only                          | own org/legal API                          | audited           | validate/finalize        |
| rollout controls             | none                                | none                                             | read aggregate only                        | audited           | resolve/set via RPC      |
| runtime release attestations | none                                | none                                             | none                                       | fingerprint only  | service-only heartbeat   |
| idempotency operations       | none                                | RPC own only                                     | RPC own/org                                | API audited       | full with tenant check   |
| geometry imports/features    | none                                | select assigned project inventory                | CRUD own org via RPC                       | audited           | full with tenant check   |
| geometry enrichment jobs     | none                                | project status projection                        | own org retry view                         | audited           | claim/mutate             |
| semantic validations         | none                                | aggregate own generation                         | select own org/legal                       | audited           | insert/select            |
| outbox                       | none                                | none                                             | redacted projection                        | redacted/audited  | claim/mutate             |
| deliveries                   | capability endpoint only            | own sale rows                                    | own org                                    | audited           | mutate/retry             |
| signature events             | none                                | own-sale aggregate only                          | own org record/view                        | audited           | record with tenant check |
| readiness findings           | none                                | none                                             | own org projection                         | all               | detect/mutate            |

`service_role` bypass RLS no elimina la validación de tenant en API/worker. Los tests pgTAP impersonan roles reales y prueban operaciones positivas/negativas, no solo presencia de policies.

El inventario de operaciones privilegiadas es evidencia derivada, no autoridad editable: firmas descubiertas desde catálogo/ACL/triggers/policies deben igualar exactamente la clasificación versionada. Toda migración que crea o reemplaza una rutina actualiza `definitionHash`, `grantFingerprint`, `searchPath` e `introducedByMigration`; el enforcement contra el proyecto cloud linked falla por firma desconocida, duplicada u obsoleta.

## 17. Migration and legacy sequence

1. **Preflight read-only**: producir conteos/fingerprints; no DDL ni deletes.
2. **History reconciliation hard gate**: con aprobación humana, respaldo y comparación exacta de DDL, reparar primero la versión remota faltante y volver a listar/comparar. Ninguna migración SDD019 se aplica al target linked mientras exista drift.
3. **Foundation**: tablas operations/findings/rollout controls/runtime attestations, columnas audit, funciones de claim/resolución de flags, grants mínimos; estado efectivo inicial OFF.
4. **Security/Storage additive compatibility**: file metadata/backfill, capability fields, helper fixes and tenant-safe policies that preserve old readers; feature flags off, no final direct-access revoke.
5. **Semantic/legal authority**: grants, approval attempts, comparecientes estructurados, validations, schema v2/template, generation columns; históricos `unverified`.
6. **Project/geometry**: import/source/history/derivation/enrichment tables and RPCs; backfill determinista; findings ambiguos; constraints only with zero blockers.
7. **Workflow**: outbox/delivery/capability axes, signature events/RPC/guard; `approve_sale` creates event and fixes stage/timestamps sin afirmar firma.
8. **Types/contracts**: regenerate DB types and both OpenAPI/web client outputs.
9. **Compatible code deploy**: deploy gateway/readers/workers with all controls OFF and smoke safe degraded behavior before final revoke; OFF never restores direct Storage or old writers.
10. **Capability transition**: con backup, plan fingerprint y controles/hard-off OFF, verificar reemplazo autenticado same-origin para cada destinatario activo; revocar legacy y solo entonces dejar de leer/nulificar `link_token`. No se emite/stagea una capacidad hash pre-GO; destinatario ambiguo/inactivo o sin reemplazo comprobable bloquea enforcement.
11. **Security enforcement migration**: create/apply `20260713000600_sdd019_security_enforcement.sql`, remove direct policies/broad grants and repeat linked assertions.
12. **Final privileged diff**: regenerate classification after every SDD019 routine and require exact canonical-source/linked-cloud catalog+grant equality.
13. **Restore rehearsal**: después de crear `00600`, reconstruir un target descartable desde todas las migraciones canónicas `00100`–`00600` + seed, ejercer forward-fix/rollback y comparar schema. La evidencia final se refresca sobre el SHA candidato exacto; un ensayo anterior a `00600` es solo diagnóstico y no satisface SC-014.

## 18. Rollback / forward-fix

- Todas las columnas/tablas nuevas son aditivas; los lectores compatibles seguros siguen funcionando mientras los controles estén OFF. Los writers inseguros no son un fallback permitido.
- Antes de revocar policies/grants se despliega el gateway y se prueba con control OFF; rollback de activación pausa el writer/capability o difiere el outbox, nunca restaura Storage directo, signed URLs ni `/api/uploads/geometry`. En producción, una fuga potencial implica mantener default-deny y forward-fix, no reabrir políticas amplias.
- Constraints nuevas se aplican después del preflight; si un dato inesperado aparece, se desactiva el writer nuevo y se crea finding/forward-fix. No se elimina el constraint para aceptar corrupción silenciosa.
- Cambios de etapa conservan audit y no inventan firma.
- El restore ensayado documenta RTO, versión de backup y comandos; el gate jamás ejecuta restore sobre el proyecto objetivo.
