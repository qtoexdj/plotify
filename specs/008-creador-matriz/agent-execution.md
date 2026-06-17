# Agent Execution Protocol: SDD 008 Creador de Matriz

**Feature**: `008-creador-matriz`
**Authority**: Spec Kit SDD artifacts + Plotify constitution y memoria.
**Purpose**: Como ejecutan agentes/subagentes el SDD 008 sin desviarse del
plan aprobado. Hereda el protocolo SDD 007/009; deltas abajo.

## Required Context Before Any Task

- `AGENTS.md`, `.specify/memory/constitution.md`
- `specs/008-creador-matriz/{spec,plan,research,data-model,tasks}.md` y
  `contracts/`
- Contratos upstream: `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`
  y `specs/009-titulo-dominio-vigente/handoff-sdd-008-addendum.md`
- Template golden: `labs/labs_escrituras/docs/template-draft.md`

## SDD 008 Specific Rules

1. **Snapshot-only es sagrado**: ninguna tarea puede hacer que el builder o
   el renderer lean `variable_resolutions`, `lots`, `lot_records` o
   extraccion viva. El unico productor nuevo es
   `escritura_operational_bridge`, que corre en el API de casos.
2. **El builder no muta variables**: si un test necesita "corregir" un
   valor, lo hace via el flujo CCL de SDD 007 y re-snapshot, nunca con un
   atajo.
3. **Un solo motor de palabras**: todo numero/fecha/RUT en palabras sale de
   `services/legal_title_words.py`. Prohibido copiar conversores.
4. **Un solo resolutor**: vistas, blockers y DOCX consumen
   `matriz_token_resolution`; ningun componente re-implementa sustitucion de
   tokens.
5. **Templates publicados son inmutables**: ninguna tarea agrega "edicion
   rapida" sobre published; siempre clonar a draft.
6. **Generacion solo server-side** desde matriz `approved` + snapshot
   vigente + warning ack. No hay modo "preview DOCX" que esquive el gate.
7. **Catalogo**: agregar claves solo las listadas en research D11; cualquier
   otra adicion/remocion ⇒ detenerse y actualizar SDD docs primero.
8. **Sin LLM en este feature** (ni en tests): todo es deterministico.
9. **Una tarea sin checkear por pasada**; respetar `[P]`; cada tarea cierra
   con su comando Verify en verde.
10. **Stop conditions**: cambios de schema fuera de data-model.md,
    dependencias nuevas, cambios al snapshot de `escritura_readiness.py` mas
    alla de invocar el puente, o cualquier mutacion de servicios SDD 007/009
    no listada — detenerse y actualizar SDD docs.

## Agent Roles

| Role                   | Scope                                                       | May edit               | Must not edit                                      |
| ---------------------- | ----------------------------------------------------------- | ---------------------- | -------------------------------------------------- |
| SDD Lead               | Orden de tareas, consistencia                               | SDD docs, task status  | Codigo runtime fuera de la tarea activa            |
| Database Agent         | Migracion, RLS, tipos                                       | `packages/database/**` | Comportamiento API/web                             |
| API Agent              | Endpoints, schemas, servicios (bridge, resolutor, renderer) | `apps/api/**`          | Servicios SDD 007/009 salvo integraciones listadas |
| Web Agent              | Builder, biblioteca, vistas, proxies                        | `apps/web/**`          | Migraciones, asunciones service-role               |
| QA/Review Agent        | Tests, regresion tenant, golden DOCX                        | tests, docs            | Codigo de produccion salvo asignacion              |
| Legal Product Reviewer | Texto de clausulas, warning legal, golden                   | docs/fixtures          | Codigo                                             |

## Handoff Format

Cada tarea reporta: id, archivos tocados, resumen del Verify, deltas de
contrato/schema si los hay, y follow-ups como sub-bullets sin checkear en
`tasks.md` solo con aprobacion del SDD Lead.
