# Research: decisiones de diseño (Phase 0)

Cada decisión resuelve una ambigüedad del plan de auditoría. Formato: **Decisión / Rationale / Alternativas rechazadas / Evidencia en código**.

---

## R1 · Cómo tolerar los resultados PostgREST `None` (FR-001)

**Decisión**: Crear un helper `_safe_data(result)` que devuelva `getattr(result, "data", None) if result is not None else None`, y usarlo en `_fetch_operational_rows` (los 3 `.data`) y en `_assert_lot_scope`. Auditar los 36 usos de `maybe_single` del API y aplicar el guard donde el resultado puede ser `None`.

**Rationale**: `maybe_single().execute()` de supabase-py devuelve `None` (no un objeto con `.data = None`) cuando hay 0 filas. Acceder a `.data` sobre `None` lanza `AttributeError`. `payment_info` es opcional en todo el mapeo (solo enriquece `transaccion.detalle_pago[]`), así que su ausencia no debe bloquear.

**Alternativas rechazadas**:

- _Exigir siempre `organization_payment_info`_: rechazado, obliga a datos bancarios para un flujo que no los necesita y rompe onboarding.
- _`try/except` local por llamada_: rechazado, esparce el patrón y no ataca la clase de bug.

**Evidencia**: `apps/api/services/escritura_operational_bridge.py:541-575` (fetch), `:518-535` (`_assert_lot_scope`), mapeo opcional en `:208-320`. `create_escritura_case_snapshot` traga la excepción en `apps/api/services/escritura_readiness.py:1089-1103`.

---

## R2 · Dónde viven "abogado redactor" y "mandatario" (FR-007, FR-022)

**Decisión**: Datos de **organización**, no de venta. Se cargan en una pantalla de Configuración ("Datos de la organización para escrituras") y se materializan como variables de proyecto con default de organización (reusando el mecanismo de autoría/default ya existente en el catálogo). El `abogado_redactor.*` se puebla al aprobar el molde; `revision_juridica.*` se escribe con la acción explícita del abogado por caso.

**Rationale**: El plan (P1.5, P2.4) y la clasificación canónica de variables ya definen `mandato.*`/`documento.*` como "autoría con default de organización". Pedir el abogado por venta sería fricción repetida.

**Alternativas rechazadas**:

- _Pedir abogado por caso_: rechazado, es el mismo dato en toda la org.
- _Hardcodear el mandatario_: rechazado, varía por organización.

**Evidencia**: gate `legal_review_ready` exige `documento.abogado_redactor.nombre/rut` + `revision_juridica.estado` en `apps/api/services/legal_variable_catalog.py:721`. Hoy nada escribe `revision_juridica.*`; el diálogo manual solo lista 4 claves SAG (`apps/web/src/components/projects/legal/variable-matrix/manual-input-dialog.tsx:29`).

---

## R3 · Cómo se registra la revisión jurídica (FR-007, FR-008)

**Decisión**: Acción dedicada en la mesa del caso: `POST /escritura-matrices/case/{caseId}/legal-review` con body `{decision: 'aprobada'|'rechazada', comentario?}`. Escribe `revision_juridica.estado/aprobada_por/aprobada_at` como resolución `legal_review` scope lote (reusa el camino `_insert_legal_review_decision` que ya audita en `legal_review_decisions`) y refresca el snapshot del caso. Solo rol admin/abogado (validado server-side por RPC `is_org_admin`).

**Rationale**: Reusa infra existente (`legal_review_decisions`, source_type `legal_review`) y lo expone como paso de flujo, no como variable críptica. Es un acto legal → debe auditarse (Principio V).

**Alternativas rechazadas**:

- _Reusar `PUT legal-variables/by-key`_: posible, pero no captura la semántica de "decisión de revisión" ni el comentario de rechazo; se prefiere acción dedicada.
- _Auto-aprobar la revisión_: rechazado, es control legal real que NO se automatiza (principio del plan P6).

**Evidencia**: `_insert_legal_review_decision` en `apps/api/services/legal_variable_resolution.py:1788`; source_type `legal_review` en `:1346`, `:1968`.

---

## R4 · Destinatario de la entrega por Telegram (FR-009, FR-010)

**Decisión**: **Admin siempre** (resuelto por `_resolve_org_admin_user_ids(org)`), **vendedor si tiene Telegram vinculado** (se mantiene `_resolve_case_vendor_user_id`). Se genera una fila `escritura_deliveries` por destinatario. Nunca se marca `sent` una entrega con `recipient_user_id` nulo → estado `unavailable`.

**Rationale**: El usuario pidió explícitamente que la escritura le llegue al administrador. La tabla ya soporta N filas auditadas. Hoy solo apunta al vendedor y con recipient nulo marca "sent" hacia nadie.

**Alternativas rechazadas**:

- _Solo admin_: rechazado, el vendedor también necesita su copia (ya existía).
- _Solo vendedor (actual)_: rechazado, es el bug reportado.

**Evidencia**: `_resolve_case_vendor_user_id` en `apps/api/api/v1/endpoints/escritura_matrices.py:1356`; `deliver_draft` best-effort en `:1680-1692`; entrega en `apps/api/services/escritura_delivery.py`. Admin `prueba@plotify.com` tiene `telegram_chat_id` (verificado). **HG-1** confirma la política final con el usuario.

---

## R5 · "Aprobar molde" en un clic (FR-011, FR-012, FR-013)

**Decisión**: El botón encadena `submit` → `approve` de la matriz del proyecto. Antes del `submit`, auto-aprueba en bloque las variables `proposed` con `confidence >= 0.9` y con evidencia (reusa el endpoint `bulk-approve` existente), listándolas en el diálogo de confirmación. Variables con `confidence < 0.9`, `null`, o en conflicto NO se tocan y siguen exigiendo decisión. Los dos pasos (submit/approve) se colapsan para rol admin; se mantienen separados como opción de organización (separación redactor/aprobador) — configurable, default colapsado.

**Rationale**: `confidence` ya existe en `variable_resolutions` (NUMERIC 0–1). El molde por variable era doble control sobre lo mismo. El umbral 0,9 es el que ya usa el extractor para "alta confianza" (`confidence=0.9` en el resolutor).

**Alternativas rechazadas**:

- _Auto-aprobar todo_: rechazado, perdería control sobre lo dudoso/conflictivo.
- _Mantener variable-por-variable como paso previo obligatorio_: rechazado, es la fricción a eliminar.

**Evidencia**: workflow `draft → submit → legal_review_pending → approve → approved` en `apps/api/api/v1/endpoints/escritura_matrices.py:1856` (submit) y `:1923` (approve). `MoldeProgressHeader` sin `onApproveMolde` en `apps/web/src/components/projects/legal/variable-matrix/variable-matrix.tsx:223`. `confidence` en migración `20260603000100_escrituras_variable_resolution.sql:121`.

---

## R6 · Gates heredados del molde (FR-014)

**Decisión**: El caso hereda del molde aprobado los gates de proyecto (title_verified, sag_plano_verified, sii_verified de matriz) y no los cuenta como pendientes del caso. La mesa del caso solo lista: datos de venta (auto vía puente), geometry_verified del lote, y legal_review_ready. Internamente se siguen evaluando todos los gates (defensa en profundidad); esto es **presentación y conteo**, no se relaja la validación.

**Rationale**: Mezclar los gates ya garantizados por el molde con los del caso produce el "35 pendientes" que abruma. El molde aprobado ya es la garantía de esos datos.

**Alternativas rechazadas**:

- _Relajar los gates de verdad_: rechazado, es un riesgo legal; solo se cambia la presentación.

**Evidencia**: gates en `apps/api/services/legal_variable_catalog.py:681-727` (`READINESS_REQUIRED_VARIABLES_BY_GATE`); readiness en `apps/api/services/escritura_readiness.py`.

---

## R7 · Split de formularios reserva/venta + prefill (FR-015, FR-016)

**Decisión**: Separar en `reservationSchema` (liviano: identificación + contacto + valor; legal opcional; sin notaría/fecha) y `saleSchema` (estricto: legal completo + región/comuna + firma + valor final). Componer el form con secciones compartidas (`ClienteIdentificacion`, `ClienteDomicilio`, `ClienteContacto`) + `FirmaYMonto` solo en venta. El prefill al vender un lote `reservado` lee `initialClientData` desde `lot_records` (fuente canónica: `approve_reservation` ya copia los `cliente_*`); fallback: última `approval_request` de reserva aprobada. Campos editables, aviso "Datos cargados desde la reserva", foco en el primer vacío.

**Rationale**: Reserva es compromiso comercial (no necesita todo lo legal); venta sí. El monolito actual de 478 líneas con `mode` y campos idénticos genera re-tipeo. `lot_records` es la fuente de verdad que la mesa ya lee.

**Alternativas rechazadas**:

- _Dos componentes independientes_: rechazado, duplicaría las secciones compartidas.
- _Prefill desde el payload de la reserva directamente_: se usa como fallback; `lot_records` es más canónico (ya normalizado).

**Evidencia**: `apps/web/src/components/projects/LotReservationForm.tsx` (478 líneas, prop `mode`, un solo `lotReservationSchema`); "Solicitar Venta" abre vacío en `apps/web/src/components/projects/viewer/LotInfoView.tsx:262`.

---

## R8 · Venta desde reserva = confirmación delta (FR-017)

**Decisión**: Cuando la venta viene de una reserva aprobada y el RUT coincide, la notificación al admin muestra el delta ("Ya aprobaste la reserva de {cliente} para el lote {N}; valor final $X — Confirmar / Rechazar"), no el formulario completo. La auto-aprobación (si RUT y valor coinciden con lo reservado) queda como opción de organización, **default OFF** → decisión del usuario en **HG-1**. La venta directa (sin reserva) mantiene la aprobación completa.

**Rationale**: El admin ya aprobó a ese cliente para ese lote en la reserva; re-aprobar el formulario completo es redundante. `sale_mode='reserved'` ya distingue el caso.

**Evidencia**: `sale_mode` se deriva del estado del lote en `apps/api/api/v1/endpoints/approvals.py:249` (`"direct" if lot["estado"]=="disponible" else "reserved"`).

---

## R9 · Máquina de estados de `lots.estado` (FR-018, FR-019)

**Decisión**: Definir transiciones válidas server-side: `disponible → reservado`, `disponible → vendido` (venta directa), `reservado → vendido`, `reservado → disponible` (liberar reserva), `vendido → disponible` solo con liberación explícita auditada. Validar en la capa de servicio/RPC, no solo por RLS. El bulk-update (`handleBulkUpdate`) debe validar `response.ok` y mostrar error. Si el cambio masivo de estado es función real, agregar `estado` (enum) a `lotUpdateSchema` con guard de transición; si no, eliminar la UI de estado masivo (hoy es acción muerta: el schema `.strict()` la rechaza silenciosamente).

**Rationale**: Hay lotes con `sold_at` seteado y `estado='disponible'` (inconsistencia observada). El bulk falla en silencio porque el `fetch` no chequea `.ok` y el schema rechaza `estado`.

**Decisión abierta para el implementador**: por defecto, **eliminar la UI de estado masivo** (es la opción de menor riesgo y no se usa hoy); el cambio de estado de un lote pasa solo por los caminos auditados (reserva/venta/liberación). Si el usuario quiere conservar el bulk, agregar `estado` al schema con guard.

**Evidencia**: `handleBulkUpdate` sin `.ok` en `apps/web/src/components/projects/geometry-viewer/index.tsx:317-338`; `lotUpdateSchema` `.strict()` sin `estado` en `apps/web/src/lib/validations/lot-update.schema.ts`; RPC `approve_sale` setea `estado='vendido'` en migración `20260701000100`.

---

## R10 · Verificación masiva de lotes (FR-026)

**Decisión**: Nueva acción `POST /projects/{projectId}/lots/bulk-verify` con body `{tolerance_pct: number=0.5}`. Auto-verifica (`verified_status='verified_exact'`, `verified_by=admin`, `verified_at=now()`) los lotes cuya diferencia entre superficie/perímetro calculados y oficiales esté dentro de tolerancia, en una transacción auditada. Devuelve `{verified: N, deviated: [lotIds], skipped_no_geometry: [lotIds]}`. Los desviados quedan para el panel de revisión manual existente. Reusa `saveAndVerifyLot` como base de la escritura por lote.

**Rationale**: 53 paneles individuales para confirmar diffs de 0,0% es el mayor desperdicio de tiempo del usuario. La tolerancia protege los casos reales de desviación.

**Alternativas rechazadas**:

- _Auto-verificar todo sin tolerancia_: rechazado, un lote realmente desviado del plano no debe auto-aprobarse.

**Evidencia**: `saveAndVerifyLot` (individual) en `apps/web/src/actions/lot-verification.action.ts:190`; panel de verificación en `LotVerificationPanel.tsx` (bien hecho, se conserva para desviados).

---

## R11 · Seguridad: revocar grants + bucket privado (FR-027, FR-028)

**Decisión**: Migración que `REVOKE EXECUTE ON FUNCTION public.get_decrypted_bot_token(uuid), public.decrypt_credential(text), public.get_mcp_credentials(uuid,uuid,text) FROM anon, authenticated;` y las llama solo con service_role desde el backend. Pasar el bucket `project-files` a `public=false` y servir sus objetos con URLs firmadas (mismo patrón que `documents`). **HG-2** aprueba antes de aplicar.

**Rationale**: Con la anon key del bundle, hoy cualquiera extrae el token de Telegram descifrado. Los dominios vigentes (PII de dueños) están en un bucket público. Gate duro de piloto.

**Alternativas rechazadas**:

- _Confiar en la ofuscación del UUID del path_: rechazado, seguridad por oscuridad.

**Evidencia**: advisors Supabase (`get_advisors security`): `anon_security_definer_function_executable` en las 3 funciones; `public_bucket_allows_listing` en `project-files`. Cuerpos de las funciones sin validación de caller (verificado). `approve_sale`/`approve_reservation` SÍ validan `is_org_admin` → revocar por higiene, no urgente.

---

## R12 · Rama base y relación con 015 (Assumption)

**Decisión**: Partir desde la rama `016-pipeline-remediacion-ux` creada desde `main`. Rebasar/mergear 015 primero si sus 41 archivos en vuelo ya están commiteados (los formularios de 015 ya piden nacionalidad/región/comuna, que P1.1 necesita). **Decisión operativa del usuario**; el feature no depende de código no committeado.

**Rationale**: Evita conflicto con el rediseño de identidad en curso. La migración y los cambios de API son independientes de 015.

**Evidencia**: `git status` mostró 41 archivos modificados en `015-rediseno-identidad-ui`; los tests que fallan (2) son de esa rama.

---

## Preguntas para el usuario (Human Gates)

- **HG-1**: ¿La venta desde reserva con RUT+valor coincidentes se auto-aprueba, o siempre muestra el delta para confirmar? (default propuesto: mostrar delta, no auto-aprobar). ¿Vendedor recibe copia por Telegram además del admin? (default propuesto: sí, si tiene Telegram).
- **HG-2**: aprobar la migración de seguridad (revoke + bucket privado) y la limpieza de datos de prueba de Teno.
- **HG-3**: sesión de usabilidad con usuario nuevo (SC-003/004/005).
