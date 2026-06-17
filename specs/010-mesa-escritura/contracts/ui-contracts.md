# UI Contracts: Mesa de Escritura (SDD 010)

Contrato de componentes, journeys y vocabulario de la capa de presentacion.
Estandar visual: shadcn/ui + Tailwind 4 + Hugeicons (constitucion VI).
Todos los componentes nuevos viven en
`apps/web/src/components/documents/mesa/`.

## 1. Journeys (los tres perfiles, una superficie)

### J1 — Abogado revisa (US1, US4)

CCL del proyecto → caso de escritura → CTA "Abrir mesa de escritura" →
mesa en vista resuelta → lee de corrido → click en dato → popover evidencia
→ (si hay error de dato) "Corregir en Centro de Control Legal" → vuelve →
"Enviar a revision" / "Aprobar" → "Generar minuta" → resumen + warning legal
→ descarga.

### J2 — Admin/operador destraba (US2)

Abre la mesa con caso bloqueado → estado de preparacion ("Tu escritura se
esta preparando") → lista de pendientes humanos → click "Completar dato" →
CCL con la variable enfocada → corrige → vuelve → la mesa re-evalua y abre.

### J3 — Redactor compone (US3, US5)

Mesa en borrador → click en parrafo → edita in-place → `@` o "Insertar dato"
→ busca "precio en palabras" → inserta chip → guarda → (plantillas) edita
clausula en el mismo editor + define condicion como frase.

## 2. Componentes y responsabilidades

| Componente                    | Responsabilidad                                                                                                         | data-testid               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `mesa-escritura.tsx`          | Orquestador de la ruta: decide preparacion vs mesa; layout documento + panel                                            | `mesa-escritura`          |
| `mesa-documento.tsx`          | Documento continuo: clausulas resueltas apiladas, numeracion, bloques de titulo, clausulas omitidas consultables        | `mesa-documento`          |
| `dato-chip.tsx`               | Chip inline de dato con estado (verificado/por revisar/falta); abre popover                                             | `dato-chip-{estado}`      |
| `dato-popover.tsx`            | Nombre humano, valor, evidencia (snippet/pagina/doc via `legal-evidence-viewer` compact) o `source_label`, CTA corregir | `dato-popover`            |
| `panel-datos.tsx`             | "Datos de la escritura" agrupado por `category_label`, estado por dato, click = mismo popover                           | `panel-datos`             |
| `pendientes-list.tsx`         | "Para aprobar falta": blockers humanizados con `action_label`/`action_href`; reusado por preparacion y panel            | `pendientes-list`         |
| `estado-preparacion.tsx`      | Pantalla de llegada con caso bloqueado: progreso + pendientes accionables                                               | `estado-preparacion`      |
| `clausula-editor-inline.tsx`  | Editor ProseKit montado in-place en la clausula activa (una instancia); respeta solo-lectura por estado                 | `clausula-editor-inline`  |
| `insertar-dato-picker.tsx`    | Buscador (shadcn `Command`) sobre `insertable_variables`, agrupado por categoria, boton + atajo `@`                     | `insertar-dato-picker`    |
| `mesa-encabezado.tsx`         | Contexto (proyecto · lote · comprador), estado del caso, contador de pendientes, acciones primarias                     | `mesa-encabezado`         |
| `mesa-indice.tsx`             | Indice de clausulas con estado por clausula y reordenamiento dnd (fijas ancladas)                                       | `mesa-indice`             |
| `workflow-acciones.tsx`       | Enviar/aprobar/rechazar/generar con resumenes humanos; conserva dialogo warning ADR-009                                 | `workflow-acciones`       |
| `historial-generaciones.tsx`  | Reescritura humana de `generation-history`                                                                              | `historial-generaciones`  |
| `plantilla-editor.tsx`        | Autoria de clausula: titulo + editor + condiciones declarativas + alerta; sin JSON                                      | `plantilla-editor`        |
| `condicion-clausula-form.tsx` | Frase "Aparece solo si {dato} {condicion}" → `condition_key`/`condition_mode`                                           | `condicion-clausula-form` |

Componentes reutilizados sin cambios de logica:
`legal-evidence-viewer.tsx` (modo compact), primitivas `@/components/ui`
(`Popover`, `Command`, `Sheet`, `Badge`, `Button`, `Dialog`).

Componentes que se eliminan al cierre (FR-018, fase polish):
`matriz-builder.tsx`, `matriz-view-switch.tsx`, `matriz-clause-editor.tsx`,
`template-clause-form.tsx`.

## 3. Diccionario de microcopy de UI (fuente: `matriz-microcopy.ts`)

Vocabulario estatico de pantalla. Lo derivado de datos llega del API (ver
api-contracts). **Terminos prohibidos en pantalla**: token, blocker,
snapshot, gate, claves crudas (`comprador.*`), codigos de alerta, estados en
ingles, JSON.

| Concepto interno                 | Texto en pantalla                                                        |
| -------------------------------- | ------------------------------------------------------------------------ |
| token / variable                 | dato                                                                     |
| token resolved                   | Verificado                                                               |
| token blocked                    | Por revisar                                                              |
| token missing                    | Falta                                                                    |
| approval blockers                | Para aprobar falta                                                       |
| snapshot del caso                | el expediente del caso                                                   |
| snapshot stale                   | "El expediente cambio. Recarga para ver la version vigente."             |
| readiness gates                  | verificaciones del caso                                                  |
| draft                            | Borrador                                                                 |
| legal_review_pending             | En revision legal                                                        |
| approved                         | Aprobada                                                                 |
| superseded                       | Reemplazada                                                              |
| block token (titulo)             | "Texto aprobado en el estudio de titulo"                                 |
| fixed_position                   | "Esta clausula tiene posicion fija"                                      |
| optimistic-lock conflict         | "Otra persona guardo cambios. Recarga antes de seguir."                  |
| generate                         | Generar minuta                                                           |
| insertar variable                | Insertar dato                                                            |
| template draft/published/retired | Borrador / Publicada / Retirada                                          |
| clonar published                 | "Las plantillas publicadas no se modifican. Crea una copia en borrador." |

Regla de redaccion: oraciones completas, voz directa, es-CL, sin
anglicismos; siempre decir **que paso** y **que hacer ahora**.

## 4. Estados visuales del chip de dato

| Estado          | Apariencia                                                            | Accesibilidad                                                     |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Verificado      | fondo verde claro, texto verde oscuro                                 | contraste AA; estado tambien en texto del popover (no solo color) |
| Por revisar     | fondo azul claro, texto azul oscuro                                   | idem                                                              |
| Falta           | fondo ambar, texto ambar oscuro + nombre del dato visible en el hueco | idem; contabilizado en pendientes                                 |
| Bloque aprobado | banda lateral morada + candado + leyenda                              | focusable; explica donde se corrige                               |

Interaccion: click o Enter abre popover; Esc cierra y devuelve el foco al
chip; todo operable por teclado (FR-016).

## 5. Rutas

| Ruta                          | Cambio                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/documentos/matriz/[caseId]` | Renderiza `mesa-escritura` (preparacion o mesa). Sin ruta nueva: deep links existentes siguen validos. |
| `/documentos/plantillas`      | Renderiza biblioteca con `plantilla-editor` (sin JSON).                                                |
| `/documentos`                 | Tarjetas actualizadas al vocabulario de la mesa.                                                       |
| CCL del proyecto              | Caso de escritura muestra estado unificado + CTA "Abrir mesa de escritura".                            |

## 6. Contratos de regresion de presentacion

- Test de vocabulario prohibido: ningun string JSX de
  `components/documents/mesa/` contiene los terminos vetados (lista en
  seccion 3) — test web permanente.
- Los data-testid de la tabla (seccion 2) son contrato para los tests web.
- La logica pura conservada (reorder con fijas, resumen de pendientes,
  deteccion de conflicto) migra con sus tests desde
  `matriz-builder.test.ts`.
