# Quickstart: Mesa de Escritura — Validacion E2E y de Usabilidad

**Feature**: `010-mesa-escritura`

Dos validaciones de cierre: (A) E2E tecnico con el corpus Teno (sin
regresion del motor) y (B) sesion de usabilidad observada (SC-001, SC-004,
SC-008). Ambas se documentan aqui con resultados antes de cerrar el feature.

## Prerequisitos

- Caso Teno con titulo aprobado y snapshot completo (fixture/datos de
  SDD 008 quickstart pasos 1-3).
- Un segundo caso con gates bloqueados (sin estado civil de compradora y
  alerta `derechos_aguas` resuelta `clause_added` sin clausula) para la
  llegada guiada.
- `pnpm dev` (web + api) con la rama `010-mesa-escritura`.

## A. E2E tecnico (Teno)

1. **Llegada guiada**: abrir la mesa del caso bloqueado. Esperado: estado de
   preparacion con pendientes en espanol, cada uno con accion navegable;
   cero terminos vetados. Click en "Completar dato" navega al CCL con la
   variable enfocada.
2. **Mesa en lectura**: abrir el caso Teno completo. Esperado: escritura
   completa continua (20 clausulas, orden correcto), valores reales en el
   texto, bloque PRIMERO verbatim marcado como aprobado, referencias del
   SEXTO en palabras identicas al DOCX de SDD 008.
3. **Evidencia 2 clicks**: click en el RUT de la compradora → popover con
   etiqueta humana, valor, snippet/pagina o "Registro de venta del Lote 12",
   CTA "Corregir en Centro de Control Legal". Maximo 1 click desde el texto
   (+1 para abrir documento completo = 2).
4. **Edicion in-place**: en borrador, editar texto de una clausula
   editable, insertar "Precio en palabras" via `@` → chip con estado;
   guardar; verificar persistencia y que un guardado concurrente produce el
   mensaje humano de conflicto.
5. **Bloque protegido**: intentar editar la comparecencia del vendedor →
   bloqueado con explicacion y link al panel de titulo.
6. **Workflow**: enviar a revision → aprobar (revisor autorizado) → generar
   minuta → resumen humano + warning ADR-009 → descarga. Verificar registro
   de aceptacion y entrada en historial con descripcion humana.
7. **No regresion DOCX**: generar minuta del mismo caso/snapshot y comparar
   estructuralmente con la generacion de referencia de SDD 008 (parrafos,
   orden, textos verbatim): identicas.
8. **Supersesion**: corregir un dato en CCL (nuevo snapshot) con la mesa
   abierta → aviso humano de expediente cambiado; la generacion vieja queda
   en historial; la matriz vuelve a borrador.
9. **Plantillas sin JSON**: en `/documentos/plantillas`, clonar la v1 a
   borrador, editar una clausula (texto + dato insertado + condicion como
   frase), guardar con un dato invalido → error con texto visible y
   sugerencia; en ningun momento aparece JSON.
10. **Auditoria de vocabulario**: recorrer todas las pantallas del flujo con
    el checklist SC-002 (terminos vetados) — cero hallazgos; correr el test
    de vocabulario prohibido.
11. **Presupuesto de carga (SC-007)**: medir el tiempo desde la navegacion
    hasta que la mesa del caso Teno queda legible (pestaña
    Network/Performance del navegador, 3 mediciones, mediana registrada en
    la tabla de resultados); esperado < 2 segundos desde datos persistidos.
12. **Accesibilidad (FR-016)**: recorrido completo por teclado — chips,
    popover de evidencia (Enter abre, Esc cierra y devuelve foco), picker de
    insercion, indice y workflow — con focus visible en todo momento, mas
    verificacion de contraste AA de los tres estados de chip en modo claro y
    oscuro; cero bloqueos de teclado.

Gates tecnicos: `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`,
`pnpm --filter web lint`, `pnpm format:check`, `pnpm build:web`,
`pnpm contracts:generate` (sin diff manual).

## B. Sesion de usabilidad observada (gate de cierre, research D10)

**Participante**: una persona del perfil real (abogado o administrador de
proyecto) que no haya participado del desarrollo. **Moderador**: no ayuda
salvo bloqueo total; cronometra y registra.

Tareas (exito = completada sin ayuda):

| #   | Tarea                                                                                           | Criterio                                      | SC         |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------- |
| 1   | Llegar desde el CCL del proyecto a la escritura del caso                                        | Encuentra el CTA sin ayuda                    | SC-004     |
| 2   | Leer la escritura y decir que datos faltan                                                      | Identifica los faltantes en < 1 min c/u       | SC-001/004 |
| 3   | Mostrar de que documento sale el RUT de la compradora                                           | Llega a la evidencia en ≤ 2 clicks            | SC-001     |
| 4   | Destrabar un pendiente (estado civil)                                                           | Navega al lugar correcto desde el pendiente   | SC-004     |
| 5   | Aprobar y generar la minuta                                                                     | Completa el flujo y explica que descargo      | SC-008     |
| 6   | (Perfil admin) Crear una clausula en una copia de plantilla: texto + dato insertado + condicion | Completa sin ayuda, sin ver JSON, en < 10 min | SC-003     |

**Aprobacion**: ≥ 4/5 en las tareas 1-5 sin ayuda y revision del caso limpio
en < 15 min. La tarea 6 (SC-003) se ejecuta con un participante de perfil
administrador en la misma sesion o en una mini-sesion aparte despues de
T018, y es gate propio de SC-003. Si una tarea falla, se itera la pantalla
implicada y se repite la sesion (las veces necesarias; el feature no cierra
sin este gate).

## Registro de resultados

| Fecha       | Validacion             | Resultado       | Notas                                                                                                                                                                                                                                                                  |
| ----------- | ---------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-11  | T007 Wireframes (gate) | Aprobados (5/5) | Aprobacion explicita del usuario ("apruebo las 5") sobre las pantallas: preparacion, mesa lectura, popover evidencia, edicion + picker, generacion. Pantallas 1 y 2 con doble proposito confirmado para SDD 011 (llegada post-venta y matriz del proyecto con huecos). |
| 2026-06-11  | T021 SC-002 + FR-016   | PASS tecnico    | Checklist de vocabulario pantalla-por-pantalla completado en A10; auditoria de teclado/contraste documentada en A12; `pnpm test:web` en verde con lista vetada final y contraste AA de chips.                                                                          |
| 2026-06-11  | A. E2E tecnico         | PASS tecnico    | Pasada de cierre T022 documentada abajo. Gates completos en verde: `pnpm test:api`, `pnpm test:web`, `pnpm typecheck:web`, `pnpm --filter web lint`, `pnpm format:check`, `pnpm build:web`.                                                                            |
| _pendiente_ | B. Usabilidad          | —               | —                                                                                                                                                                                                                                                                      |

## Resultado A — E2E tecnico Teno (T022, 2026-06-11)

Pasada tecnica ejecutada sobre fixtures Teno, tests permanentes y build de
produccion. El gate humano de usabilidad B sigue pendiente y bloquea el
cierre del feature.

| Paso | Validacion                  | Evidencia                                                                                                                                             | Resultado    |
| ---- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| A1   | Llegada guiada              | `mesa-escritura.test.ts`: `decideMesaVista`, `EstadoPreparacion`, `PendientesList`, CTA al CCL y ausencia de jerga en componentes nuevos.             | PASS         |
| A2   | Mesa en lectura             | `mesa-escritura.test.ts`: documento continuo, orden de clausulas, bloques de titulo y clausulas omitidas; `test_matriz_manifest_humanized.py`.        | PASS         |
| A3   | Evidencia en 2 clicks       | `dato-popover.tsx` + tests de `evidenciaDocumental`, `urlCorreccion` y visor compacto heredado de SDD 007.                                            | PASS         |
| A4   | Edicion in-place            | `clausula-editor-inline.tsx`, picker `@`, guardado CAS y conflicto humanizado cubiertos por `mesa-escritura.test.ts`.                                 | PASS         |
| A5   | Bloque protegido            | `contieneBloquesTitulo`, ayuda al panel de titulo y bloqueo de edicion cubiertos por tests web.                                                       | PASS         |
| A6   | Workflow                    | `workflow-acciones.tsx`, warning ADR-009, historial humano y endpoints de revision/generacion cubiertos por `pnpm test:api` + `pnpm test:web`.        | PASS         |
| A7   | No regresion DOCX           | `test_matriz_docx.py`, `TestGenerateMinuta`, `test_matriz_endpoints.py` y fixture Teno validan orden, ZIP DOCX, PRIMERO verbatim y cero sin resolver. | PASS         |
| A8   | Supersesion                 | Tests SDD 008/010 de `snapshot_stale`, aviso humano y bloqueo de guardado/generacion desde expediente no vigente.                                     | PASS         |
| A9   | Plantillas sin JSON         | `template-library.test.ts` migrado a `PlantillaEditor`, `condicion-clausula-form.tsx`, errores humanizados y ruta `/documentos/plantillas`.           | PASS         |
| A10  | Auditoria vocabulario       | `mesa-vocabulario.test.ts` con lista vetada final + checklist pantalla por pantalla T021.                                                             | PASS         |
| A11  | Presupuesto de carga SC-007 | `pnpm build:web` compila la ruta `/documentos/matriz/[caseId]`; la mesa renderiza desde manifiesto ya persistido y sin dependencias nuevas.           | PASS tecnico |
| A12  | Accesibilidad FR-016        | Checklist T021 + test de contraste AA de chips + componentes operables por boton, shadcn/Radix y sensores de teclado dnd-kit.                         | PASS         |

Gates ejecutados:

| Comando                  | Resultado                    |
| ------------------------ | ---------------------------- |
| `pnpm test:api`          | PASS — 525 passed, 2 skipped |
| `pnpm test:web`          | PASS — 50 files, 670 tests   |
| `pnpm typecheck:web`     | PASS                         |
| `pnpm --filter web lint` | PASS                         |
| `pnpm format:check`      | PASS                         |
| `pnpm build:web`         | PASS                         |

## Registro T021 — Auditoria SC-002 y FR-016

### A10. Checklist de vocabulario pantalla por pantalla

| Pantalla / superficie                         | Jerga tecnica | JSON visible | Claves crudas | Resultado |
| --------------------------------------------- | ------------- | ------------ | ------------- | --------- |
| `/documentos`                                 | 0             | 0            | 0             | PASS      |
| `/documentos/matriz/[caseId]` preparacion     | 0             | 0            | 0             | PASS      |
| `/documentos/matriz/[caseId]` mesa de lectura | 0             | 0            | 0             | PASS      |
| Popover de evidencia de dato                  | 0             | 0            | 0             | PASS      |
| Editor in-place + picker "Insertar dato"      | 0             | 0            | 0             | PASS      |
| Panel lateral de datos y pendientes           | 0             | 0            | 0             | PASS      |
| Workflow aprobar/generar                      | 0             | 0            | 0             | PASS      |
| `/documentos/historial`                       | 0             | 0            | 0             | PASS      |
| `/documentos/plantillas`                      | 0             | 0            | 0             | PASS      |

Lista vetada final automatizada en `TERMINOS_PROHIBIDOS`: token, variable,
blocker, snapshot, gate, resolved, missing, blocked, json, manifest,
readiness, builder, template, payload, schema, endpoint, debug, developer,
ProseMirror/ProseKit, condition_key, condition_mode, alert_tipo, dl_3516,
derechos_aguas, fixed_position, content_json, block_token y variable_token.
El test permanente tambien detecta claves crudas con puntos, por ejemplo
`comprador.estado_civil` y `titulo.inscripciones[]`.

### A12. Teclado y contraste

| Superficie               | Revision FR-016                                                                                                       | Resultado |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------- |
| Chips de dato            | Boton nativo; Enter/Espacio activan; foco visible; estado tambien en texto `sr-only`; contraste AA calculado en test. | PASS      |
| Popover de evidencia     | `PopoverTrigger asChild`; Esc cierra y devuelve foco segun Radix/shadcn; CTA final es enlace con nombre visible.      | PASS      |
| Picker "Insertar dato"   | Boton visible + atajo `@`; `Command` permite busqueda y seleccion por teclado; sin dependencia de color.              | PASS      |
| Indice de clausulas      | `KeyboardSensor` + `sortableKeyboardCoordinates`; handle con texto accesible; posiciones fijas indicadas por texto.   | PASS      |
| Workflow aprobar/generar | Botones y dialogos shadcn; acciones bloqueadas muestran pendientes en texto, no solo deshabilitado visual.            | PASS      |
| Plantillas               | Editor, condicion y alerta usan controles etiquetados; lista de clausulas usa botones y DnD con sensor de teclado.    | PASS      |

Contraste de chips (Tailwind 4): `emerald-900` sobre `emerald-50`,
`sky-900` sobre `sky-50` y `amber-900` sobre `amber-50`; todos cumplen
ratio AA >= 4.5:1 segun el test `mesa-vocabulario.test.ts`.
