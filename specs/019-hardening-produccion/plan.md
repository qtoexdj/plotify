# Implementation Plan: Hardening de producción del pipeline core

**Branch**: `019-hardening-produccion` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-hardening-produccion/spec.md`

## Summary

SDD019 convierte los caminos existentes de proyecto → geometría → venta → escritura → entrega en operaciones multi-tenant verificables, transaccionales e idempotentes. El diseño cierra primero permisos y todas las proyecciones Storage —incluidos generador legacy, Mini App y delivery—; añade un contexto de workspace explícito, operaciones atómicas de proyecto/geometría, hechos estructurados de comparecientes, validación semántica previa a aprobación humana o automática, un outbox durable para la cascada, entregas únicas y revocables, registro auditable de firma externa, controles reales de rollout, estados honestos, accesibilidad WCAG 2.2 AA y un gate de producción reproducible.

No se crea una segunda máquina de estados ni se reemplazan Supabase, ARQ, FastAPI, Next.js o el renderer DOCX. Las migraciones son incrementales, los contratos HTTP/RPC existentes se endurecen, y los datos ambiguos se ponen en cuarentena en vez de borrarse. El veredicto actual permanece **NO-GO** hasta que las tareas P1, la paridad de migraciones, el ensayo de restore y los gates de seguridad estén verdes.

## Technical Context

**Language/Version**: TypeScript 5 sobre Node.js `>=22.13`; Python 3.13; PostgreSQL 17/PLpgSQL; SQL pgTAP; scripts Node ESM.

**Primary Dependencies**: Next.js 16.2.6, React 19.2.4, Zod 4.2.1, Supabase JS 2.106.1/SSR 0.10.3, FastAPI 0.135.1, Pydantic 2.12.5, Supabase Python 2.8.1, ARQ 0.27.0 + Redis, python-docx, JSZip 3.10.1, xmldom 0.9.10, Playwright 1.61.1.

**Storage**: Supabase PostgreSQL como fuente transaccional; buckets privados `project-files` y `documents`; Redis solo para ejecución/colas, nunca como fuente de verdad.

**Testing**: pytest 9 + pytest-asyncio, Vitest 4 + Testing Library, pgTAP mediante `supabase test db`, Playwright en Chromium real, scripts de drift/advisors/secret scanning y fallos inyectados.

**Target Platform**: API y worker Linux; web moderna desktop/tablet/móvil desde 320 CSS px; Supabase alojado; Telegram como integración secundaria.

**Supabase target authority**: este repositorio es cloud-only. El proyecto Free actualmente linked (`swkrnjdpnlrgxgotmfxy`) queda limitado a inspección/verificación no mutante porque no tiene backups recuperables. El único destino de aplicación SDD019 será el proyecto Supabase final, recién provisionado y enlazado en el momento del cutover; su ref y fingerprint quedan ligados a la aprobación. Quedan prohibidos Docker/Supabase local, `supabase start`, `--local`, `db reset` local y la generación de tipos desde una base local. Cualquier comando local remanente en un artefacto se considera obsoleto y debe corregirse antes de ejecutarse.

**Project Type**: Monorepo web + API/worker + base compartida + contratos generados.

**Performance Goals**: recuperar una obligación durable dentro de 2 minutos desde que worker y dependencias vuelven; sostener 20 reintentos/cascadas concurrentes sin duplicar; piloto de 50–100 lotes y hasta 2.000 features/250.000 coordenadas por importación dentro del presupuesto medido.

**Constraints**: aislamiento absoluto por tenant; auditoría atómica; `project-files` y `documents` privados; ninguna URL/path Storage en superficies públicas; rollout default-off y fail-closed; sin secretos en código/reportes; timeout externo total ≤10 s; archivo KMZ ≤20 MB comprimido/100 MB expandido; validación antes de aprobar o persistir entregables; WCAG 2.2 AA; migraciones solo en la ruta canónica.

**Scale/Scope**: seis historias, 44 FR y 18 SC; universo privilegiado descubierto dinámicamente desde catálogo/ACL/triggers/policies, rutas FastAPI, Route Handlers/Server Actions, workers, service-role/internal-secret, egress y log callsites, y verificado otra vez tras cada migración/despliegue; 31 migraciones canónicas frente a 30 entradas linked al auditar; caminos core de proyectos, geometría, escritura y entrega, no todo el backlog histórico de performance.

## Constitution Check

_Gate previo a research: PASS. Revalidado después del diseño: PASS._

| Principio / restricción               | Resultado del diseño                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Piloto y flujo core KMZ            | PASS — prioriza importación, lotes, venta, minuta y entrega; no agrega funciones comerciales.                                                                                                     |
| II. Geometría como origen legal       | PASS — cada feature importada queda canónica; uniones son derivados versionados; documentos se invalidan al reemplazar fuente.                                                                    |
| III. Supabase y migraciones canónicas | PASS — todo DDL nuevo, controles de rollout y su auditoría viven en Supabase/migraciones canónicas; drift bloquea incluso si el DDL remoto “parece igual”.                                        |
| IV. Contratos tipados                 | PASS — cambios públicos nacen en esquemas/rutas FastAPI o Zod/RPC y OpenAPI se regenera; no se edita el JSON generado a mano.                                                                     |
| V. Multi-tenant y auditoría Nivel B   | PASS — workspace explícito y revalidado; vendedor asignado; service role con tenant derivado; aprobación, rollout, firma externa registrada y auditoría confirman atómicamente.                   |
| VI. Testing/gates                     | PASS — pgTAP real, pytest, Vitest, Playwright, concurrencia, restore, secretos y advisors forman el gate.                                                                                         |
| Integraciones externas                | PASS — inventario exacto de egress/inbound, allowlist, URL/host/redirect, timeout ≤10 s, webhooks firmados, config productiva fail-closed y ninguna llamada externa dentro de una transacción DB. |
| Tailwind/shadcn y accesibilidad       | PASS — se corrige el primitivo `Sheet` y sus consumidores sin un rediseño paralelo; objetivo WCAG 2.2 AA.                                                                                         |

No hay violaciones constitucionales que justificar.

## Project Structure

### Documentation (this feature)

```text
specs/019-hardening-produccion/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── security-boundaries.md
│   ├── project-geometry-operations.md
│   ├── escritura-quality-workflow.md
│   └── release-gate.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/web/
├── scripts/e2e/production-readiness.mjs              # nuevo: navegador real
├── src/app/api/
│   ├── projects/[id]/files/route.ts                   # archivo URL-scoped; auth antes del body
│   ├── projects/[id]/geometry-imports/route.ts        # fuente URL-scoped + límites
│   ├── projects/{route.ts,[id]/route.ts}              # schemas estrictos + operación
│   ├── files/[fileId]/route.ts                        # gateway autenticado, nunca redirect Storage
│   ├── escritura-deliveries/capability/[token]/route.ts # streaming por capacidad
│   ├── escritura-cases/[caseId]/signature-events/route.ts # registro de firma externa
│   └── onboarding/                                    # rutas asignar/infra/recalcular
├── src/lib/
│   ├── auth/active-workspace.ts                       # nuevo: selección/revalidación
│   ├── config/release-flags.ts                        # resolver server-side compartido/fail-closed
│   ├── documents/{matriz-schema,matriz-types}.ts      # schema v2 optional_phrase
│   ├── services/{workspace,projects,onboarding}.service.ts
│   └── validations/{project,geometry-operation}.schema.ts # nuevos
├── src/components/ui/{sheet,sidebar}.tsx
├── src/components/projects/{onboarding/ProjectMediaStep,GeometryUploadPanel}.tsx # cutovers gateway
├── src/components/{operations,documents,projects}/    # consumidores Sheet
└── tests/                                             # auth, proyectos, geometría, UI

apps/api/
├── api/{deps.py,v1/endpoints/{bots,documents,miniapp,escritura_matrices,escritura_signatures}.py}
├── schemas/{escritura_matrices,escritura_signatures}.py
├── core/{config.py,release_flags.py}                    # mismos controles Supabase, hard-off de despliegue
├── integrations/telegram_client.py
├── services/
│   ├── matriz_semantic_validation.py                  # nuevo
│   ├── {matriz_token_resolution,matriz_docx_renderer}.py
│   ├── {legal_title_analysis,legal_title_block_check,legal_document_ingestion}.py
│   ├── {document_generator,escritura_case_workflow,escritura_delivery}.py
│   └── {escritura_sale_hook,escritura_signature}.py
├── workers/
│   ├── main_worker.py
│   └── tasks/escritura_workflow_outbox.py             # nuevo
├── scripts/verify_production_readiness.py             # DB/E2E live no destructivo
└── tests/                                             # semántica, outbox, fallos, tenancy

packages/database/
├── scripts/
│   ├── assert-canonical-migrations.mjs
│   ├── privileged-operations-inventory.mjs         # catálogo/ACL exacto, sin count fijo
│   ├── compare-migration-history.mjs                  # nuevo
│   └── production-data-preflight.mjs                  # nuevo, solo lectura
├── supabase/
│   ├── migrations/<timestamp>_sdd019_*.sql            # creadas con CLI, append-only
│   └── tests/database/sdd019_*.test.sql                # pgTAP
└── types/database.generated.ts

packages/contracts/
└── openapi/plotify-chat.v1.json                        # generado desde FastAPI

apps/web/src/lib/services/
└── plotify-chat.generated.ts                           # generado por contracts:generate

scripts/production-readiness/
├── verify.mjs                                          # nuevo: orquestador y reporte
├── redact.mjs                                          # nuevo: salida sin secretos/PII
├── privileged-http-surfaces.mjs                        # nuevo: Route/FastAPI/Action/worker exacto
├── runtime-egress-surfaces.mjs                         # nuevo: HTTP/SDK/LLM exacto
├── feature-controls.schema.json                        # keys/modos/scope/version
└── thresholds.json                                     # nuevo: budgets versionados
```

**Structure Decision**: Se conserva la arquitectura monorepo actual. Las transacciones y restricciones viven en Postgres; Next aplica validación de borde y contexto de workspace; FastAPI/ARQ ejecuta documentos e integraciones; scripts root solo orquestan gates y nunca mutan el entorno objetivo por defecto.

## Architecture and Implementation Strategy

### 1. Frontera de seguridad y Storage primero

1. Derivar dos inventarios privilegiados exactos: Postgres desde `pg_proc`, ACLs/default ACLs, triggers y helpers de policies; HTTP/runtime desde FastAPI routes, Next Route Handlers/Server Actions y workers que alcanzan service-role/admin Auth/internal-secret. Clasificar firma o método-path/símbolo con actor, tenant por recurso, capability, callers, audit/idempotencia y tests; exigir diff vacío al inicio, tras cambios y contra linked/build.
2. Solo después del inventario, mover/recrear helpers de RLS en esquema no expuesto, fijar `search_path` y preparar grants/policies tenant-safe compatibles con lectores existentes. Cada objeto nuevo recibe grant explícito; no se asume exposición automática de Data API.
3. Introducir `project_file_objects`, migrar paths legacy con findings y eliminar acceso directo del cliente a `project-files`/`documents`. `ProjectMediaStep`, onboarding, documents-tab y registro legal intercambian `fileId`; metadata+referencia legal+audit convergen o fallan visiblemente. Las rutas server-side validan usuario, workspace, recurso, rol/asignación antes de abrir un stream acotado y recién entonces usan el service client.
4. Reemplazar tokens de entrega en claro por hashes; la capacidad resuelve un único documento, dura como máximo siete días y transmite bytes mediante el gateway. Una URL Storage interna dura como máximo 60 segundos y nunca se expone al cliente. Pérdida de membresía/asignación o revocación invalida toda solicitud posterior.
5. Eliminar todos los productores actuales de signed URL/path: historial y respuesta de generación, delivery/list/renew, captions Telegram, Mini App y `generated_documents`. DTOs públicos exponen solo IDs/estados/rutas Plotify same-origin y OpenAPI se regenera.
6. Desplegar gateway/readers seguros con controles de rollout off y probarlos antes de aplicar la migración final que revoca `PUBLIC/anon/authenticated` y elimina policies directas; OFF puede pausar writers/capabilities, pero nunca reabre el camino legacy. Repetir smoke después del enforcement.
7. Añadir pgTAP de roles/tenants, prueba de avatar conocido-sin-listado y E2E web/Mini App para que el endurecimiento no dependa de mocks ni de advisors por conteo.

### 2. Operaciones idempotentes de proyecto y geometría

1. `idempotency_operations` registra identidad, actor, alcance y hash RFC 8785/JCS versionado, con vectores golden idénticos TS/Python. Replay igual devuelve el resultado original; hash distinto produce `409 IDEMPOTENCY_CONFLICT`.
2. `create_project_with_lots` valida entero 1..100 e inserta proyecto, lotes y auditoría en una función transaccional estrecha; nunca hace rollback best-effort desde TypeScript.
3. La carga geográfica lleva el proyecto en URL, autentica y reclama cuota antes de abrir el multipart, procesa un stream acotado, preserva la fuente privada y llama `commit_geometry_import`, que persiste exactamente una fila canónica por feature.
4. `assign_project_geometry` bloquea lote y geometría y actualiza referencias, superficie, hash, timestamps, auditoría y una obligación `geometry_enrichment_jobs` en una sola transacción; el worker usa lease/retry/DLQ.
5. Una combinación `road | common_area` crea/actualiza un derivado genérico que referencia IDs fuente; no crea nuevas geometrías canónicas.

### 3. Veredicto semántico ligado al artefacto

1. Subir el schema de matriz a v2 con `optional_phrase`, una unidad inline que se conserva completa o se omite completa. No se resuelven conectores mediante string vacío.
2. Proyectar `titulo.propietarios[]` a `vendedor.comparecientes[]` con nacionalidad/estado civil/tratamiento evidenciados por persona. El prompt devuelve `null` cuando falta; el resolver conserva un gap y solo materializa comparecencia aprobable desde hechos completos o resolución manual jurídica, nunca `[NACIONALIDAD]`.
3. `begin_matriz_approval` crea un candidato `validating` sin aprobar. Validar AST y DOCX temporal contra ese intento; `finalize_matriz_approval` hace compare-and-set de matriz/snapshot/evidencia/policy/grant y confirma aprobación+PASS+audit atómicamente. `approve_case_matriz` y `_system_approve_matriz` comparten el flujo; falla semántica deja cero mutación de aprobación/upload/generación/delivery.
4. Persistir el veredicto con hashes de contenido/bytes/procedencia, versiones de renderer/ruleset, matriz/template, snapshot, intento y grant jurídico. Solo `passed` ligado a una aprobación final vigente puede enlazarse a una generación entregable.
5. Reservar una ruta Storage determinista por huella. Un crash repite sobre la misma ruta; el commit final de generación es único. Invalidación elimina el temporal o deja una reparación explícita, nunca un archivo “listo” huérfano.
6. Generaciones históricas quedan `unverified`; inspeccionar bytes solo puede detectar fallas. Un PASS exige reconstruir toda la procedencia/aprobación original; regenerar crea una fila nueva.

### 4. Handoff durable venta → escritura → entrega

1. `approve_sale` conserva su bloqueo comercial y, en el mismo commit, corrige `updated_at`/`espera_firma_escritura`, escribe auditoría y una fila única `workflow_outbox` con la huella y snapshot de destinatarios.
2. ARQ solo despierta/consume; la obligación durable es Postgres. El RPC resuelve `automatic_escritura` antes del lease y el worker vuelve a comprobarlo antes del primer efecto: OFF/hard-off difiere la misma fila sin lease, intento ni DLQ y ON la reanuda. Solo una fila elegible se reclama con `FOR UPDATE SKIP LOCKED`, lease de 60 s, heartbeat de 15 s, ocho intentos y backoff configurable; terminales pasan a dead-letter/reparación.
3. La huella automática autoritativa incluye organización, caso, snapshot, matriz/template, renderer/ruleset/schema/normalización y aprobación/procedencia/política. Una regeneración humana usa otra operación y motivo, sin vulnerar la unicidad automática.
4. Validez, generación y entrega son ejes separados. Web para el vendedor congelado es obligatorio; Telegram y avisos admin configurados son secundarios. `completed` exige web válida; Telegram fallido produce `partial_delivery`.
5. Ninguna llamada externa ocurre dentro del commit; cada entrega es una obligación única y reintentable con errores redactados.
6. `record_escritura_signature` es la única transición a `escritura_firmada`: valida evidencia privada aceptada, generación `ready`, tenant/caso/lote, fecha y actor; evento, etapa, idempotencia y auditoría confirman juntos. Es registro de una firma externa, no integración FEA.

### 5. UI responsive y accesible

1. Corregir la variante inferior del `Sheet` compartido para que acepte altura/máximo reales sin que `h-auto` gane por especificidad.
2. Usar layout `header/actions: shrink-0` + un solo cuerpo `min-h-0 overflow-y-auto`, safe-area y foco no oculto.
3. Añadir `SheetDescription`, nombres accesibles y estados anunciados; preservar trap de foco/Escape del primitivo.
4. Verificar los seis callers confirmados por CodeGraph —OperationsTable, sidebar, editor legal, lots-tab, geometry-viewer y mesa— a 320×568, 375×667, 769×880, desktop y 200% de zoom con Playwright + axe/manual VoiceOver.

### 6. Release gate, observabilidad y rollout

1. No se reconcilia, renombra ni repara el historial del proyecto Free. Antes del primer push, el proyecto final debe estar enlazado, tener fingerprint aprobado y mostrar historial SDD019 fresco, sin versiones conflictivas. Si no es fresco, se detiene el cutover y se produce un plan aprobado independiente; no se usa raw CLI/MCP repair. Los pushes aditivo y de enforcement producen reportes inmutables separados con rango, target, backup/restore plan, aprobación y resultado, y cada reporte se valida antes de usar la paridad posterior como evidencia de estado.
2. Implementar primero el scanner local/no mutante de advisors, secretos y dependencias, con fixtures que prueben fail-closed y fingerprints estables. La ejecución autoritativa contra linked ocurre solo después de que exista el mutador Auth guardado y se haya provisionado/aprobado el proyecto final: el mismo target y source manifest deben enlazar la aprobación, los fingerprints redactados before/after y el live-read de leaked-password protection. Luego ejecutar baseline y delta por fingerprint de advisors, pgTAP, API/web/contracts, concurrencia y navegador. Cada warning de performance restante conserva owner/impact/budget/review date; el finding de listado de avatars solo cierra con prueba de lectura por clave conocida y denegación de list/mutación cruzada. El reporte JSON/Markdown se redacta y no contiene secretos ni PII. El proyecto Free heredado nunca se reconfigura para satisfacer este gate.
3. Detectar legacy antes de constraints: correcciones deterministas auditadas; duplicados/estados ambiguos a `production_readiness_findings` abiertos, que bloquean readiness.
4. Calificar temprano el harness de restore en rama/entorno descartable; después de crear `00600`, repetir clean replay de todas las migraciones + seeds, forward-fix/restore y RTO, y refrescar esa evidencia sobre el SHA candidato exacto. Solo el ensayo que incluye enforcement satisface SC-014.
5. Crear `feature_rollout_controls`/scope de proyectos y `runtime_release_attestations` en foundation. Ausencia o error equivale a OFF; cambios usan compare-and-set, razón, actor y audit. Los tres `PLOTIFY_HARD_OFF_*` y `PLOTIFY_RELEASE_CONFIG_VERSION` son configuración exacta default-on/fail-closed; web/API/worker publican SHA, digest inmutable por artefacto/rol, config y fingerprint con heartbeat <120 s. CI/deployer produce de forma independiente un manifiesto autenticado con SHA, environment fingerprint, roster y digests; el gate verifica su provenance contra trust policy versionada, exige cobertura exacta del roster y bloquea cualquier runtime faltante/extra/stale/discrepante o digest distinto. Todo E2E live mutante recibe ese manifest y lo re-hashea junto con attestations inmediatamente antes/después de mutar. Aplicar primero migraciones aditivas/policies tenant-safe compatibles; desplegar gateway/readers con los tres controles off y ejecutar `live_smoke`; con backup y plan fingerprint revocar/nulificar `link_token` plaintext solo tras reemplazo autenticado same-origin verificable—sin emitir capacidades con OFF—; crear/probar en clean replay y aplicar después la migración canónica final `20260713000600_sdd019_security_enforcement.sql`, repetir pruebas remotas y recién entonces ejecutar todos los CAS interno→un proyecto→piloto, cada uno seguido de smoke browser/documento. El primer ON de capacidades prueba issue/read/revoke y denegación posterior con persistencia hash-only.
6. El registry de stages del gate es único: T110 usa `migration_parity`, `security` y `database_tests`; T111 usa `live_smoke` con aserción flags-off. `database_security` y `gateway_compat` no son nombres válidos.
7. El inventario dinámico de egress descubre `fetch`, clientes HTTP, SDKs y LLM en web/API/worker, incluidos el cliente Next→FastAPI, agente conversacional, geodatos, UF, Telegram/Meta/MCP/visión y agente legal. Cada callsite debe estar clasificado y usar destino/redirect allowlisted, timeout total por intento ≤10 s, redacción y retry idempotente; browser usa gateway same-origin y operaciones largas se reanudan por job/outbox. El inventario inbound exige Meta HMAC raw-body, Telegram secret productivo fail-closed, replay idempotente y cero body/PII en logs. Prompt Ops y bots visibles tienen puente same-origin funcional y principal derivado server-side.
8. Tras T117–T119, T120 ejecuta dos fases no reentrantes. En fase A se congela, compila y despliega un `releaseSha` limpio y explícito con digests; restore, recorrido live y gate se ejecutan mientras `HEAD=releaseSha`, y rechazan cualquier diferencia entre source manifest, deployment manifest, `deployment.sourceSha`, attestations y ese SHA. En fase B, después del reporte inmutable, se permite exactamente un `handoffSha` hijo directo y docs-only para el recibo SDD019. El post-validador deriva la autoridad desde el reporte, comprueba padre, allowlist del diff, hashes y árbol limpio sin volver a ejecutar fase A contra el HEAD documental; rollout sigue ligado al `releaseSha`. T111 es solo rehearsal.

9. El cierre documental tiene dos allowlists exactas: `handoffSha` contiene el recibo SDD019 y únicamente el checkbox T120, y referencia un `archive-receipt` cuya readback inmutable prueba retención mínima de 365 días; tras el rollout, `rolloutReceiptSha` contiene solo el summary/recibo derivado y el checkbox T121. Para el roster, solo runtimes explícitamente retirados o stale son históricos: cualquier runtime fresco no retirado del mismo environment bloquea, incluso si pertenece a otro deployment.

## Phase 0 — Research

Las decisiones y alternativas están en [research.md](./research.md). La evidencia base combina:

- CodeGraph sano (701 archivos, 11.114 nodos, 29.398 relaciones) y análisis de callers/impact;
- `plotify_memori/` y ADR-002/005/006/009, contrastados contra código real;
- Supabase MCP sobre el proyecto conectado (políticas, grants, tablas, migraciones y advisors);
- documentación vigente de Supabase recuperada con Context7/MCP para RLS, Storage, grants, testing y migraciones;
- skills `security-and-hardening`, `accessibility` y `shipping-and-launch` para límites, WCAG 2.2 AA, rollout y rollback.

No quedan `NEEDS CLARIFICATION`.

## Phase 1 — Design and Contracts

- [data-model.md](./data-model.md): tablas nuevas, extensiones, invariantes, índices, estados, RLS y migración de legacy.
- [security-boundaries.md](./contracts/security-boundaries.md): actores, workspace, archivos, capabilities y clasificación privilegiada.
- [project-geometry-operations.md](./contracts/project-geometry-operations.md): requests, idempotencia, transacciones, límites y errores.
- [escritura-quality-workflow.md](./contracts/escritura-quality-workflow.md): issues semánticos, huella, outbox, destinatarios y estados.
- [release-gate.md](./contracts/release-gate.md): etapas, salida, umbrales, excepciones y exit codes.
- [quickstart.md](./quickstart.md): protocolo reproducible local/live, fallos, browser, restore y GO/NO-GO.

## Dependency Order

1. **Foundation**: inventario, migración drift, helpers de test, contexto de workspace e idempotencia común.
2. **US1 + US2 en paralelo**: seguridad/Storage y semántica DOCX no dependen entre sí.
3. **US3**: proyecto/geometría depende de workspace, idempotencia y grants cerrados.
4. **US4**: outbox y entregas dependen de seguridad, semántica y estado comercial corregido.
5. **US5**: UI puede avanzar tras fijar estados/errores públicos; se valida junto a todas las superficies.
6. **US6**: compone todas las evidencias, reconciliación legacy, restore y rollout; no puede declararse verde antes de US1–US5.

## Verification Strategy

Cada tarea tendrá un `Verify` concreto. El cierre completo ejecuta, como mínimo:

```bash
pnpm verify:migrations
pnpm --filter @plotify/database test:db:linked
pnpm contracts:generate
pnpm test:api
pnpm test:web
pnpm --filter web lint
pnpm format:check
pnpm typecheck:web
pnpm build:web
pnpm --filter web test:e2e:production -- \
  --target local \
  --scenario all \
  --output artifacts/production-readiness/local-e2e
pnpm verify:production-readiness -- \
  --target linked \
  --release-sha "$(git rev-parse HEAD)" \
  --deployment-manifest artifacts/production-readiness/deployment/manifest.json \
  --output artifacts/production-readiness/final \
  --no-destructive \
  --require-clean-git \
  --require-deployed-sha
```

Además se ejecutan tests live con credenciales ingresadas de forma interactiva, Supabase advisors, escaneo de secretos/dependencias y ensayo de restore en entorno descartable. Ningún comando de gate limpia datos automáticamente.

## Complexity Tracking

No se requieren excepciones constitucionales. Las tablas `idempotency_operations`, `geometry_imports`, `escritura_semantic_validations`, `workflow_outbox` y `production_readiness_findings` representan obligaciones distintas y auditables que hoy se pierden entre procesos; consolidarlas en JSON o logs impediría constraints, RLS, retries y evidencia de lanzamiento.
