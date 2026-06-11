# Implementation Plan: Creador de Matriz y Minuta DOCX

**Branch**: `008-creador-matriz` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-creador-matriz/spec.md`

## Summary

Build the production matriz builder on top of the SDD 007/009 contracts: a
versioned clause library (ProseMirror JSON canonical) with structured variable
tokens, a case-bound matriz instance with dnd-kit ordering and the SDD 009
alert-clause contract, three preview modes backed by a single server-side
token resolver, DOCX generation from approved matriz + case snapshot via
python-docx, and a draft → legal review → approved workflow audited in
`legal_review_decisions`. A new deterministic operational bridge closes the
production gap for `comprador.*`, `transaccion.*`, `lote.*` and
`servidumbre.*` by staging proposals from `lot_records`/`lots`/
`organization_payment_info` through the SDD 007 variable state machine, so
`party_verified`, `price_verified` and `geometry_verified` stop depending on
manual typing. The lawyer's golden template (labs) becomes the published
compraventa template v1, with clause 2 replaced by the approved
`titulo.clausula_primero_texto` block.

## Technical Context

**Language/Version**: Python 3.13+ en `apps/api`; TypeScript 5, React 19,
Next.js 16 en `apps/web`.

**Primary Dependencies**: ProseKit (`@prosekit/*`, ya instalado) para el
editor con nodos custom; dnd-kit (ya instalado) para orden de clausulas;
python-docx (ya en requirements) para el render DOCX server-side;
`services/legal_title_words.py` (SDD 009) como motor compartido
numeros/fechas/RUT→palabras; `LegalVariableResolutionService` (SDD 007) como
unico camino de staging de propuestas; `escritura_readiness.py` snapshots.
**Sin dependencias nuevas.**

**Storage**: Migracion `20260611000100_creador_matriz.sql` con 4 tablas
nuevas (data-model.md): `escritura_templates`, `escritura_template_clauses`,
`escritura_matrices`, `escritura_minuta_generations`; RLS + triggers de scope
patron `title_analyses`. Catalogo ampliado (research D11). DOCX en bucket
privado existente de Storage.

**Sin LLM**: SDD 008 no llama modelos. Todo render es deterministico desde
snapshot aprobado. (La unica IA del flujo vive aguas arriba en SDD 009.)

**Testing**: `pnpm verify:migrations`, `pnpm test:api`, `pnpm test:web`,
`pnpm typecheck:web`, `pnpm format:check`, `pnpm build:web`. Golden de
referencia: template del abogado (labs) + snapshot Teno; el DOCX generado se
valida estructuralmente (python-docx round-trip: parrafos, orden de
clausulas, cero tokens sin resolver) — no comparacion binaria.

**Performance Goals**: carga del builder < 2s desde datos persistidos;
resolucion de tokens + manifiesto < 500ms server-side para una matriz de 20
clausulas; generacion DOCX < 5s.

**Constraints**: snapshot-only (jamas extraccion viva ni mutacion de
`variable_resolutions` desde el builder); bloques de titulo no editables
inline; generacion solo desde matriz `approved` + snapshot vigente; warning
legal obligatorio auditado; tenant isolation total; optimistic locking en
guardados.

**Scale/Scope**: ~4 tablas, ~10 endpoints, 1 servicio puente + 1 resolutor +
1 renderer DOCX, ~6 componentes web nuevos, 1 template publicado (20
clausulas), retiro de 3 paginas MVP.

## Architecture

```
                    ┌─ escritura_operational_bridge ─ lot_records / lots / org_payment_info
                    ▼              (propuestas system/geometry/derived)
variable_resolutions ──► escritura_readiness ──► escritura_cases.variable_snapshot
        ▲                                                      │ (hash)
   CCL (SDD 007/009)                                           ▼
titulo.* (agente 009) ──────────────────────────► matriz_token_resolution ◄── escritura_matrices
                                                       │   ▲                        ▲
                                                manifiesto │                   ProseKit builder
                                                       ▼   │                   (dnd-kit, vistas)
                                              matriz_docx_renderer ──► escritura_minuta_generations + Storage
```

Decisiones detalladas en [research.md](./research.md) (D1-D11); modelo de
datos y workflow en [data-model.md](./data-model.md); contratos en
[contracts/](./contracts/).

## Phases

- **Fase 1 — Setup**: migracion + tipos generados + catalogo ampliado +
  fixtures (snapshot Teno completo con datos operacionales y titulo
  aprobado; template golden como fixture de clausulas).
- **Fase 2 — Foundational**: schemas Pydantic, routers skeleton, servicios
  skeleton (bridge, resolutor, renderer), tipos web.
- **Fase 3 — US6 puente operacional (P1)**: bridge completo + idempotencia +
  integracion en creacion de caso + gates en verde con data Teno.
- **Fase 4 — US1 composicion (P1)**: biblioteca de plantillas (API + UI),
  template compraventa v1 desde el golden, builder con ProseKit, resolutor.
- **Fase 5 — US2 DOCX (P1)**: renderer python-docx, endpoint generate,
  warning ack, historial.
- **Fase 6 — US3 vistas (P2)**: switch template/resuelto/evidencia +
  evidence viewer reutilizado + deep links a CCL.
- **Fase 7 — US4 orden y alertas (P2)**: dnd-kit + persistencia + contrato
  alert_tipo + blockers.
- **Fase 8 — US5 workflow (P3)**: submit/approve/reject + supersesion de
  snapshot + candado de aprobado.
- **Fase 9 — Polish**: retiro de paginas MVP, regresion tenant, quickstart
  E2E Teno, handoff de consolidacion UX legal.

## Risks

- **Fidelidad DOCX**: la notaria es exigente con formato; mitigado validando
  con el DOCX golden del abogado en revision visual (SC-006) antes de cerrar
  la fase 5.
- **Calidad de datos operacionales**: `lot_records` puede venir incompleto
  (estado civil, domicilio); el puente lo hace visible como `missing` por
  gate en vez de ocultarlo — riesgo operacional, no tecnico.
- **Esquema ProseMirror evoluciona**: version de schema en `content_json`
  (`schema_version: 1`) para migraciones futuras de nodos.
