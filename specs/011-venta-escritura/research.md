# Research: Venta → Escritura — Matriz del Proyecto y Borrador Automatico

**Branch**: `011-venta-escritura` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: decisiones diferidas D1/D2/D3 del checklist de requisitos
([checklists/requirements.md](./checklists/requirements.md) §Notes) + anclaje
en el codigo real revisado el 2026-06-15.

Este documento resuelve las incognitas tecnicas antes del plan. Cada
decision cita el codigo o esquema vigente como evidencia, no como eleccion
abierta. Regla heredada: motor SDD 008 y superficie SDD 010 se reutilizan;
cero re-arquitectura.

---

## D1 — Modelado fisico de la matriz del proyecto

**Pregunta**: hoy `escritura_matrices` nace por lote/caso. ¿Como se modela
una matriz a nivel proyecto ("esperando ventas") sin duplicar el motor?

**Evidencia en el codigo**:

- `escritura_matrices` exige `escritura_case_id UUID NOT NULL` y tiene un
  indice unico parcial "una matriz activa por caso"
  ([20260611000100_creador_matriz.sql:65,84](../../packages/database/supabase/migrations/20260611000100_creador_matriz.sql)).
- `variable_resolutions` ya admite scope proyecto: `lot_id` y
  `escritura_case_id` son **nullable**
  ([20260603000100_escrituras_variable_resolution.sql:112-113](../../packages/database/supabase/migrations/20260603000100_escrituras_variable_resolution.sql)).
  La "matriz de variables del proyecto" por tanto ya es modelable sin
  migracion.
- El resolutor y la mesa consumen una `MatrizView` (clause_order +
  clause_overrides + resolution manifest); no dependen de que exista un
  caso, solo de un snapshot de variables.

**Decision**: reutilizar `escritura_matrices` haciendo
`escritura_case_id` **nullable**. Semantica:

- `escritura_case_id IS NULL` → **matriz del proyecto** (scope proyecto;
  resuelta contra el snapshot de variables del proyecto; datos de venta
  como huecos).
- `escritura_case_id IS NOT NULL` → **borrador del lote** (instanciado al
  validar la venta; igual que hoy).

Migracion aditiva acotada (la unica excepcion que el spec autoriza):

1. `ALTER TABLE escritura_matrices ALTER COLUMN escritura_case_id DROP NOT NULL`.
2. Nuevo indice unico parcial: una matriz de proyecto activa por proyecto
   — `UNIQUE (project_id) WHERE escritura_case_id IS NULL AND status <> 'superseded'`.
   (El indice "una activa por caso" existente ya excluye los NULL por la
   semantica de UNIQUE en Postgres, asi que no colisiona.)
3. Nueva columna `source_project_matriz_id UUID NULL REFERENCES
escritura_matrices(id)` en el borrador del lote: traza desde que matriz
   del proyecto (y version) se instancio (FR-012).

**Alternativa rechazada**: tabla nueva `escritura_project_matrices`.
Duplicaria todo el modelo (clause_order, clause_overrides, status,
versionado, workflow de aprobacion) y obligaria a la mesa, el resolutor y
el renderer a ramificar sobre dos formas. Reusar conserva **un solo motor**
(constitucion: contratos tipados, cero re-arquitectura).

**Instanciacion del borrador del lote** (al validar venta): copia
`clause_order` y `clause_overrides` de la matriz del proyecto aprobada,
fija `source_project_matriz_id` + version, y toma el snapshot de variables
del lote (proyecto + datos de venta del puente operacional). No re-deriva
texto: hereda lo aprobado.

---

## D2 — Canal de entrega al vendedor (Telegram + web)

**Pregunta**: ¿enlace, archivo, o ambos? ¿Como se entrega sin que ninguna
via omita el warning legal ADR-009?

**Evidencia en el codigo**:

- `TelegramClient` solo expone `send_text`, `answer_callback_query`,
  `edit_message_text`
  ([integrations/telegram_client.py:36,166,199](../../apps/api/integrations/telegram_client.py)).
  No hay envio de archivos.
- El DOCX vive en el bucket `documents` (Supabase Storage), registrado en
  `escritura_minuta_generations` con `storage_path`.
- La asignacion de vendedores (constitucion V) ya aisla por vendedor.

**Decision**: entrega de **dos niveles**, con el enlace como garantia:

1. **Enlace seguro con vencimiento** (siempre): signed URL de Storage o
   token propio con TTL; es la via que no falla por restricciones de canal.
2. **Archivo adjunto** (best-effort): nuevo `send_document` en
   `TelegramClient` (Bot API `sendDocument`, soporta DOCX < 50 MB); si el
   canal o el vinculo del vendedor no lo permite, cae al enlace sin fallar
   en silencio (edge case del spec).
3. **Vista web "mis documentos del vendedor"**: reusa el scope de vendedor;
   lista solo los borradores de SUS ventas (FR-011), con descarga,
   compartir y renovar enlace vencido.

Cada entrega se audita en una tabla nueva `escritura_deliveries` (quien, a
quien, canal, enlace, vencimiento, estado, timestamps — FR-010/FR-012).
Toda via lleva la marca de "borrador sujeto a revision legal" embebida en
el DOCX por el renderer actual (ADR-009 intacto, FR-008).

**Alternativa rechazada**: solo archivo por Telegram. Falla si el vendedor
no tiene Telegram vinculado (edge case explicito) y no da control de
vencimiento ni vista web. El enlace es el minimo constitucional.

---

## D3 — Punto exacto de enganche en la validacion de venta

**Pregunta**: ¿donde se dispara "al validar la venta, generar el borrador"
sin invertir el orden actual (huevo-y-gallina del panel de readiness)?

**Evidencia en el codigo**:

- Hoy el caso se crea a mano: `POST /api/projects/{projectId}/escritura-cases`
  desde el panel, que exige verificaciones en verde **antes** de crear el
  caso aunque los datos de venta se proponen **al** crearlo
  ([escritura-readiness-panel.tsx:169](../../apps/web/src/components/projects/legal/escritura-readiness-panel.tsx)).
- El puente operacional ya mapea `lot_records` (+ payment info) →
  `comprador.*` / `transaccion.*` y expone una etapa de proposicion
  (`stage_operational`, `escritura_operational_bridge.py`).
- La venta se registra en `lot_records` y pasa por aprobacion
  administrativa (paneles de aprobaciones + notificaciones existentes,
  `mvp-sale` / `mvp-approval`).

**Decision**: enganchar en la **transicion de la venta a "validada" por el
administrador** (aprobacion del registro en `lot_records`). En ese unico
punto, de forma idempotente:

1. Crear el `escritura_case` del lote si no existe (auto, sin paso manual).
2. Correr el puente operacional (`stage_operational`) → propone
   comprador/precio/lote desde el formulario de venta (cero digitacion).
3. Instanciar el borrador del lote desde la **matriz del proyecto
   aprobada** (D1) si existe; si no, dejar la escritura en preparacion con
   el pendiente "Falta aprobar la matriz del proyecto" accionable.
4. Notificar al administrador con deep link a la mesa.

Esto **corrige el orden invertido** (FR-006): el caso existe primero, las
verificaciones se evaluan despues sobre los datos propuestos. La validacion
comercial de la venta **nunca** se bloquea por lo legal (FR-005): sin
matriz aprobada la venta se valida igual y la escritura espera.

**Alternativa rechazada**: disparar al "vender" (antes de la validacion
del administrador). Generaria borradores de ventas no validadas y rompe el
control administrativo del flujo. El enganche es la validacion, no la
solicitud.

---

## Decisiones menores derivadas

- **Estados unificados** (FR-014, US5): se extiende el diccionario de
  microcopy de SDD 010 (`legal_microcopy.py` + `matriz-microcopy.ts`) con
  los estados del flujo (esperando matriz del proyecto / en preparacion /
  borrador por revisar / aceptada / entregada). Sin tabla de estados nueva:
  derivados de `case_status` + estado de la matriz + entregas.
- **Inmutabilidad de generaciones** (edge case): una nueva version de la
  matriz del proyecto NO regenera borradores ya aceptados/entregados
  (`escritura_minuta_generations` es inmutable); los borradores en
  preparacion/revision usan la nueva version con aviso humano.
- **Notificaciones**: se reusa el centro de notificaciones existente +
  Telegram; sin canal nuevo, solo nuevos tipos de evento con vocabulario
  del diccionario unico.

---

## Resumen de impacto

| Area                                                    | Cambio                                                                     | Tipo                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------ |
| `escritura_matrices`                                    | `escritura_case_id` nullable + indice parcial + `source_project_matriz_id` | Migracion aditiva acotada (D1) |
| `escritura_deliveries`                                  | Tabla nueva de entregas auditadas                                          | Migracion aditiva (D2)         |
| `TelegramClient`                                        | `send_document` + enlace seguro con TTL                                    | Codigo (D2)                    |
| Puente operacional + validacion de venta                | Enganche idempotente al validar                                            | Codigo (D3)                    |
| Mesa / resolutor / renderer (SDD 010/008)               | **Sin cambios** de motor; se reusan                                        | Cero                           |
| Diccionario de microcopy                                | Estados del flujo aditivos                                                 | Codigo                         |
| Web: seccion Documentos + "mis documentos del vendedor" | Navegacion nueva, reusa la mesa                                            | Codigo                         |
