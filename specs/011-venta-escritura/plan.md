# Implementation Plan: Venta → Escritura — Matriz del Proyecto y Borrador Automatico

**Branch**: `011-venta-escritura` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-venta-escritura/spec.md` +
decisiones resueltas en [research.md](./research.md).

## Summary

Cerrar el ciclo **proyecto → matriz aprobada → venta → borrador automatico
→ entrega**. El abogado genera la **matriz del proyecto** una vez (desde la
plantilla general, resuelta contra los datos del proyecto, con los datos de
venta como huecos), la edita en la mesa de SDD 010 y la aprueba: queda
"esperando ventas". Cuando el administrador **valida una venta**, el sistema
crea el caso del lote, propone comprador/precio/lote desde el formulario
(puente operacional) e **instancia el borrador del lote** desde la matriz
aprobada; el administrador revisa solo los datos de la venta (resaltados
"Por revisar") y lo acepta, generando el DOCX con el warning ADR-009. El
borrador se **entrega al vendedor** por Telegram (enlace seguro + archivo
best-effort) y en "mis documentos del vendedor" en la web. Todo con el
diccionario unico de SDD 010. El motor (resolutor, renderer, workflow) y la
mesa se reutilizan sin re-arquitectura; la unica migracion es aditiva y
acotada (matriz scope-proyecto + tabla de entregas).

## Technical Context

**Language/Version**: Python 3.13+ en `apps/api`; TypeScript 5, React 19,
Next.js 16 en `apps/web`.

**Primary Dependencies**: motor SDD 008 sin cambios
(`matriz_token_resolution.py`, `matriz_docx_renderer.py`); mesa SDD 010
(`components/documents/mesa/`) reutilizada en ambos niveles (matriz del
proyecto y borrador del lote); puente operacional
(`escritura_operational_bridge.py`); `TelegramClient`
(`integrations/telegram_client.py`, se extiende con `send_document`);
Supabase Storage (bucket `documents`). **Sin dependencias nuevas.**

**Storage**: **Una migracion aditiva acotada** (excepcion autorizada por el
spec, research D1): `escritura_matrices.escritura_case_id` nullable + indice
unico parcial de matriz de proyecto + `source_project_matriz_id`; y tabla
nueva `escritura_deliveries` (research D2). `variable_resolutions` ya
soporta scope proyecto (sin migracion). Resto: cambios en codigo versionado.

**Sin LLM**: igual que SDD 008/010, todo deterministico desde snapshot. La
extraccion por IA ya ocurrio aguas arriba (CCL/titulo); este feature
consume sus resultados.

**Testing**: `pnpm test:api` (matriz del proyecto: generacion/aprobacion/
bloqueo por pendientes; enganche idempotente al validar venta; puente
operacional; instanciacion del borrador; entregas y auditoria), `pnpm
test:web` (seccion Documentos por proyecto, "mis documentos del vendedor",
estados unificados, vocabulario prohibido extendido), `pnpm typecheck:web`,
`pnpm --filter web lint`, `pnpm format:check`, `pnpm build:web`, `pnpm
contracts:generate`, `pnpm verify:migrations`. Gates humanos heredados de
SDD 010: wireframes aprobados (matriz del proyecto con huecos `______` +
"mis documentos del vendedor") y sesion de usabilidad incluyendo el journey
vendedor→entrega.

**Target Platform**: web desktop-first (oficina legal/administracion) +
entrega Telegram para el vendedor en movil.

**Project Type**: monorepo web (Next.js App Router) + API FastAPI + worker.

**Performance Goals**: SC-002 — de "validar venta" a "borrador aceptado" en
< 5 min sin digitar datos del comprador; instanciacion del borrador < 2s
(presupuesto de la mesa, SDD 010).

**Constraints**: snapshot-only (constitucion); cero mutacion de variables
fuera del flujo CCL; el puente operacional es el unico productor de datos de
venta; ADR-009 intacto (marca de borrador + warning auditado en toda
entrega); cero jerga/JSON visibles; aislamiento por tenant y por vendedor.

**Scale/Scope**: ~5 pantallas/superficies nuevas (Documentos por proyecto,
matriz del proyecto en la mesa, validacion con borrador, "mis documentos
del vendedor", historial filtrado por proyecto); 5 user stories (P1×2,
P2×2, P3×1).

## Constitution Check

_GATE: pasa antes de Fase 0. Re-chequear tras Fase 1._

| Principio                                                | Cumplimiento                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Producto piloto primero (flujo core KMZ)**          | El feature cierra el flujo de negocio real sobre el piloto Teno; no agrega lineas paralelas. ✅                                                                                                                                                     |
| **II. Geometria como origen de deslindes/documentos**    | Consume `lote.deslindes` y `servidumbre.*` tal cual los produce el motor; no toca calce deslindes↔plano (fuera de alcance explicito). ✅                                                                                                            |
| **III. Supabase y migraciones canonicas**                | Una migracion aditiva acotada bajo `packages/database/supabase/migrations`; `pnpm verify:migrations` + regenerar tipos. La excepcion a "cero migraciones" esta autorizada por el spec y justificada en research D1. ⚠️→✅ (ver Complexity Tracking) |
| **IV. Contratos tipados entre servicios**                | OpenAPI generado desde FastAPI/Pydantic; `pnpm contracts:generate`. Reusa los contratos de la mesa (SDD 010) de forma aditiva. ✅                                                                                                                   |
| **V. Seguridad multi-tenant y asignacion de vendedores** | "Mis documentos del vendedor" y la entrega se aislan por vendedor asignado; auditoria nivel B (quien valido/acepto/recibio). ✅                                                                                                                     |
| **VI. Testing y gates obligatorios**                     | Tests API+web + gates humanos (wireframes, usabilidad). No se cierra sin la sesion observada (correccion de la causa raiz de SDD 008). ✅                                                                                                           |

**Resultado**: PASS con una desviacion justificada (migracion acotada).

## Project Structure

### Documentation (this feature)

```text
specs/011-venta-escritura/
├── spec.md              # Hecho
├── checklists/
│   └── requirements.md  # Hecho (validado 2026-06-11)
├── research.md          # Hecho (este plan)
├── plan.md              # Este archivo
├── data-model.md        # Hecho (entidades y migracion)
├── quickstart.md        # Pendiente (Fase 1 — validacion E2E + usabilidad)
├── contracts/           # Pendiente (Fase 1 — contratos aditivos)
└── tasks.md             # Pendiente (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/
├── api/v1/endpoints/
│   ├── escritura_matrices.py        # + generar/aprobar matriz del PROYECTO; instanciar borrador del lote
│   └── (venta/lot_records handler)  # + enganche idempotente al validar venta (D3)
├── services/
│   ├── escritura_operational_bridge.py  # reusar stage_operational en el enganche
│   ├── matriz_token_resolution.py       # SIN cambios de motor
│   ├── matriz_docx_renderer.py          # SIN cambios (marca de borrador ya existe)
│   ├── legal_microcopy.py               # + estados del flujo
│   └── escritura_delivery.py            # NUEVO: entrega + auditoria (D2)
├── integrations/
│   └── telegram_client.py               # + send_document + enlace seguro con TTL
└── schemas/escritura_matrices.py        # + matriz de proyecto, borrador instanciado, entrega (aditivo)

apps/web/src/
├── app/(dashboard)/documentos/
│   ├── page.tsx                         # Documentos por PROYECTO (matriz escritura + matriz variables)
│   ├── historial/page.tsx               # + filtro por proyecto
│   └── plantillas/page.tsx              # sin cambios (plantilla general)
├── app/(dashboard)/mis-documentos/      # NUEVO: documentos del vendedor
├── components/documents/mesa/           # mesa SDD 010 reutilizada (cero componentes de documento nuevos)
├── components/app-sidebar.tsx           # + sub-items Documentos (Escrituras / Historial / Plantillas) + "Mis documentos"
└── lib/documents/matriz-*.ts            # tipos aditivos

packages/database/supabase/migrations/
└── 20260615xxxxxx_venta_escritura.sql   # matriz scope-proyecto + escritura_deliveries
```

**Structure Decision**: monorepo web + API existente. El feature es
mayormente **navegacion + enganche + entrega** sobre piezas ya construidas;
la unica estructura nueva es `mis-documentos/` (vendedor) y dos servicios
(`escritura_delivery.py`, extension de Telegram). La mesa, el resolutor, el
renderer y el puente operacional se reutilizan.

## Phasing (resumen; el detalle por tarea va en tasks.md)

- **Fase 0 — Research**: hecho ([research.md](./research.md)): D1/D2/D3
  resueltos.
- **Fase 1 — Diseño**: data-model ([data-model.md](./data-model.md)),
  contratos aditivos, quickstart (E2E + usabilidad), **gate de wireframes**
  (matriz del proyecto con huecos + "mis documentos").
- **Fase 2 — US1 (P1)**: matriz del proyecto (modelo + generar/editar en la
  mesa/aprobar con bloqueo por pendientes) + **seccion Documentos por
  proyecto**. Desbloquea al abogado para revisar antes de la primera venta.
- **Fase 3 — US2 (P1)**: enganche al validar venta (caso auto + puente +
  instanciar borrador) corrigiendo el orden invertido.
- **Fase 4 — US3 (P2)**: validacion con borrador (datos de venta "Por
  revisar") + aceptacion → DOCX con warning.
- **Fase 5 — US4 (P2)**: entrega al vendedor (Telegram + "mis documentos")
  - auditoria.
- **Fase 6 — US5 (P3)**: estados unificados en todas las superficies.
- **Fase 7 — Cierre**: gates tecnicos + **sesion de usabilidad observada**
  (journey abogado y vendedor→entrega).

**Dependencia**: este feature depende de **cerrar SDD 010** (la mesa es su
superficie). Ver el reporte de pendientes de 010 antes de iniciar Fase 2.

## Complexity Tracking

| Violacion                                                           | Por que se necesita                                                                                                                                                                        | Alternativa mas simple rechazada porque                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migracion sobre la regla "cero migraciones" (matriz scope-proyecto) | Sin matriz de proyecto, el abogado revisaria la escritura N veces (1 por lote): rompe el valor central del feature (SC-001). El spec autoriza explicitamente esta unica excepcion acotada. | Tabla nueva `escritura_project_matrices` (research D1): duplicaria el modelo y forzaria a la mesa/resolutor/renderer a ramificar sobre dos formas. Reusar `escritura_matrices` con `case_id` nullable mantiene un solo motor. |
