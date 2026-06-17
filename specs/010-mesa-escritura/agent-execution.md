# Agent Execution Protocol: SDD 010 Mesa de Escritura

**Feature**: `010-mesa-escritura`
**Authority**: Spec Kit SDD artifacts + Plotify constitution y memoria.
**Purpose**: Como ejecutan agentes/subagentes el SDD 010 sin desviarse del
plan aprobado. Hereda el protocolo SDD 007/008/009; deltas abajo.

## Required Context Before Any Task

- `AGENTS.md`, `.specify/memory/constitution.md`
- `specs/010-mesa-escritura/{spec,plan,research,data-model,tasks}.md` y
  `contracts/`
- Codigo a reemplazar (referencia, no restriccion):
  `apps/web/src/components/documents/matriz/`
- Mockup aprobado de la sesion 2026-06-11 y wireframes del gate T007.

## SDD 010 Specific Rules

1. **El motor de SDD 008 es intocable**: ninguna tarea modifica tablas,
   resolutor (`matriz_token_resolution.py` solo gana campos de salida),
   renderer DOCX, workflow ni RLS. Si una tarea parece necesitarlo,
   detenerse y actualizar los SDD docs primero.
2. **API solo aditiva**: campos nuevos en respuestas, jamas remover ni
   cambiar tipos/semantica. `pnpm contracts:generate` tras cada cambio de
   schema; prohibido editar JSON generado a mano.
3. **Cero jerga en pantalla**: ningun string JSX visible puede contener
   token, blocker, snapshot, gate, claves crudas, codigos de alerta ni
   estados en ingles. Todo texto derivado de datos viene del API
   (`legal_microcopy.py`); todo texto estatico viene de
   `matriz-microcopy.ts`. Strings hardcodeados sueltos = tarea no cumple.
4. **Cero JSON visible**: ninguna superficie de usuario muestra, pide o
   exporta JSON. Sin "modo desarrollador" en rutas de producto.
5. **Snapshot-only heredado**: la mesa jamas lee extraccion viva ni muta
   `variable_resolutions`; la unica salida de correccion es la navegacion
   al CCL/panel de titulo.
6. **Etiquetas con cobertura total**: toda clave del catalogo tiene
   etiqueta y categoria; el test de inventario es gate de API. Prohibido
   mostrar una clave cruda como fallback.
7. **Gates humanos son bloqueantes**: T007 (wireframes) bloquea toda la
   implementacion web posterior; T023 (usabilidad) bloquea el cierre del
   feature. Ningun agente los marca completados — solo el usuario.
8. **Componentes nuevos en `components/documents/mesa/`**; los viejos no se
   tocan hasta la fase de retiro (T020). Nunca dos caminos de produccion.
9. **Una tarea sin checkear por pasada**; respetar `[P]`; cada tarea cierra
   con su comando Verify en verde; cambios web cierran ademas con
   `pnpm --filter web lint` → `pnpm format:check` → `pnpm build:web`.
10. **Stop conditions**: necesidad de migracion DB, de endpoint nuevo, de
    dependencia nueva, o de cambio no-aditivo de contrato ⇒ detenerse,
    documentar y consultar al usuario.

## Verification Discipline

- Logica pura migrada de `matriz-builder.test.ts` (reorden con fijas,
  resumen de pendientes, conflicto de version) conserva cobertura
  equivalente o mayor en `mesa-escritura.test.ts`.
- `mesa-vocabulario.test.ts` (terminos prohibidos) corre en `pnpm test:web`
  y es permanente, no un script unico.
- SC-006 (no regresion DOCX) se valida en quickstart A paso 7 antes de
  cerrar la fase 8.
