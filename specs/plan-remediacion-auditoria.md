# Plan de remediación — Auditoría E2E del pipeline venta→escritura

> Fecha: 2026-07-06 · Proyecto de referencia: Teno (`aad0fbf2-ceda-47bc-954a-b3f5f2ac8797`)
> Basado en la auditoría E2E real (Playwright + cuentas admin/vendedor) y revisión de código.

Orden por impacto: **P0 = el pipeline no funciona sin esto**, luego correctitud, UX, seguridad y salud de código.

---

## P0 — Desbloquear venta→escritura (1 fix, máxima palanca)

### P0.1 · El puente operacional revienta siempre → ninguna venta puebla variables

- **Causa raíz:** `_fetch_operational_rows` (`apps/api/services/escritura_operational_bridge.py:575`) hace `payment_result.data`, pero `maybe_single().execute()` de supabase-py devuelve **`None`** cuando hay 0 filas, y la org no tiene fila en `organization_payment_info`. → `AttributeError` tragado por el `try/except` de `create_escritura_case_snapshot` (`escritura_readiness.py:1096`) → el puente nunca mapea comprador/precio/lote/servidumbre → todo caso queda `variables_pending` con ~35 huecos.
- **`payment_info` es OPCIONAL** en todo el mapeo (solo enriquece `transaccion.detalle_pago[]`); su ausencia no debe bloquear nada.
- **Solución:**
  1. Helper defensivo para resultados de PostgREST:
     ```python
     def _safe_data(result: Any) -> Any:
         return getattr(result, "data", None) if result is not None else None
     ```
     y usarlo en `_fetch_operational_rows` (los 3 `.data`) y en `_assert_lot_scope:532`.
  2. Auditar los **36 usos de `maybe_single`** del API con el mismo patrón (grep) y aplicar el guard donde el resultado puede ser `None`.
  3. Cambiar el `except Exception` silencioso del snapshot para que **cuente los huecos poblados**; si el puente puebla 0 variables cuando debería poblar N, loguear a nivel `error`, no `warning` (que hoy lo esconde).
- **Verify:** re-correr el hook para el lote 14 (`stage_operational_variables`) y confirmar filas `lot_id`-scoped en `variable_resolutions`; el caso debe pasar de `variables_pending` a `ready_for_minuta` (salvo huecos legítimos).
- **Efecto:** desbloquea **el hook automático de la venta Y el botón "Verificar" de la mesa** (ambos usan el mismo `_fetch_operational_rows`).

---

## P1 — Correctitud del pipeline

### P1.1 · Fuga de datos del comprador (nacionalidad/región/comuna)

- **Causa:** el form rediseñado (rama 015) envía `cliente_nacionalidad/region/comuna`, pero `SalePayload` y `ReservationPayload` (`apps/api/schemas/approval.py:6,33`) no las declaran → FastAPI las descarta. Además `lot_records` no tiene columnas para ellas, y el puente no mapea `comprador.nacionalidad`.
- **Solución (cadena completa):**
  1. Agregar los 3 campos como `Optional[str]` en ambos payloads Pydantic + regenerar contrato (`pnpm contracts:generate`).
  2. Migración: columnas `cliente_nacionalidad`, `cliente_region`, `cliente_comuna` en `lot_records`.
  3. RPC `approve_sale`/`approve_reservation`: copiar los nuevos campos al `INSERT ... ON CONFLICT` (mismo patrón que la migración `20260701000100`).
  4. Puente: mapear `comprador.nacionalidad` desde `lot_records.cliente_nacionalidad` en `map_lot_record_variables` (`escritura_operational_bridge.py:240`). Decidir si región/comuna se concatenan a `comprador.domicilio` o quedan como metadatos (no son token de escritura hoy).
  5. Copiar también `notaria`/`fecha_firma` del payload a `lot_records` (hoy se pierden).
- **Verify:** venta nueva → `variable_resolutions` del lote incluye `comprador.nacionalidad` con valor.

### P1.2 · Los gates no se re-evalúan → casos viejos quedan bloqueados para siempre

- **Causa:** casos del 1-jul siguen `blocked` acusando `comprador.nombre/rut` faltantes aunque `lot_records` los tiene, y `project_matriz_approved` bloqueado aunque la matriz se aprobó después. No hay recompute al aprobar la matriz ni al llegar datos.
- **Solución:**
  1. Al **aprobar la matriz de proyecto**, encolar un job que re-corra `create_escritura_case_snapshot(stage_operational=True)` para todos los casos `variables_pending` del proyecto.
  2. El botón "Verificar" de la mesa (`mesa-encabezado.tsx:164`) debe llamar `POST /escritura-matrices/case/{id}/stage-operational` (endpoint ya existe) y refrescar; hoy no está cableado a nada.
  3. Backfill puntual (con OK del usuario) de los 2 casos ya bloqueados de Teno.
- **Verify:** aprobar matriz → casos pendientes pasan a recomputar y destraban los gates con datos reales.

### P1.3 · Entrega por Telegram apunta al vendedor, no al administrador

- **Causa:** `_resolve_case_vendor_user_id` (`escritura_matrices.py:1356`) resuelve el vendedor de la venta; el usuario espera la escritura **en el Telegram del admin**. Con `recipient_user_id` NULL la entrega web queda "sent" hacia nadie y `/mis-documentos` sale vacío.
- **Solución:**
  1. Decidir destinatario(s): admin de la organización (tiene `telegram_chat_id`), y opcionalmente el vendedor. Recomendado: **ambos** — admin siempre, vendedor si tiene Telegram vinculado.
  2. Agregar `_resolve_org_admin_user_ids(org)` y entregar a cada uno (la tabla `escritura_deliveries` ya soporta N filas auditadas).
  3. Nunca marcar `sent` una entrega con `recipient_user_id` NULL: si no hay destinatario, estado `unresolved` + alerta.
- **Verify:** generar minuta → llega documento al Telegram del admin + fila `sent` con recipient no nulo.

### P1.4 · Estado del lote inconsistente + bulk-update que falla en silencio

- **Causa A:** `handleBulkUpdate` (`geometry-viewer/index.tsx:317`) envía `{ estado }` pero `lotUpdateSchema` (`lot-update.schema.ts`) es `.strict()` y **no declara `estado`** → 400; el `fetch` no chequea `.ok` → la UI cree que cambió y no cambió nada.
- **Causa B:** hay lotes con `sold_at` seteado y `estado='disponible'` (updated_at anterior a sold_at) → sin máquina de estados que impida transiciones inválidas.
- **Solución:**
  1. Definir transiciones válidas de `lots.estado` (disponible→reservado→vendido, con liberación explícita) y validarlas server-side, no solo por RLS.
  2. Si el cambio masivo de estado es una función real: agregar `estado` (enum) a `lotUpdateSchema` con guard de transición; si no, **eliminar la UI de estado masivo** del `BulkActionsPanel` (hoy es una acción muerta).
  3. Hacer que `handleBulkUpdate` valide `response.ok` y muestre error/toast en fallo.
- **Verify:** intento de transición inválida → error visible; estado del lote y `sold_at` siempre coherentes.

### P1.5 · El gate de revisión jurídica no tiene camino en el producto 🔴 (descubierto 2026-07-06)

- **Causa:** `legal_review_ready` exige `documento.abogado_redactor.nombre/rut` + `revision_juridica.estado` (`legal_variable_catalog.py:721`), pero **ningún código escribe `revision_juridica.*`** y el diálogo "Ingresar dato manual" solo permite 4 claves SAG/plano (`manual-input-dialog.tsx:29`). El caso demo pasó porque sus variables se sembraron por script. → Aún con P0 arreglado, **todo caso nuevo queda bloqueado en revisión jurídica sin salida desde la UI**.
- **Solución:**
  1. **Abogado redactor** = dato de organización (junto con P2.4: misma pantalla de Configuración que mandatario/datos bancarios), staged como variable de proyecto con default de org.
  2. **Revisión jurídica** = acción explícita en la mesa del caso: botón "Aprobar revisión jurídica" (solo admin/abogado) que escriba `revision_juridica.estado='aprobada'` + `aprobada_por` + `aprobada_at` como resolución del caso (reusar `PUT legal-variables/by-key` con scope lote o una acción dedicada auditada en `legal_review_decisions`). Con rechazo y comentario como contraparte.
  3. El estado del caso debe mostrar "Esperando revisión jurídica" como paso visible del flujo, no como variable críptica faltante.
- **Verify:** venta nueva → caso pasa a "Esperando revisión jurídica" → abogado aprueba desde la mesa → `ready_for_minuta` sin tocar SQL.

---

## P2 — Fricción de UX para abogados y administradores

> Objetivo: que configurar el molde y aprobar ventas sea guiado y sin callejones sin salida.

### P2.1 · "Aprobar molde" es un botón muerto

- **Causa:** `MoldeProgressHeader` se renderiza **sin** el prop `onApproveMolde` (`variable-matrix.tsx:223`) → `onClick` undefined → 0 llamadas.
- **Solución:** cablear `onApproveMolde` a `POST /escritura-matrices/{matrizId}/submit` + `/approve` (endpoints ya existen). Tras aprobar, mostrar estado "Molde aprobado · esperando ventas" y deshabilitar el botón. Manejar el caso "faltan huecos" con mensaje claro.

### P2.2 · Dos CTAs de generación, una deshabilitada sin explicación

- **Causa:** el header de la mesa tiene "Generar escritura" **deshabilitado sin tooltip**; el que funciona es "Generar minuta" en el panel lateral.
- **Solución:** unificar a **un** CTA. Si está deshabilitado, tooltip con la razón ("Faltan N datos" / "Molde no aprobado"). Reusar el modal "Declaración legal" (que está bien).

### P2.3 · El proyecto sigue "Borrador — falta cargar geometría" con todo cargado

- **Causa:** el estado de preparación (`overview-tab.tsx`) no refleja que hay 53 lotes, matriz aprobada y ventas.
- **Solución:** derivar el estado real (geometría cargada / matriz aprobada / ventas) y mostrar un checklist de preparación con pasos completados en verde. Quitar el CTA "Habilitar Ventas" si ya hay ventas.

### P2.4 · Falta UI para los "datos de la organización" que el pipeline necesita

- **Causa:** `organization_payment_info` (datos bancarios para forma de pago) y el **mandatario** por defecto no tienen pantalla; hoy solo se pueblan por SQL. Su ausencia rompió el puente (P0).
- **Solución:** pantalla en Configuración → "Datos de la organización para escrituras": razón social, RUT, banco/cuenta, mandatario por defecto. Opcional pero, si falta, el pipeline no debe romperse (ya cubierto en P0).

### P2.5 · Formularios de reserva y venta: parecidos pero NO iguales + prefill desde la reserva

- **Requerimiento del usuario (2026-07-06):** reserva y venta deben ser formularios distintos, y al concretar una venta sobre un lote reservado, los datos de la reserva deben venir pre-cargados.
- **Estado actual (verificado):** `LotReservationForm.tsx` es UN componente con prop `mode` y campos idénticos para ambos modos, todos obligatorios por el único `lotReservationSchema`. Con lote `reservado`, "Solicitar Venta" (`LotInfoView.tsx:262`) abre el mismo form **vacío** → el vendedor re-tipea todo.
- **Solución:**
  1. **Separar schemas y secciones:**
     - `reservationSchema` (liviano): identificación (nombre, RUT) + contacto (email/teléfono) + valor de reserva. Los datos legales (domicilio completo, estado civil, nacionalidad, ocupación) pasan a **opcionales** — la reserva es un compromiso comercial, no la escritura. Sin notaría/fecha de firma.
     - `saleSchema` (estricto): todo lo legal obligatorio + región/comuna + firma (notaría, fecha) + valor final.
     - Componer el form con secciones compartidas (`ClienteIdentificacion`, `ClienteDomicilio`, `ClienteContacto`) + secciones por modo (`FirmaYMonto` solo venta). Esto además elimina la duplicación actual del componente monolítico de 478 líneas.
  2. **Prefill al vender un lote reservado:** cuando `estado === 'reservado'` y se abre modo venta, cargar `initialClientData` desde **`lot_records`** del lote (fuente canónica: `approve_reservation` ya copia los `cliente_*`; el visor ya lee `etapa_proceso` de ahí). Fallback: payload de la última `approval_request` de reserva aprobada. Campos pre-poblados y **editables**, con aviso "Datos cargados desde la reserva — verifica y completa lo que falte" y foco automático en el primer campo vacío.
  3. Región/comuna se podrán prefillear completos recién cuando P1.1 agregue sus columnas a `lot_records` (mientras tanto, prefill parcial de lo que exista).
  4. Al enviar venta sobre reserva: `sale_mode='reserved'` + `previous_lot_state='reservado'` (el RPC `approve_sale` valida contra el estado previo — verificar que el action web lo envíe correcto en este camino).
- **Verify:** reservar lote → aprobar → abrir "Solicitar Venta" → el form llega con nombre/RUT/contacto de la reserva pre-cargados; solo se completa lo legal y la firma. Reserva nueva pide ~la mitad de los campos que hoy.

### P2.6 · Sidebar sin scoping por rol

- **Causa:** el vendedor ve Escrituras/Vendedores/Agente/Configuración y entra a `/documentos` completo (mesa, plantillas).
- **Solución:** filtrar `navItems` (`app-sidebar.tsx:31`) por rol; ocultar mesa/plantillas/vendedores al `user`. Complementar con guard server-side en las rutas (no solo ocultar en UI).

### P2.7 · Carga lenta sin feedback + naming

- Tab Legal: >5s "Cargando variables..." sin skeleton → agregar skeleton.
- Historial de minutas: actor sale como "Usuario registrado" genérico → mostrar nombre real (`profiles.first_name/last_name`).
- Menú "Leads" apunta a `/clients` (no es bug, pero unificar naming ruta↔label).

---

## P3 — Seguridad (independiente del pipeline, pero crítico)

### P3.1 · Funciones de descifrado ejecutables por `anon` 🔴

- **Causa:** `get_decrypted_bot_token`, `decrypt_credential`, `get_mcp_credentials` son `SECURITY DEFINER`, **ejecutables por `anon`** y **no validan al caller**. Con la anon key (en el bundle web) se puede `POST /rest/v1/rpc/get_decrypted_bot_token` y recibir el token de Telegram descifrado / credenciales MCP.
- **Solución:** migración `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated;` para las 3. Llamarlas solo con service_role desde el backend. (Nota: `approve_sale`/`approve_reservation` también quedan expuestas pero **sí** validan `is_org_admin` internamente → ahí es solo ruido de advisor, opcional revocar por higiene.)

### P3.2 · Bucket `project-files` público con documentos legales

- **Causa:** bucket `public=true` con 29 docs legales por `project_id` (dominio vigente con PII de dueños); única barrera = UUID difícil de adivinar.
- **Solución:** pasar el bucket a privado y servir con URLs firmadas (mismo patrón que `documents`/minutas, que ya es privado). Revisar las policies de `storage.objects`.

### P3.3 · Higiene menor

- 5 tablas públicas sin RLS (`checkpoint_*`, `dead_letter_queue`, internas de LangGraph): habilitar RLS o mover de `public`. Riesgo bajo.
- 3 funciones con `search_path` mutable → fijar `search_path`.
- Perf/RLS: 33 `auth_rls_initplan` (envolver `auth.uid()` en `(select auth.uid())`) + 438 `multiple_permissive_policies` (consolidar policies solapadas). No urgente, pesa a escala.

---

## P4 — Salud de código

- **Código muerto (borrar):** `generation-wizard.tsx` (1.171 líneas, 0 refs), `reserve-lot.action.ts` (0 refs).
- **Duplicación:** `requestReservationApproval` vs `requestSaleApproval` (`request-approval.action.ts`) ~110/160 líneas idénticas → extraer helper `buildApprovalRequest(mode, ...)`.
- **Contrato (Principio IV):** el mirror `variable-resolution-types.ts` (759 líneas) sigue importado por 22 archivos → migrar al cliente generado.
- **Monolito API:** `escritura_matrices.py` (2.283 líneas) mezcla endpoint + entrega + resolución de vendedor + labels → separar en módulos. (Contraste positivo: `components/documents/mesa/` está bien descompuesto — usar de referencia.)
- **Tests que ocultan bugs:** el FakeStore no ve el `maybe_single`-None ni los campos Pydantic descartados (los 2 bugs P0/P1.1). Agregar tests de contrato contra Supabase real para el camino venta→escritura.
- **Otros:** 52 `console.log` en `src` para limpiar; 2 tests web fallando en rama 015 (raw-colors-guard en `documents-tab`; test frágil que grepa `max-h-[80vh]` — reemplazar por test de comportamiento).

---

## P5 — Faltantes para piloto de PRODUCCIÓN con usuarios nuevos (evaluación 2026-07-06)

> El plan P0–P2 deja el flujo operativo para un proyecto YA configurado (como Teno). Para poner gente
> que nunca vio la plataforma, faltan además:

### P5.1 · Guard de venta sobre lote no verificado

- Hoy el vendedor puede vender un lote `draft` (46 de 53 en Teno); el caso se bloquea DESPUÉS en `geometry_verified` y nadie le avisa. → Aviso pre-venta en el panel del lote ("Este lote aún no tiene cabida/deslindes verificados; la escritura quedará en espera") o bloqueo configurable. El admin debe ver qué lotes faltan por verificar desde el checklist del proyecto (P2.3).

### P5.2 · Setup de Telegram con UI

- El pipeline depende del bot de la org (`telegram_bots`, hoy poblado a mano/RPC) y del `telegram_chat_id` de admin/vendedor. Sin pantalla de conexión guiada ("Conecta tu Telegram" con deep link al bot + verificación), un usuario nuevo no puede recibir aprobaciones ni escrituras. Incluirlo en Configuración junto a P2.4.

### P5.3 · Camino guiado de configuración inicial (proyecto nuevo desde cero)

- La auditoría probó Teno ya configurado. La fase previa (subir dominio/certificados → extracción por visión → aprobar título → aprobar variables → aprobar molde) existe pero sin narrativa para novatos: hay que saber el orden. → Checklist global del proyecto (extensión de P2.3): Documentos → Título → Variables → Molde aprobado → Lotes verificados → Habilitado para ventas, cada paso con su CTA y estado. El componente `PreparacionMatriz` (SDD 011) ya apunta en esa dirección; falta unificarlo como "camino del proyecto".

### P5.4 · Pre-requisitos duros de producción

- **Seguridad P3.1 y P3.2 ANTES de exponer a terceros** (hoy cualquiera con la anon key extrae el bot token; los dominios vigentes con PII están en bucket público).
- Limpiar datos de prueba de Teno (lotes 26/37 inconsistentes, venta de auditoría del lote 14, minuta demo lote 1) o usar un proyecto/org limpio para el piloto.
- Estabilizar la rama 015: commitear los 41 archivos en vuelo y dejar verdes los 2 tests que fallan.
- Definir entorno: el piloto correrá contra la MISMA base que hoy es dev (swkrnjdpnlrgxgotmfxy) — decidir si se separa prod/staging antes de invitar usuarios reales.

---

## P6 — Destrancar el pipeline: aprobar menos, heredar más (evaluación 2026-07-06)

> Diagnóstico: para llegar de proyecto nuevo a escritura entregada hay ~10 tipos de aprobación humana
>
> - verificación lote-por-lote (53 en Teno). Cuatro son redundantes y una escala linealmente sin necesidad.
>   Principio rector: **cada dato se aprueba UNA vez, al nivel más alto, con la evidencia a la vista; todo lo
>   de abajo se hereda**. Lo legalmente importante NO se toca: primera aprobación comercial del admin,
>   revisión jurídica del abogado, título, y lotes cuya cabida se desvía del plano.

### P6.1 · Verificación de lotes: masiva por tolerancia + just-in-time (el mayor ahorro: 53 → ~2 acciones)

- **Hoy:** `saveAndVerifyLot` es individual; verificar Teno = abrir 53 paneles y confirmar diffs de 0,0%.
- **Solución:**
  1. Acción masiva "Verificar los N lotes que coinciden con el plano" — auto-verifica los que tienen diff CALC vs oficial dentro de tolerancia (default 0,5%, configurable), en una transacción auditada (`verified_by = admin`, `verified_status = verified_exact`). Pantalla resumen: N verificados, M desviados para revisión manual.
  2. Los desviados quedan en cola de revisión manual (el panel actual, que está bien hecho).
  3. **Just-in-time:** no exigir el loteo completo verificado para operar; si se vende un lote no verificado, el guard P5.1 lo pide en ese momento.

### P6.2 · Aprobar el molde absorbe las variables (y submit+approve = 1 clic)

- **Hoy:** doble control sobre lo mismo: aprobar variable por variable (bulk ~13 decisiones) Y DESPUÉS enviar (submit) y aprobar (approve) el molde — 2 endpoints, 2 pasos, misma persona.
- **Solución:**
  1. El flujo por defecto es revisar el **documento renderizado** (la mesa), no la lista de variables. Al aprobar el molde, auto-aprobar las variables `proposed` de confianza ≥0,9 con evidencia, listándolas en el diálogo de confirmación ("al aprobar, apruebas estas 9 variables extraídas — ver detalle"). La matriz por variable queda como drill-down para corregir, no como checklist previo.
  2. Colapsar submit+approve en un solo botón cuando el usuario tiene rol admin; mantener los 2 pasos solo como opción de org (separación redactor/aprobador).
- **No tocar:** las variables de confianza baja o con conflicto siguen exigiendo decisión explícita.

### P6.3 · Venta sobre reserva aprobada = confirmación delta, no segunda aprobación completa

- **Hoy:** el admin aprueba la reserva del cliente X para el lote Y, y días después aprueba OTRA VEZ la venta del mismo cliente para el mismo lote (`sale_mode='reserved'`, approvals.py:249) con el formulario completo.
- **Solución:** cuando la venta viene de una reserva aprobada y el RUT coincide, la notificación al admin muestra solo el **delta** ("Ya aprobaste la reserva de {cliente} para el lote {N}; la venta fija el valor final en $X — Confirmar / Rechazar"). Opcional por org: auto-aprobar si RUT y valor coinciden con lo reservado. La venta directa (sin reserva) mantiene la aprobación completa.
- **Sinergia con P2.5:** prefill del formulario + aprobación delta = vender un lote reservado pasa de re-tipear todo + re-aprobar todo a completar lo legal + un tap de confirmación.

### P6.4 · Revisión jurídica y "Declaración legal": un solo acto formal

- **Hoy (con P1.5):** el abogado aprobaría la revisión jurídica en la mesa Y ADEMÁS el modal "Declaración legal — Confirmo y genero" repite la misma declaración al generar.
- **Solución:** con revisión jurídica **registrada**, generar directo sin modal (la declaración era el sustituto informal cuando no existía revisión formal). El modal queda solo para el camino excepcional de generar sin revisión registrada.

### P6.5 · Gates del caso: mostrar solo lo accionable

- **Hoy:** el caso muestra 8 gates / "35 pendientes", mezclando lo que ya garantizó el molde aprobado (título, SAG, SII-matriz) con lo específico del caso.
- **Solución:** los gates de proyecto se heredan del molde aprobado y no se re-muestran como pendientes del caso; el caso solo lista lo suyo: datos de la venta (auto vía puente), lote verificado, revisión jurídica. Con P0+P1 funcionando, un caso típico debería mostrar **1-2 acciones humanas**, no 35 ítems.
- Nota: internamente se pueden seguir evaluando todos los gates (defensa en profundidad); esto es presentación y conteo de pendientes.

### Resultado esperado

- Configurar un proyecto: de ~60+ acciones (13 variables + 2 pasos molde + 53 lotes) a **~10** (título + manuales + 1 aprobación de molde + lotes desviados).
- Vender un lote reservado: de 4 aprobaciones/formularios completos a **2 actos reales** (confirmación delta del admin + revisión jurídica del abogado) y la generación directa.

---

## Secuencia recomendada

1. **Sprint 1 (pipeline funciona de punta a punta):** P0.1 → P1.1 → P1.2 → P1.3 → **P1.5**. Al final, una venta nueva genera y entrega la escritura con la revisión jurídica como paso visible, sin tocar SQL.
2. **Sprint 2 (sin fricción para novatos):** P2.1+P6.2 (molde: 1 clic que absorbe variables), P2.2+P6.4 (un CTA de generación, sin doble declaración), P2.3+P5.3 (camino del proyecto), P2.4+P5.2 (config org + Telegram), P2.5+P6.3 (formularios+prefill+aprobación delta), **P6.1 (verificación masiva de lotes)**, P6.5 (gates heredados), P2.6, P5.1 + P1.4.
3. **Sprint 3 (pre-producción):** P3.1, P3.2 (bloqueantes del piloto) → P5.4 (limpieza + rama estable) → P3.3, P4.
4. **Piloto de producción** recién al cierre del Sprint 3.

> Nota P6: las reducciones de fricción van pareadas con su fix funcional (mismo archivo/pantalla) para no
> pasar dos veces por el mismo código. P6.1 es el quick-win más visible para el usuario final.

## Datos de prueba a limpiar (con OK del usuario)

- Lote 14 quedó `vendido` a "Cliente Prueba Auditoria" (caso `bbff03cf`) y se generó una minuta en el caso demo del lote 1 durante la auditoría.
