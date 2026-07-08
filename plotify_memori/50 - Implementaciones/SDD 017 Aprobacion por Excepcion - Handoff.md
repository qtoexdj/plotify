---
title: SDD 017 Aprobacion por Excepcion - Handoff
aliases:
  - SDD 017 Cascada Venta Minuta
  - Aprobacion por Excepcion
date: 2026-07-08
status: validado en Teno real
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - ventas
  - telegram
  - legal
related:
  - "[[SDD 016 Pipeline Remediacion UX - Handoff]]"
  - "[[SDD 011 Venta-Escritura - Handoff]]"
  - "[[SDD 010 Mesa de Escritura - Handoff]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
---

# SDD 017 Aprobacion por Excepcion - Handoff

## Estado

Implementado y validado en `specs/017-aprobacion-por-excepcion`.
T001-T035 estan cerrados. T036 queda como gate final del pase actual.

La validacion real contra Teno encontro primero blockers de datos/plantilla y
dos bugs de borde; ambos quedaron corregidos y el quickstart completo paso con
mediciones reales.

## Alcance implementado

**US1 - Cascada automatica**

- `apps/api/services/escritura_auto_pipeline.py` orquesta submit, revision
  juridica, aprobacion system, generacion y entrega.
- Las corridas quedan auditadas en `escritura_cascade_runs` con `trigger`,
  `outcome`, `causes`, `steps` y timestamps.
- La aprobacion automatica distingue `approval_origin='system'` y decisiones
  de revision con `origin`, `trigger` y matriz/version heredada.
- El retry de cascada existe en FastAPI y proxy web:
  `/api/escritura-matrices/case/[caseId]/retry-cascade`.

**US2 - Politica de revision**

- `organizations.escritura_review_policy` soporta `every_sale` y
  `exceptions_only`.
- `updateEscrituraReviewPolicyAction` valida admin, escribe la politica y
  audita from -> to.
- La cascada respeta `every_sale` como 1 acto humano y `exceptions_only` como
  0 actos cuando no hay blockers reales.

**US4 - Warning legal una vez por proyecto**

- `acknowledgeMinutaWarningAction` confirma
  `projects.minuta_warning_acknowledged_by/_at`, es idempotente y audita.
- El checklist del proyecto incluye "Aviso legal" con CTA de confirmacion.
- `generate_case_minuta` hereda el amparo del proyecto y lo copia a cada
  generacion. El flag por request queda solo como fallback legacy.

**US3 - Mesa como sala de control**

- `mesa-escritura.tsx` decide por `cascade_status`:
  `completed`, `exception`, `awaiting_review` o `legacy`.
- Casos `completed`: muestran "Minuta entregada", historial, descarga y
  trazabilidad de aprobacion del sistema.
- Casos `exception`: muestran causas accionables, fecha de ultima corrida y
  boton "Reintentar".
- Casos con cascada ya no muestran "Enviar a revision" ni "Aprobar" como
  peajes del camino feliz.
- Generar y reintentar son acciones directas; rechazo mantiene razon inline.

## Validacion real Teno

El 2026-07-08 se ejecuto una primera venta real controlada sobre Teno:

- Proyecto: `aad0fbf2-ceda-47bc-954a-b3f5f2ac8797`.
- Organizacion: `7a0203ce-8b31-4661-a7b7-933613d49069`.
- Lote: 10 (`6fa708c3-9f63-4672-bf9f-4104c3597d6b`).
- Approval request: `82582429-44ec-4129-8ff9-75c2092966fd`.
- Caso creado: `bbdc5998-d858-429a-9256-585e79e86451`.
- Corrida: `0aaea8ae-83ac-42e7-93fa-57cf9eb765f3`.
- Resultado: `exception` en ~8 segundos desde `sold_at`.
- Generaciones creadas para ese caso: 0.

La cascada hizo lo correcto: no genero minuta parcial y dejo causas
accionables. Esa primera ejecucion revelo blockers reales:

- El gate heredado `sii_verified/lote.rol_tramite` venia desde la matriz
  proyecto aunque `lote.rol_tramite` es variable de caso.
- Falta clausula comprometida de Vigencia en el resto del predio.
- Falta clausula comprometida de Titulo con multiples inmuebles.
- Falta clausula comprometida de Otra alerta del estudio de titulo.

Correcciones aplicadas:

- La cascada ignora causas heredadas cuyo `variable_producer` es `sale_gap` o
  `signing`; esas se evalúan en el caso, no en la matriz proyecto.
- La plantilla publicada no se mutó. Se creo y publico template v4
  `5bb8ad07-0a8d-494f-95a8-81362b0052ac` con las tres clausulas de alerta, y
  una nueva matriz proyecto aprobada `e5addbc2-63b6-4e13-8a5a-62b9965f90ac`.
- Se corrigio la idempotencia: retry sobre caso `completed` con generacion
  existente retorna `completed` aunque la politica vigente haya vuelto a
  `every_sale`.

Resultados finales:

- `every_sale`: lote 11, caso `8369fe60-52d0-4561-bd28-977760383392`,
  `awaiting_review` tras venta y `completed` tras 1 accion humana. Minuta
  `383c96bb-be16-4224-a274-6ee8218e9ec3`; entrega web + Telegram; ~12s tras
  aprobar revision juridica.
- `exceptions_only`: lote 12, caso `464b1b09-3301-4a97-aa8f-d596d7927df4`,
  `completed` desde `sale_validated` con 0 acciones humanas. Minuta
  `c45cb582-8147-48a7-a8e0-f1573f80f039`; entrega web + Telegram; ~23s desde
  venta aprobada.
- Idempotencia: retry sobre el caso completed del lote 12 mantuvo 1 generacion
  y registro corrida `completed` con `generate=skipped/already_generated`.

## Gates ejecutados

- `pnpm test:api`: 697 passed, 2 skipped.
- `pnpm test:web`: 834 passed.
- `pnpm typecheck:web`: verde.
- `pnpm --filter web lint`: verde.
- `pnpm build:web`: verde.
- `pnpm verify:migrations`: verde.
- `pnpm contracts:generate`: verde.
- `pnpm format:check`: verde.
- `codegraph sync .`: up to date.

## Pendiente

1. Ejecutar gate final T036 con el arbol limpio o con diff esperado ya
   commiteado.
2. Mantener la politica de Teno restaurada a `every_sale` (restaurada al final
   de la prueba `exceptions_only`).

## Reglas vigentes

- No crear usuario "system": las aprobaciones automaticas usan
  `approval_origin='system'` y actor nullable donde corresponde.
- El warning legal se confirma por proyecto; no debe volver el dialogo por
  generacion en la mesa.
- Las excepciones deben bloquear antes de aprobar/generar y conservar causas
  humanizadas con `action_href`/`fix_url`.
- OpenAPI se regenera desde FastAPI; no editar el JSON generado como fuente.

## Relacionado

- [[SDD 016 Pipeline Remediacion UX - Handoff]]
- [[SDD 011 Venta-Escritura - Handoff]]
- [[SDD 010 Mesa de Escritura - Handoff]]
- [[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]
