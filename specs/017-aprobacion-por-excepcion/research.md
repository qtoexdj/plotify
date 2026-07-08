# Research: Aprobación por excepción (SDD017)

Decisiones de la Fase 0. Contexto medido en el código el 2026-07-07: el camino feliz post-venta exige hoy 4 acciones + 4 diálogos por lote (`workflow-acciones.tsx`: enviar → aprobar revisión jurídica → aprobar matriz → generar con warning). La máquina de estados `draft → legal_review_pending → approved` (SDD007/008) se diseñó para el molde y se heredó completa a cada caso por lote.

## D1 — Dónde vive la cascada

**Decision**: Servicio nuevo `apps/api/services/escritura_auto_pipeline.py` con una función `run_case_cascade(case_id, trigger)` invocada desde 3 puntos: el sale hook (`escritura_sale_hook.py`, gatillo `sale_validated`), la aprobación de revisión jurídica (gatillo `review_approved`) y el endpoint de retry (gatillo `manual_retry`).

**Rationale**: El volumen es bajo (una corrida por venta) y las piezas ya son async en línea (staging + snapshot + render + Telegram hoy corren dentro de requests); un worker/cola agregaría infraestructura sin necesidad y haría más difícil el SC-006 (< 2 min). Un servicio con gatillo explícito mantiene la trazabilidad (cada corrida sabe por qué corrió).

**Alternatives considered**: (a) job en background/cola — rechazado: infraestructura nueva para un volumen que no la exige; (b) lógica dentro del endpoint de venta — rechazado: la cascada tiene 3 gatillos distintos y quedaría duplicada; (c) trigger de base de datos — rechazado: la cascada llama render DOCX y Telegram, no es SQL.

**Prerequisito**: extraer submit/approve/generate de `escritura_matrices.py` (2.904 líneas) a `escritura_case_workflow.py`. Hoy `approve_matriz` y `_generate_minuta_row` viven en el archivo de endpoints y la cascada no puede reusarlos sin HTTP. Refactor sin cambio de comportamiento, cubierto por los tests existentes (79 en `test_matriz_endpoints.py` + bridge).

## D2 — Cómo se registra una aprobación del sistema

**Decision**: `escritura_matrices.submitted_by`/`approved_by` quedan NULL en aprobaciones automáticas y se agrega `approval_origin` (`'human'` default | `'system'`). El detalle de la decisión (gatillo, molde origen + versión, snapshot_hash) se registra en `legal_review_decisions` (tabla existente, hoy escrita por `_insert_matriz_review_decision`) con `decided_by` NULL + `origin='system'`.

**Rationale**: No inventar un usuario-fantasma "sistema" en `auth.users` (rompería FKs de auditoría y el multi-tenant); la distinción humano/sistema como columna explícita es consultable y cumple FR-002/SC-005. `legal_review_decisions` ya es el historial de decisiones del caso — extenderla mantiene una sola línea de tiempo.

**Alternatives considered**: usuario de servicio por organización — rechazado: contamina miembros de la organización y complica RLS; guardar "system" como string en la columna UUID — rechazado: rompe el tipado y las joins.

## D3 — Estado de cascada del caso

**Decision**: Tabla nueva `escritura_cascade_runs` (id, organization_id, escritura_case_id, trigger, outcome `completed|exception|awaiting_review`, causes jsonb, steps jsonb, created_at). La mesa deriva la vista del caso de la última corrida + datos existentes (generaciones, deliveries, status de matriz). Sin columnas mutables nuevas en `escritura_cases`.

**Rationale**: Auditoría Nivel B (Principio V) pide historia, no solo estado final; los reintentos (FR-006) son corridas nuevas con su outcome; se evita el bug clásico de columna de estado desincronizada del hecho real. `steps` registra qué se ejecutó/saltó (base de la idempotencia verificable).

**Alternatives considered**: columna `cascade_status` en el caso — rechazada: pierde historia de reintentos y puede quedar stale; derivar todo al vuelo sin tabla — rechazado: la notificación de excepción (FR-005) necesita un evento persistido y SC-004 un timestamp.

## D4 — Política de revisión jurídica

**Decision**: `organizations.escritura_review_policy` enum (`'every_sale'` default | `'exceptions_only'`), editable solo por admin vía Server Action del patrón casa de SDD016 (`settings/actions.ts`: chequeo `organization_members` + escritura directa + `logAudit` a `audit_logs` con quién/cuándo/de→a). La cascada la lee al momento de correr; los casos en curso no cambian de política retroactivamente (FR-003).

**Rationale**: Es una política de la organización (no del proyecto): la confianza es en el molde y el equipo, y una sola perilla es explicable. Default conservador alineado con SC-001 de SDD016.

**Alternatives considered**: política por proyecto — rechazada por ahora (se puede promover después si un piloto lo pide; empezar org-wide es reversible); flag de entorno — rechazado: no es configuración de despliegue, es decisión del cliente.

## D5 — Warning legal una vez por proyecto

**Decision**: `projects.minuta_warning_acknowledged_by` (uuid) + `_at` (timestamptz). Se confirma en el checklist de preparación del proyecto (o en la primera generación si el proyecto es pre-SDD017). `escritura_minuta_generations` conserva sus columnas `warning_acknowledged_by/_at` como copia del amparo vigente al generar (FR-009: cada generación referencia la confirmación que la ampara).

**Rationale**: El aviso es sobre el carácter de borrador de las minutas del proyecto — jurídicamente ampara al proyecto, no a cada click. Copiar el amparo en la generación mantiene el registro inmutable auto-contenido (FR-010).

**Alternatives considered**: confirmación por organización — rechazada: el riesgo declarado es por proyecto/molde; tabla dedicada de acknowledgments — rechazada: una sola confirmación vigente por proyecto no justifica tabla.

## D6 — Idempotencia y reanudación

**Decision**: Idempotencia por paso, verificando el estado real antes de actuar: aprobar solo si `status != 'approved'` para el snapshot vigente; generar solo si no existe generación con el mismo (`matriz_id`, `matriz_version`, `snapshot_hash`); entregar solo destinatarios sin delivery exitoso para esa generación. Cada corrida registra en `steps` qué ejecutó y qué saltó.

**Rationale**: FR-006 y el edge case de cascada interrumpida: reintentar siempre es seguro porque cada paso re-verifica contra la base, no contra memoria. Las claves naturales ya existen (status, snapshot_hash, content_hash, deliveries por generación+destinatario).

**Alternatives considered**: lock/lease por caso — innecesario con pasos idempotentes y volumen bajo; transacción única — imposible (render DOCX y Telegram no son transaccionales).

## D7 — Notificación de excepción

**Decision**: Reusar el canal de `escritura_delivery` (Telegram a admins) con un tipo de mensaje nuevo: lote, lista corta de causas humanizadas (ya existen los microcopys de blockers de SDD016) y link directo a la mesa del caso. Best-effort: una falla de notificación no altera el outcome de la corrida.

**Rationale**: El admin ya vive en Telegram para aprobar ventas y recibir minutas; si la mesa deja de ser peaje, la excepción tiene que llegar a donde él está (SC-004). Los microcopys de blockers ya están humanizados — cero trabajo de redacción nueva.

**Alternatives considered**: email — no hay canal de email operativo en el producto; solo badge en la plataforma — rechazado: exige volver a mirar la app, que es lo que este feature elimina.

## D8 — Interacción con four-eyes

**Decision**: Con `LEGAL_REVIEW_REQUIRE_DISTINCT_REVIEWER=true` y política `every_sale`, el envío a revisión tiene origen `system` (submitted_by NULL), por lo que cualquier humano puede aprobar la revisión — la regla "revisor ≠ emisor" se cumple trivialmente. En flujo manual (excepciones) la semántica actual no cambia. En política `exceptions_only` + four-eyes activo, la cascada NO auto-aprueba: deja el caso en `awaiting_review` (la organización pidió dos controles contradictorios y gana el más estricto, documentado).

**Rationale**: Preserva el contrato del flag sin bloquear a equipos de una persona (el flag ya está OFF por default, verificado en `core/config.py:39`).

**Alternatives considered**: prohibir la combinación por validación — rechazado: degradar con gracia (parar en revisión) es más útil que un error de configuración.
