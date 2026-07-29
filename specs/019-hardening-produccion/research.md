# Research: Hardening de producción del pipeline core

**Feature**: SDD019 · `019-hardening-produccion`
**Date**: 2026-07-13
**Current verdict**: **NO-GO** hasta implementar y verificar este SDD.

## Fuentes y método

La investigación contrastó cuatro fuentes, en este orden de autoridad:

1. esquema y políticas del proyecto Supabase conectado, consultados de solo lectura mediante MCP;
2. código real y relaciones CodeGraph (`status`: 701 archivos, 11.114 nodos, 29.398 edges);
3. `plotify_memori/` sin `.obsidian`, especialmente ADR-002, ADR-005, ADR-006 y ADR-009;
4. specs SDD010/011/016/017/018 y documentación oficial vigente de Supabase.

Hallazgos base del 2026-07-13:

- La auditoría histórica del proyecto Free observó 31 migraciones SQL locales frente a 30 versiones en su historial remoto; esa cuenta queda solo para verificación no mutante y no define el historial del proyecto final.
- 83 avisos de seguridad: 39 funciones `SECURITY DEFINER` ejecutables por `anon`, 39 por `authenticated`, tres `search_path` mutables, listado público de avatars y protección de passwords filtrados desactivada;
- 558 avisos de performance: 50 FKs sin índice, 33 `auth_rls_initplan`, 31 índices sin uso y 444 políticas permisivas múltiples;
- políticas de `project-files` que permiten leer a cualquier autenticado y gestionar a miembros de cualquier organización, sin comprobar el proyecto de la ruta;
- ausencia de unicidad para geometría activa por lote y generación automática por huella;
- upload geográfico antes de una frontera auth/recursos adecuada, duplicación al asignar y mutaciones best-effort;
- DOCX real con placeholder y fragmentos `salvo ,`, `salvo .`, `será .`, además de cláusula duplicada;
- la nacionalidad/estado civil/tratamiento existen evidenciados en `titulo.propietarios[]`, pero no llegan al catálogo `vendedor`; el prompt fabrica `[NACIONALIDAD]` y la aprobación actual puede ocultarlo;
- hook venta→escritura best-effort, carreras de generación/entrega y `completed` aunque una entrega falle;
- respuestas de generación, delivery, Mini App y el generador documental legacy que todavía materializan URLs Storage firmadas, además de onboarding/registro legal que propagan paths cliente;
- gates de rollout que nombran tres kill switches y dos stages sin implementación/registro canónico;
- `SheetContent` inferior cuya variante `h-auto` gana sobre alturas locales y deja acciones fuera del viewport.

La documentación oficial confirma que RLS y grants son controles separados, que buckets privados dependen de políticas sobre `storage.objects`, que `supabase test db` ejecuta pgTAP y que el historial se debe reconciliar antes de desplegar. Además, Supabase anunció que tablas y funciones nuevas dejan de exponerse automáticamente y requieren grants explícitos, con aplicación a proyectos existentes en 2026: [breaking change de Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [securing your API](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [migrations](https://supabase.com/docs/guides/deployment/database-migrations), [database testing](https://supabase.com/docs/guides/database/testing) y [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

## D1 — El workspace es selección, nunca autoridad

**Decision**: Web mantiene una selección explícita `active_organization_id` en contexto server-side; Mini App la incorpora al emitir su sesión. Toda ruta vuelve a comprobar `user_id + organization_id + rol/asignación + recurso`. Si falta contexto o hay más de una membresía posible, responde `WORKSPACE_REQUIRED`; nunca usa `.limit(1)` ni “la membresía más reciente”.

**Rationale**: `getActiveWorkspace()` y varias rutas actuales escogen una membresía arbitraria. Eso contradice ADR-006 y vuelve no determinista el aislamiento cuando una persona pertenece a dos organizaciones.

**Alternatives rejected**:

- prohibir múltiples membresías: rompe una capacidad válida del modelo y no corrige rutas existentes;
- confiar en `organization_id` del body/header: sirve para seleccionar, pero jamás como autorización;
- inferir siempre desde el recurso: no basta para listados sin recurso previo.

## D2 — Storage privado detrás de un gateway único

**Decision**: clientes browser no llaman `storage.from(...).upload/remove/createSignedUrl` para archivos privados. Las rutas server-side autentican antes de leer body, resuelven workspace/recurso, validan rol/asignación y usan service client solo después. `storage.objects` queda default-deny para `anon/authenticated` en buckets privados.

El inventario de corte incluye imágenes y documentos de onboarding, `legal_documents`, `generated_documents`, historial/listado de minutas, delivery/list/renew, captions Telegram y `evidencia_url` de Mini App. Escrituras nuevas intercambian `fileId`, `generationId` o `deliveryId`; `bucket`, `storage_path`, `object_path` y hosts Storage son internos. El gateway de archivo legal confirma `project_file_objects + legal_documents + audit` o devuelve fallo y finding reparable; `Promise.allSettled` nunca convierte una referencia fallida en éxito del proyecto.

Lectura autenticada usa `/api/files/{fileId}` y deriva bucket/path/tenant del objeto persistido, nunca del URL cliente. Lectura compartible usa un token aleatorio de 256 bits cuyo hash se guarda en DB; autoriza un único `generation_id`, máximo siete días, revalida acceso del destinatario y transmite bytes server-side. Una URL Storage interna dura como máximo 60 segundos y nunca se devuelve al cliente. Revocación, expiración o pérdida de membresía/asignación bloquean toda solicitud posterior.

**Rationale**: el helper `can_read_project_files` existe, pero las políticas reales no lo usan. Centralizar elimina rutas directas divergentes en onboarding y documents-tab.

**Alternatives rejected**:

- mantener políticas amplias y confiar en rutas “difíciles de adivinar”: las rutas no son una frontera de seguridad;
- URL firmada de siete días enviada directamente: no se puede revocar ni revalidar membresía;
- exigir login para todo: elimina el contrato vigente de compartir con capacidad limitada.

## D3 — Privilegios explícitos y esquema no expuesto

**Decision**: clasificar cada función como `trigger-only`, `RLS helper`, `user RPC` o `service-only`. El universo no es un conteo escrito a mano: se deriva de `pg_proc`, ACLs, funciones usadas por triggers y helpers referenciados por políticas. El inventario conserva firma canónica, `definitionHash`, `grantFingerprint`, `searchPath` y migración introductora; se genera al inicio y otra vez después de todas las migraciones, con igualdad exacta y cero filas faltantes/obsoletas.

- `trigger-only`: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`; solo el trigger la ejecuta.
- `RLS helper`: vive en esquema `private`, `SECURITY DEFINER SET search_path=''`, parámetros calificados y grant mínimo al rol que la política necesita.
- `user RPC`: preferir `SECURITY INVOKER`; si requiere definer, deriva actor/tenant desde `auth.uid()` y recursos, fija search path y tiene tests negativos.
- `service-only`: grant exclusivo a `service_role`, además de validación explícita de tenant en API/worker.

También se fijan `ALTER DEFAULT PRIVILEGES FOR ROLE <owner> IN SCHEMA <schema>` para que nuevos objetos no reaparezcan expuestos. El inventario descubre los owners que realmente crean objetos canónicos —como mínimo el rol de migraciones `postgres`— y registra `pg_default_acl` para tablas, secuencias y funciones en cada schema de aplicación. Los defaults revocan DML/uso/execute a `anon`, `authenticated`, `service_role` y `PUBLIC` según el tipo; cada objeto obtiene después grants explícitos según su consumidor. pgTAP crea y elimina probes transaccionales como el mismo owner para demostrar el privilegio efectivo, no solo la presencia textual de una fila de catálogo.

**Rationale**: corregir solo los tres `search_path` warnings dejaría 78 grants explotables. RLS no sustituye `EXECUTE`.

**Alternatives rejected**:

- revocar todas las funciones sin clasificación: rompería políticas/triggers;
- mantener helpers en `public`: aumenta superficie de Data API;
- permitir `authenticated` y validar solo en frontend: no es una frontera.

## D4 — Idempotencia común con request fingerprint

**Decision**: `idempotency_operations` usa scope `(organization, principal, operation_type, resource_scope, idempotency_key)` y `request_hash` RFC 8785/JCS versionado, con vectores golden comunes TS/Python; uploads incorporan el hash de bytes a metadata canónica. Misma clave + mismo hash devuelve el status/resource/response redactada; misma clave + hash distinto devuelve `409 IDEMPOTENCY_CONFLICT`. Las operaciones que producen recursos legales/comerciales se retienen mientras el recurso exista; no expiran automáticamente.

La clave se crea en el borde original y se propaga sin reemplazo por web, Telegram/Mini App, RPC, outbox y worker.

**Rationale**: constraints actuales son parciales y algunas claves pueden ser nulas. La idempotencia solo por “buscar si existe” tiene carrera.

**Alternatives rejected**:

- claves independientes por capa: un replay cambia de identidad al cruzar servicios;
- conservar solo una respuesta en Redis: se pierde al reiniciar y no audita;
- aceptar misma clave con payload distinto: oculta errores del cliente.

## D5 — Features importadas canónicas; uniones derivadas

**Decision**: `commit_geometry_import` preserva los bytes fuente mediante `project_file_objects` y persiste una importación con exactamente una `geometries` por feature normalizada. La identidad fuente es `(geometry_import_id, feature_index)` más `source_feature_hash`. Asignar actualiza la fila existente; no inserta otra. Una infraestructura `road | common_area` vive como derivación genérica versionada con IDs/hashes de features fuente.

`assign_project_geometry` bloquea lote y geometría y confirma `geometries.lot_id/is_assigned`, `lots.geometry_id/m2`, hashes, timestamps, audit log y una obligación `geometry_enrichment_jobs` en un commit. Servidumbre/deslindes se recalculan por worker con lease, intentos, próxima ejecución y DLQ.

**Rationale**: el upload actual inserta features y `saveAndAssignGeometry` vuelve a insertarlas. El UI también combina features, por lo que la fuente y la vista derivada deben ser entidades distintas.

**Alternatives rejected**:

- parse-only y guardar recién al asignar: pierde la importación íntegra y dificulta conteo/replay;
- reemplazar varias features por una unión: destruye evidencia de origen;
- rollback manual TypeScript: no protege contra crash ni concurrencia.

## D6 — Límites KMZ/KML y abuso autenticado

**Decision**: baseline configurable del piloto:

| Recurso                      |                    Baseline inicial |
| ---------------------------- | ----------------------------------: |
| body comprimido              |                              20 MiB |
| total expandido              |                             100 MiB |
| entradas ZIP                 |                                 100 |
| ratio por entrada            |                                20:1 |
| features                     |                               2.000 |
| posiciones coordenadas       |                             250.000 |
| profundidad XML              |                                  64 |
| nodos XML                    |                             500.000 |
| texto XML acumulado          |                               8 MiB |
| deadline parse/normalización |                                10 s |
| concurrencia                 |     1 por actor, 2 por organización |
| tasa                         | 10 intentos por organización/10 min |

Se rechaza antes de persistir con códigos específicos. Load tests deben confirmar memoria/latencia; `thresholds.json` puede bajar valores en producción sin cambiar el contrato, pero elevarlos exige evidencia.

**Rationale**: límites solo de bytes comprimidos no detienen zip bombs, XML excesivo ni muchas cargas concurrentes.

**Alternatives rejected**:

- un único límite de 20 MB: ignora expansión y complejidad;
- parsear completo y medir después: el daño de recursos ya ocurrió;
- confiar en rate limit global: un actor legítimo puede agotar un worker.

## D7 — Validación semántica en dos capas y schema v2

**Decision**: introducir `optional_phrase` inline en schema v2. Contiene texto/tokens que se conservan u omiten juntos según una condición; v1 se migra sin mutar versiones publicadas.

La fuente canónica de comparecientes vendedores es `titulo.propietarios[]`, que se proyecta a `vendedor.comparecientes[]` conservando por persona `tratamiento`, nombre, RUT, nacionalidad, estado civil, profesión/giro, domicilio y referencias de evidencia. El agente puede proponer hechos evidenciados o `null`, pero no placeholders. Si falta un campo requerido, el resolver persiste un gap `missing`; `titulo.comparecencia_vendedor_texto` puede existir como diagnóstico interno, pero la versión aprobable solo se materializa determinísticamente cuando los hechos requeridos están resueltos o existe resolución manual jurídica trazable.

El gate ejecuta:

1. validación del AST resuelto: tokens, faltantes, bloques, facts/evidencia y duplicación estructural;
2. render temporal + extracción de bytes DOCX: placeholders, filler, puntuación/conectores, duplicados normalizados y correspondencia de hashes.

El veredicto persiste matriz/template y versiones, snapshot, `resolved_content_hash`, `artifact_sha256`, renderer/ruleset e issues. Solo `passed` se enlaza a generación entregable.

Antes de aprobar, `begin_matriz_approval` crea un intento inmutable en estado `validating` sin cambiar la matriz. API y pipeline automático resuelven/renderizan temporalmente y validan contra ese intento. `finalize_matriz_approval` bloquea matriz/intento/grant, exige que versiones/hashes/policy no cambiaron y confirma aprobación, binding del PASS y auditoría en una transacción; un candidato stale devuelve `409` y un defecto semántico `422`, dejando la matriz sin aprobar. Los caminos humano y `_system_approve_matriz` comparten exactamente este servicio.

**Rationale**: los contadores actuales solo conocen tokens; `legal_title_block_check` puede eliminar el placeholder antes de comprobar facts y `not_applicable` se vuelve string vacío. Validar solo AST no observa el DOCX real.

**Alternatives rejected**:

- regex sobre DOCX únicamente: no sabe qué evidencia debía respaldar un hecho;
- corregir la golden template sin cambiar el modelo: reaparecerá en otra cláusula;
- considerar `not_applicable` como vacío inline: conserva conectores huérfanos.

## D8 — Artefacto determinista y semántica histórica

**Decision**: huella automática autoritativa:

```text
sha256('minuta-generation-v2' | organization_id | case_id | snapshot_hash |
       matriz_id/version | template_id/version | renderer_version |
       ruleset_version | schema_version | normalization_version |
       approval_id | provenance_manifest_hash | review_policy_fingerprint)
```

La ruta Storage deriva de esa huella. Reintentos escriben la misma ruta; un índice parcial garantiza una generación automática por huella. Regeneraciones humanas requieren operación/motivo y crean otra fila.

Históricos sin `semantic_validation_id` quedan `unverified`. Una inspección de bytes puede detectar defectos, pero solo una cadena reconstruible de snapshot, AST/manifiesto, matriz/template, renderer/ruleset, evidencia y aprobación original permite `passed`; regenerar no sobrescribe ni “valida” retrospectivamente el artefacto anterior.

**Rationale**: el código actual busca por org+case+snapshot, el spec previo mencionaba claves distintas y el upload antecede a la fila DB.

**Alternatives rejected**:

- UUID/fecha aleatoria en path: produce huérfanos indistinguibles;
- unicidad solo por caso+snapshot: ignora cambios de molde/template;
- sobrescribir una generación histórica: rompe auditoría legal.

## D9 — Outbox transaccional, ARQ como ejecutor

**Decision**: `approve_sale` bloquea la solicitud/lote, aplica estado comercial, auditoría e inserta `workflow_outbox` en un commit. No llama FastAPI/Telegram dentro de la transacción.

Worker DB lease: 60 s; heartbeat 15 s; ocho intentos; backoff `5s, 15s, 30s, 60s, 120s, 300s, 900s, 1800s`; errores de validación/tenant son terminales, red/5xx/timeouts son reintentables. El RPC resuelve `automatic_escritura` antes de `FOR UPDATE SKIP LOCKED`: OFF/hard-off mueve a `deferred_feature_off` sin lease ni intento y con `available_at` acotado. El worker revalida después del claim y antes del primer efecto; un flip libera/difiere sin incrementar intento o DLQ. ARQ despierta y paraleliza, pero Postgres conserva identidad/estado y el retorno a ON reanuda la misma fila.

**Rationale**: el hook actual ocurre después del RPC y captura la excepción. Un proceso puede morir entre aprobación y enqueue.

**Alternatives rejected**:

- transacción distribuida con Telegram: inviable y viola timeout/locks;
- confiar solo en job Redis: no nace atómicamente con la venta;
- retry infinito: oculta poison messages y no ofrece reparación.

## D10 — Destinatarios congelados y cuatro ejes de estado

**Decision**: el payload outbox congela el vendedor de la `approval_request` aprobada y todos los admins activos al commit. Nunca resuelve “la venta más reciente”. La obligación web del vendedor es requerida; Telegram del vendedor y notificaciones admin solo se crean si están configuradas y son secundarias. Pérdida de acceso revoca y marca la obligación; reasignar exige acción auditada.

Estados separados:

- semántica: `unverified | failed | passed`;
- generación: `pending | rendering | ready | failed`;
- entrega agregada: `pending | partial | complete | failed | cancelled`.
- capability actual: `none | active | expired | revoked`; una renovación es una emisión nueva rotada, sin borrar disponibilidad/acceso históricos.

`completed` requiere semántica `passed`, generación `ready` y web requerida `available`. Telegram fallido da `partial`, no vuelve inválido el DOCX. Expirar el link no deshace la evidencia histórica; muestra renovación separada.

**Rationale**: hoy `completed` se escribe aun si delivery cae en `catch`; destinatarios varían entre reintentos.

**Alternatives rejected**:

- recalcular destinatarios en cada retry: puede enviar a personas distintas;
- bloquear disponibilidad web por Telegram: hace a un canal secundario autoridad legal;
- un único status: confunde documento válido con mensaje enviado.

## D11 — Legacy: backfill determinista y cuarentena

**Decision**: un preflight read-only clasifica duplicados, claves nulas, generaciones/entregas repetidas, `escritura_firmada` sin evento, timestamps incoherentes y Storage huérfano.

- correcciones unívocas: backfill en migración con audit log y conteos esperados;
- conflictos: fila `production_readiness_findings(status='open')`, sin borrar/fusionar;
- constraints `NOT NULL/UNIQUE` se activan solo cuando su query preflight devuelve cero blockers.

**Rationale**: imponer unicidad directamente puede fallar o escoger arbitrariamente una fila legal/comercial.

**Alternatives rejected**:

- conservar todo como legacy aceptado: los caminos nuevos seguirían chocando;
- `DELETE DISTINCT` automático: destruye evidencia;
- resolver a mano sin registro: no es reproducible.

## D12 — `Sheet` compartido con WCAG 2.2 AA

**Decision**: el primitivo expone un contrato de tamaño/scroll; `header` y `footer` no encogen, el cuerpo es el único scroll, safe area aplicada y foco nunca queda oculto. Todos los `Sheet` tienen title+description programáticos, Escape y orden lógico. Controles táctiles usan mínimo 44×44 CSS px; una excepción compacta no táctil queda documentada, espaciada y nunca baja de 24×24.

Matriz: 320×568, 375×667, 769×880, desktop, 200% zoom, teclado y VoiceOver. Playwright comprueba bounding boxes, scroll y consola; axe cubre reglas automáticas; la prueba humana cubre lectura/foco.

**Rationale**: la especificidad de `data-[side=bottom]:h-auto` afecta OperationsTable, sidebar, editor legal, lots-tab, visor y mesa.

**Alternatives rejected**:

- parches locales `!important`: mantienen divergencia en otros consumidores;
- scroll de panel completo + cuerpo: crea dos scrolls y oculta acciones;
- solo screenshot desktop: no verifica foco ni semántica.

## D13 — Gate reproducible y drift cero

**Decision**: `verify:production-readiness` genera JSON + Markdown redactados y ejecuta el registry único de doce etapas, en este orden: `preflight`, `migration_parity`, `legacy_inventory`, `security`, `database_tests`, `api_contracts`, `web_quality`, `concurrency_recovery`, `browser_a11y`, `restore_rehearsal`, `live_smoke`, `verdict`. No existen aliases por agrupación; cualquier otro nombre termina con error de configuración. `--no-destructive` es default.

No dispensables: historias P1, drift, secretos activos, critical/high reachable, cross-tenant, documento semántico, integridad/idempotencia, outbox recovery y restore. Solo P2 no crítico puede tener waiver con dueño, expiración y rollback.

Gitleaks queda versionado y usa sus comandos actuales separados: `gitleaks dir` para el árbol presente y `gitleaks git` para historial, con `--redact`, config y reporte JSON. El exit code de hallazgo es 1; el wrapper solo permite que un secreto histórico verdadero pase a `resolved` con evidencia de rotación, nunca como false-positive. Sintaxis basada en la [documentación oficial de Gitleaks](https://github.com/gitleaks/gitleaks/blob/master/README.md).

El historial del proyecto Free no se reconcilia ni se usa como baseline. La aplicación posterior enlaza un proyecto final recién provisionado y usa `migrations:push-guarded` bajo aprobación ligada a actor/razón/target/fingerprint y backup o plan de restore. Cada push —aditivo y enforcement— escribe y valida su propio reporte inmutable de rango, fingerprints de target/backup/aprobación y resultado; comprobar la paridad posterior no sustituye esa prueba de la mutación. Raw CLI/MCP no sustituye ni puede saltar el historial.

El cierre usa dos fases no reentrantes. Restore, recorrido live y gate final corren una sola vez mientras el commit limpio actual es el `releaseSha` explícito que CI/deployer construyó y desplegó. El reporte queda inmutable. Recién entonces se crea un único hijo directo `handoffSha` que solo agrega el recibo documental; su validador toma `releaseSha` del reporte, verifica hashes, parentesco, diff allowlisted y árbol limpio, y no vuelve a invocar el gate usando el nuevo `HEAD`.

**Rationale**: tests/builds verdes coexistieron con 83 warnings de seguridad y drift. Un reporte manual no es repetible.

**Alternatives rejected**:

- comparar solo nombres de archivos: no detecta forma real del esquema;
- aceptar DDL equivalente sin versión: el siguiente deploy sigue divergente;
- limpiar datos en el gate: una verificación no debe destruir.

## D14 — Observabilidad, kill switches y rollout

**Decision**: métricas mínimas: edad/profundidad outbox, lease vencido, retry/DLQ, tiempo venta→caso→DOCX→web, rechazos semánticos por código, delivery por canal, rate-limit KMZ, errores cross-tenant y discrepancias Storage/DB. Alertas tienen runbook y dueño; logs usan IDs/hashes, no PII/tokens.

Los controles `automatic_escritura`, `canonical_geometry_import` y `document_capabilities` viven en Supabase como estado operacional versionado `off | projects | on`, con scope organización/proyecto, compare-and-set, actor, razón y audit atómico. Ausencia, lectura fallida o scope inconsistente equivale a OFF. Web/API/worker usan el mismo resolver server-side y un hard-off de emergencia puede prevalecer; ningún estado OFF reactiva Storage directo, URL firmada ni writer geográfico legacy.

El hard-off independiente del plano DB se define con `PLOTIFY_HARD_OFF_AUTOMATIC_ESCRITURA`, `PLOTIFY_HARD_OFF_CANONICAL_GEOMETRY_IMPORT`, `PLOTIFY_HARD_OFF_DOCUMENT_CAPABILITIES` y `PLOTIFY_RELEASE_CONFIG_VERSION`. Un booleano/config-version faltante o inválido activa el hard-off. Cada runtime `web | api | worker` publica heartbeat service-only con release SHA, digest SHA-256 inmutable del bundle/imagen realmente cargado, config version y `sha256('hard-off-v1' | configVersion | estados ordenados)`. CI/deployer emite aparte un manifiesto autenticado con SHA, environment fingerprint, roster esperado, digests por rol y provenance; el gate lo valida contra una trust policy versionada y nunca deriva la autoridad desde los heartbeats. Exige al menos una attestation fresca (<120 s) por instancia esperada, ninguna extra, acuerdo entre instancias y digest exacto contra ese manifiesto. Ausencia, manipulación, staleness, digest inesperado o discrepancia mantiene los tres controles efectivos OFF y bloquea rollout.

- `automatic_escritura=off`: la obligación outbox permanece durable/diferida y no consume intento;
- `canonical_geometry_import=off`: nuevas importaciones/reemplazos responden `FEATURE_DISABLED`; las lecturas existentes continúan seguras;
- `document_capabilities=off`: no emite/renueva/sirve capacidades; la descarga autenticada same-origin permanece disponible.

Secuencia: entorno descartable → staging → equipo interno → un proyecto piloto → resto del piloto. Rollback inmediato ante fuga, corrupción, duplicación, documento inválido o error/latencia sobre umbral. DDL aditivo se revierte preferentemente con flag + forward-fix; restore se ensaya antes.

Cada E2E live que muta recibe approval y deployment manifest; el runner revalida digest, target, SHA, roster y digests inmediatamente antes y después de la mutación y deja un reporte inmutable. El rollout no se demuestra con un único CAS: cada invocación avanza exactamente un paso del plan, cada paso exige smoke browser/documento antes del siguiente, y el verificador read-only prueba la secuencia completa. Al primer ON efectivo de `document_capabilities`, un caso real emite una capacidad de prueba hash-only, la usa, la revoca y confirma denegación posterior sin proyectar Storage ni persistir plaintext.

**Rationale**: hardening grande sin activación separable convierte el despliegue en big-bang y dificulta distinguir fallos.

**Alternatives rejected**:

- un único flag global: no aísla superficie dañada;
- activar para todos tras CI: no prueba datos/configuración objetivo;
- rollback de código sin estrategia DB: puede dejar writers/readers incompatibles.

## D15 — Firma externa registrada, no firma electrónica integrada

**Decision**: `record_escritura_signature` es la única operación que puede llevar una venta desde `espera_firma_escritura` a `escritura_firmada`. Recibe una evidencia privada ya aceptada por el gateway, deriva tenant/proyecto/lote/caso desde recursos persistidos y confirma evento inmutable, resultado idempotente, cambio de etapa y `audit-v1` en una transacción. Requiere generación semánticamente `ready`, fecha no futura y evidencia del mismo scope; generación, delivery o Telegram nunca infieren firma.

**Rationale**: el sistema actual usa la etapa firmada como consecuencia del pipeline aunque no existe prueba de firma. Registrar una constancia externa verificable cierra ese falso positivo sin introducir un proveedor de firma electrónica avanzada, que permanece fuera del MVP constitucional.

**Alternatives rejected**:

- dejar la etapa firmada inalcanzable: evita el falso positivo, pero no satisface el flujo administrativo ni la trazabilidad exigida;
- derivarla de descarga/entrega: recibir un archivo no demuestra firma;
- integrar ahora un proveedor FEA: amplía el alcance constitucional y operacional de SDD019.

## D16 — Inventarios exactos de autoridad HTTP, egress, inbound y configuración

**Decision**: el inventario de privilegios no termina en Postgres. Un generador deriva exactamente todas las FastAPI routes, Next Route Handlers/Server Actions y tareas worker que alcanzan service-role, Auth admin o internal-secret, y las compara con una clasificación versionada de actor, principal confiable, recurso→tenant, rol, capability, audit/idempotencia, callers y tests. Esto incluye `bots`, `skills`, `integrations`, `prompts`, documentos y acciones de vendedores. `organization_id`, `X-User-Id` o IDs de body solo seleccionan; nunca autorizan. Operaciones de membresía/vendedor usan intent/finalize DB idempotente con audit atómico y compensación durable alrededor de Supabase Auth; remover una membresía no elimina la identidad global.

Un segundo generador deriva todos los egress `fetch`/HTTP/SDK/LLM web/API/worker y exige clasificación exacta de destino/redirect, timeout total ≤10 s, datos/secretos, frontera transaccional, retry/idempotencia, redacción y tests. El cliente Next→FastAPI, el agente conversacional OpenAI/Anthropic, Chile location, UF, Telegram/Meta/MCP/visión y agente legal quedan dentro; browser llama solo gateways same-origin. Prompt Ops y configuración de bot visibles deben funcionar por esos gateways o retirarse de navegación antes del build.

Inbound se trata como otra frontera: Meta valida HMAC sobre raw bytes antes de parse/queue; Telegram exige secret productivo y binding de bot/tenant; ambos deduplican update/event ID y no loguean body/PII. Config productiva falla al arrancar ante secretos vacíos/default/placeholder o endpoints remotos no HTTPS/allowlisted; attestations/reportes conservan solo fingerprints/presencia.

**Rationale**: CodeGraph confirmó egress y autoridad fuera de las listas nominales: `agent/graph.py`, `message_processor.py`, `microservice.client.ts`, geodatos/UF, Prompt Ops, bot setup, webhooks y Server Actions con service client. Una lista manual de tres integraciones permitiría GO con rutas explotables o visibles rotas.

**Alternatives rejected**:

- revisar solo endpoints conocidos: una ruta nueva queda fuera silenciosamente;
- confiar en internal secret/X-User-Id: autentica transporte, no actor ni tenant;
- permitir browser→proveedor/API directo: expone URL/token y evita el contexto server-side;
- ocultar warnings de startup: un placeholder conocido no es un secreto productivo.

## D17 — Replays de proveedor, workers generales y evidencia recuperable

**Decision**: la deduplicación de webhook no es suficiente. El borde Meta/Telegram deriva una identidad hash de provider+bot/account+update/message ID, reclama una operación durable y la propaga hasta reserva, aprobación, outbox y notificación; un crash después del claim no puede convertir el retry en una segunda aprobación. Las operaciones de capability son filas de emisión hash-only: CSPRNG de 256 bits, TTL desde emisión y rotación atómica, no una mutación de hash asociada a la fecha original de delivery.

ARQ despierta trabajo pero no prueba durabilidad general: errores ordinarios se clasifican y hacen `Retry` explícito o dead-letter durable redactado; hooks no infieren éxito desde campos no documentados. La evidencia de release se archiva con readback/retención, pues el directorio ignored es cache y un hash local sin preimagen no es reproducible. Las attestations distinguen deployment/slot/instancia y obligan retiro auditado: un runtime fresco viejo aún procesando es blocker, no historia inocua.

**Rationale**: CodeGraph encontró que `main_worker.py` interpreta campos no entregados por ARQ y que las excepciones normales no solicitan retry; también encontró que el dedupe de webhook no cubre crash posterior al enqueue/claim. La auditoría cruzada detectó que los artefactos finales ignorados no tenían archivo recuperable.

## Riesgos aceptados para planificación

- Los 558 avisos de performance no se corrigen todos en SDD019. Sí bloquean los que afectan rutas core o regresan el baseline; el resto requiere dueño, justificación y fecha.
- DOCX sigue siendo minuta editable y no instrumento notarial firmado.
- La taxonomía semántica reduce defectos deterministas, pero no sustituye revisión jurídica profesional.
- Los valores de recursos/lease son baseline inicial y deben confirmarse con carga; el gate impide elevarlos sin evidencia.

## Preguntas resueltas durante clarify

- vendedor asignado ve inventario no sensible del proyecto; compradores/ventas/documentos sensibles solo de operaciones propias;
- capability links continúan, pero acotados, hasheados, revocables y sin listado;
- matriz/borrador interno puede conservar gaps estructurados; documento entregable no;
- la excepción de historial usada en SDD018 queda revocada;
- features fuente no se consumen al combinar infraestructura;
- destinatarios se congelan al commit;
- la huella automática incluye caso, snapshot, matriz/template, renderer/ruleset/schema/normalización y aprobación/procedencia/política;
- ningún criterio P1, drift, secreto o durabilidad puede exceptuarse para GO.
