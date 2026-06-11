# Implementation Plan: Mesa de Escritura — Consolidacion UX Legal

**Branch**: `010-mesa-escritura` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-mesa-escritura/spec.md`

## Summary

Reemplazar la capa de presentacion del creador de matriz (SDD 008) por la
"mesa de escritura": la escritura completa como documento continuo en vista
resuelta por defecto, datos como chips con estado y evidencia en popover a
un click, panel de datos agrupado con etiquetas humanas, pendientes
redactados por el servidor con accion navegable, llegada guiada para casos
bloqueados, edicion de texto in-place con picker "Insertar dato", workflow y
generacion con lenguaje humano, y autoria de plantillas sin JSON. El motor
de SDD 008 (tablas, resolutor, renderer DOCX, workflow, RLS) no se toca; el
API solo se extiende aditivamente (etiquetas, categorias y pendientes
humanizados en el manifiesto + catalogo etiquetado). Dos gates de proceso
nuevos: wireframes aprobados antes de codificar la web y sesion de
usabilidad observada antes de cerrar (correccion de la causa raiz del fallo
UX de SDD 008).

## Technical Context

**Language/Version**: Python 3.13+ en `apps/api`; TypeScript 5, React 19,
Next.js 16 en `apps/web`.

**Primary Dependencies**: ProseKit (`@prosekit/*`, instalado) — editor
in-place y picker de insercion; dnd-kit (instalado) — reorden desde el
indice; shadcn/ui (`Popover`, `Command`, `Sheet`, `Dialog`) + Tailwind 4 —
superficie visual; `legal-evidence-viewer.tsx` (SDD 007) reutilizado en el
popover de evidencia; `matriz_token_resolution.py` y
`matriz_docx_renderer.py` (SDD 008) sin cambios. **Sin dependencias
nuevas.**

**Storage**: **Cero migraciones.** Tablas SDD 008 intactas. Cambios solo en
codigo versionado: catalogo etiquetado (`legal_variable_catalog.py`),
diccionario (`legal_microcopy.py`), schemas Pydantic aditivos
(data-model.md §1-3).

**Sin LLM**: igual que SDD 008, todo deterministico desde snapshot.

**Testing**: `pnpm test:api` (inventario de etiquetas, manifiesto
humanizado, blockers redactados, contrato de plantillas), `pnpm test:web`
(mesa, popover, picker, vocabulario prohibido, logica migrada de
matriz-builder.test.ts), `pnpm typecheck:web`, `pnpm --filter web lint`,
`pnpm format:check`, `pnpm build:web`, `pnpm contracts:generate`. Ademas
dos gates humanos (quickstart B): wireframes aprobados y sesion de
usabilidad ≥ 4/5 tareas.

**Target Platform**: web desktop-first (oficina legal); panel colapsable en
anchos menores sin perdida de lectura.

**Project Type**: monorepo web (Next.js App Router) + API FastAPI.

**Performance Goals**: mesa lista para leer < 2s desde datos persistidos
(SC-007, presupuesto SDD 008); popover de evidencia < 100ms percibido
(datos ya en memoria del manifiesto); una sola instancia de editor montada.

**Constraints**: snapshot-only sin mutacion de variables desde la mesa;
templates publicados inmutables; generacion server-side gated (ADR-009);
tenant isolation; extensiones de API exclusivamente aditivas; cero jerga
tecnica y cero JSON visibles (FR-006, SC-002); accesibilidad AA + teclado
completo (FR-016).

**Scale/Scope**: ~14 componentes web nuevos (1 carpeta `mesa/`), 2 modulos
API nuevos (microcopy, etiquetas) + extension de schemas, 0 endpoints
nuevos, 0 tablas, retiro de 4 componentes y de los tabs del builder; 1
template publicado existente como contenido de referencia.

## Constitution Check

_GATE: evaluado antes de Phase 0; re-evaluado tras Phase 1. Sin
violaciones._

| Principio                             | Evaluacion                                                                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Producto piloto primero            | PASS — el feature endereza el flujo core de generacion documental del piloto; nada experimental.                                                                                                      |
| II. Geometria como origen             | PASS — sin cambios al origen de deslindes/datos; la mesa solo presenta el snapshot que ya los contiene.                                                                                               |
| III. Supabase y migraciones canonicas | PASS — cero migraciones; ningun estado nuevo fuera de la DB existente.                                                                                                                                |
| IV. Contratos tipados                 | PASS — extensiones aditivas via Pydantic → OpenAPI → `pnpm contracts:generate`; prohibido editar el JSON generado a mano.                                                                             |
| V. Seguridad multi-tenant y auditoria | PASS — mismos endpoints con RLS existente; el warning legal y su registro de aceptacion se conservan (FR-012); ninguna accion nueva muta datos comerciales/legales.                                   |
| VI. Testing y gates de calidad        | PASS — gates obligatorios listados en Testing; tests exigidos porque se toca logica de generacion documental (presentacion) y contratos API. Estandar shadcn/ui + Tailwind 4 cumplido (research D11). |

Post-Phase 1: sin cambios — el diseno no introdujo violaciones (Complexity
Tracking vacio).

## Project Structure

### Documentation (this feature)

```text
specs/010-mesa-escritura/
├── plan.md              # Este archivo
├── spec.md              # Especificacion (speckit-specify)
├── research.md          # Phase 0 (D1-D11)
├── data-model.md        # Phase 1 (view-models, catalogo, microcopy)
├── quickstart.md        # Phase 1 (E2E Teno + protocolo de usabilidad)
├── contracts/
│   ├── api-contracts.md # Extensiones aditivas del manifiesto/blockers
│   └── ui-contracts.md  # Componentes, journeys, diccionario de microcopy
├── checklists/
│   └── requirements.md  # Validacion de calidad del spec
├── agent-execution.md   # Protocolo de ejecucion para agentes
└── tasks.md             # Phase 2 (speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/
├── services/
│   ├── legal_variable_catalog.py   # + VARIABLE_LABELS / GROUP_LABELS / helper
│   ├── legal_microcopy.py          # NUEVO: diccionario server-side
│   └── matriz_token_resolution.py  # extension: emite labels/categorias/source_label
├── schemas/escritura_matrices.py   # extension aditiva (manifiesto humanizado)
└── tests/
    ├── test_variable_catalog_labels.py   # NUEVO: inventario 100%
    └── test_matriz_manifest_humanized.py # NUEVO: manifiesto/blockers Teno

apps/web/src/
├── components/documents/mesa/      # NUEVA carpeta (ui-contracts §2)
│   ├── mesa-escritura.tsx, mesa-documento.tsx, mesa-encabezado.tsx,
│   ├── mesa-indice.tsx, dato-chip.tsx, dato-popover.tsx,
│   ├── panel-datos.tsx, pendientes-list.tsx, estado-preparacion.tsx,
│   ├── clausula-editor-inline.tsx, insertar-dato-picker.tsx,
│   ├── workflow-acciones.tsx, historial-generaciones.tsx,
│   ├── plantilla-editor.tsx, condicion-clausula-form.tsx
├── lib/documents/
│   ├── matriz-types.ts             # tipos extendidos (regenerados/aditivos)
│   └── matriz-microcopy.ts         # NUEVO: vocabulario estatico de UI
├── app/(dashboard)/documentos/
│   ├── matriz/[caseId]/page.tsx    # monta mesa-escritura
│   ├── plantillas/page.tsx         # monta plantilla-editor
│   └── page.tsx                    # tarjetas con vocabulario nuevo
└── tests/
    ├── mesa-escritura.test.ts      # NUEVO (logica migrada + nueva)
    └── mesa-vocabulario.test.ts    # NUEVO: terminos prohibidos

(componentes retirados al cierre: matriz-builder.tsx, matriz-view-switch.tsx,
 matriz-clause-editor.tsx, template-clause-form.tsx)
```

**Structure Decision**: monorepo existente; toda la capa nueva en
`components/documents/mesa/` para diff legible y retiro limpio de la capa
vieja (research D9). API extiende modulos existentes + 1 modulo nuevo de
microcopy.

## Architecture

```text
            (sin cambios) escritura_cases.variable_snapshot / evidence_snapshot
                                        │
legal_variable_catalog (+labels) ──► matriz_token_resolution ──► manifiesto humanizado
legal_microcopy (NUEVO) ────────────►   (labels, categorias,      (contrato aditivo)
                                         pendientes redactados)        │
                                                                       ▼
        ┌──────────────────────────── mesa-escritura ────────────────────────────┐
        │ estado-preparacion (gates bloqueados)   │   mesa (caso listo)          │
        │ pendientes-list (accionables)           │   mesa-documento + dato-chip │
        │                                         │   dato-popover (evidencia)   │
        │                                         │   panel-datos / mesa-indice  │
        │                                         │   clausula-editor-inline     │
        │                                         │   + insertar-dato-picker     │
        │                                         │   workflow-acciones (ADR-009)│
        └──────────────────────────────────────────────────────────────────────-─┘
                       (PUT guardado, submit/approve/generate: endpoints SDD 008 sin cambios)
```

Decisiones detalladas en [research.md](./research.md) (D1-D11); view-models
en [data-model.md](./data-model.md); contratos en [contracts/](./contracts/).

## Phases

- **Fase 1 — Setup**: punteros SDD activos a 010; inventario de etiquetas en
  el catalogo + test de cobertura; modulo `legal_microcopy.py`.
- **Fase 2 — Foundational**: manifiesto humanizado (schemas + resolutor +
  blockers redactados + `insertable_variables` + `omitted_reason`);
  contracts regenerados; tipos web + `matriz-microcopy.ts`; **gate de
  wireframes aprobados por el usuario** (research D10) antes de cualquier
  componente.
- **Fase 3 — US2 llegada guiada (P1)**: `estado-preparacion` +
  `pendientes-list` + ruta que decide preparacion/mesa + CTA y estados
  unificados en CCL.
- **Fase 4 — US1 mesa de lectura (P1)**: `mesa-documento` con clausulas
  resueltas, `dato-chip` + `dato-popover` (evidencia 1 click),
  `panel-datos`, `mesa-encabezado`, `mesa-indice` (reorden conservado),
  bloques de titulo y clausulas omitidas explicadas.
- **Fase 5 — US3 edicion en contexto (P2)**: `clausula-editor-inline` +
  `insertar-dato-picker` + guardado con conflicto humanizado.
- **Fase 6 — US4 workflow humano (P2)**: `workflow-acciones` (resumen +
  warning ADR-009 intacto) + `historial-generaciones` + bloqueos con
  pendientes humanizados.
- **Fase 7 — US5 plantillas sin JSON (P3)**: `plantilla-editor` +
  `condicion-clausula-form` + `clause_key` autogenerado + errores de
  catalogo humanizados.
- **Fase 8 — Polish & gates de cierre**: retiro de componentes viejos
  (FR-018), test de vocabulario prohibido, auditoria SC-002, E2E quickstart
  A, **sesion de usabilidad quickstart B (gate de cierre)**, actualizacion
  de memoria/handoff.

## Risks

- **Riesgo principal: repetir el fallo de proceso.** Mitigado con los dos
  gates humanos (wireframes antes de codificar; usabilidad antes de cerrar)
  y el test permanente de vocabulario prohibido — el cierre no depende solo
  de suites verdes.
- **Performance del documento continuo**: 20+ clausulas con chips
  interactivos en una superficie. Mitigado: lectura renderiza texto resuelto
  (sin editores montados); una sola instancia ProseKit al editar;
  presupuesto SC-007 medido en quickstart.
- **Cobertura del inventario de etiquetas**: claves sin etiqueta romperian
  la promesa "cero claves crudas". Mitigado: test de inventario al 100% que
  falla el build de API.
- **Divergencia de vocabulario entre API y web**: mitigado con la regla de
  fuentes (server = derivado de datos; web = estatico) y la tabla unica en
  ui-contracts.md como contrato revisable.
- **Edicion in-place sobre contenido resuelto**: el editor trabaja sobre
  `content_json` (estructura) mientras la lectura muestra lo resuelto;
  el cambio de modo por clausula debe ser obvio (research D1/D2) — se
  valida en la tarea de wireframes y en la sesion de usabilidad.

## Complexity Tracking

Sin violaciones constitucionales que justificar.
