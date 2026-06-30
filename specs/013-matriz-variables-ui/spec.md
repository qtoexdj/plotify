# Feature Specification: Matriz de Variables por Productor — Rediseño del Centro de Control Legal

**Feature Branch**: `013-matriz-variables-ui`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "Rehacer desde cero la Matriz de variables del proyecto. Hoy el Centro de Control Legal muestra 138 variables como una tabla por estado, con 117 'por revisar' que en realidad son ~13 decisiones (53 lotes SII repetidos), el grupo vendedor no tiene dónde revisarse, y los huecos de venta aparecen como pendientes aunque se llenan en la venta. Queremos una sola matriz, agrupada por quién llena cada variable (extraída / manual / autoría / hueco de venta), con la evidencia al lado, aprobación en bloque, las repeticiones por lote colapsadas, y progreso claro hacia 'molde aprobable'. El motor no se toca."

## Context

SDD 013 reconstruye **solo la capa de presentación** de la Matriz de variables del proyecto (la sección `#variables-legales` del Centro de Control Legal). No introduce ni modifica el motor de datos.

Lo que ya existe y NO se reconstruye (verificado contra Supabase real, proyecto Teno):

- Resolución, gates de preparación, snapshot del caso, puente operacional (`lot_records` → variables de venta), hook de venta y renderer DOCX (SDD 007→011).
- La clasificación canónica de **productor** por variable ya vive en el backend (`extracted / authored / manual / sale_gap / signing`), expuesta en los bloqueadores pero **no** en el inventario.
- Endpoints de aprobación en bloque y de ingreso manual por clave ya existen y funcionan.
- El motor valida la matriz del **proyecto sin los huecos de venta**: comprador, precio, lote y servidumbre se excluyen y se rellenan al validar la venta de cada lote.

Los problemas que este feature cierra (medidos en el proyecto real Teno):

1. **El conteo "por revisar" es un fantasma**: 117 mostrados = 13 decisiones distintas + 104 repeticiones de 2 campos SII por 53 lotes.
2. **Variables invisibles**: el grupo vendedor (4 variables extraídas del dominio) no tiene panel; no hay forma de revisarlo ni aprobarlo en la UI actual.
3. **Mosaico sin modelo**: paneles a medida (SAG, Plano, Roles SII, Título) en vez de un inventario único; el resto de los grupos no aparece.
4. **Ruido de venta**: los huecos de venta aparecen como `missing`/bloqueante en una pantalla donde no se editan.
5. **Sin norte**: no hay progreso hacia "molde del proyecto aprobable".

Regla de arquitectura heredada (no negociable):

1. **Solo presentación**: este feature no muta `variable_resolutions` fuera de los flujos existentes, no cambia el resolutor, los gates, el snapshot, el puente operacional, el hook de venta ni el renderer. El único cambio fuera del frontend es **exponer el productor ya calculado** en la respuesta del inventario (dato de lectura, sin migración).
2. **El productor es el eje**: la matriz se organiza por quién llena cada variable, no por su estado interno.
3. **Los huecos de venta no se editan aquí**: se muestran como "se completan en la venta" y no cuentan como pendientes del molde.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Revisar y aprobar el molde por productor (Priority: P1)

El operador entra a la matriz de variables de un proyecto y ve todas las variables del molde agrupadas por **productor**: extraídas del documento (las revisa), de ingreso manual (las completa), de autoría (toman plantilla) y huecos de venta (informativos). Por cada variable extraída/manual ve su valor propuesto, su confianza y su documento fuente, y puede aprobarla, corregirla o marcarla "no aplica" — hasta dejar el molde aprobable.

**Why this priority**: es el trabajo central que hoy es imposible o confuso; sin esto no hay matriz que aprobar y, por tanto, no hay ventas.

**Independent Test**: con el proyecto Teno, el operador puede ver las 13 decisiones reales agrupadas por productor, aprobar las extraídas y manuales, y llegar a "molde aprobable" sin pasar por la pantalla vieja.

**Acceptance Scenarios**:

1. **Given** un proyecto con variables extraídas pendientes, **When** el operador abre la matriz, **Then** ve las variables agrupadas por productor con valor, confianza y documento fuente.
2. **Given** una variable extraída seleccionada, **When** el operador abre su evidencia, **Then** ve el fragmento transcrito del documento que justifica el valor.
3. **Given** todas las variables no-venta resueltas, **When** el operador revisa el progreso, **Then** el molde aparece como aprobable y la acción "Aprobar molde" se habilita.

---

### User Story 2 - Colapsar repeticiones por lote y aprobar en bloque (Priority: P2)

Las variables que se repiten por lote (roles SII: nombre de unidad y pre-rol por cada lote) se muestran como **una sola entrada** ("Roles SII · N lotes") con acceso al detalle por lote. El operador puede aprobar en bloque las variables revisables de un grupo o fuente (p. ej. "Aprobar los 4 datos del vendedor", "Aprobar roles SII") sin clic por clic.

**Why this priority**: es lo que convierte 117 ítems en 13 y hace que revisar un proyecto real sea cuestión de minutos.

**Independent Test**: en Teno, las 106 filas SII aparecen como una entrada de 53 lotes y una acción "Aprobar" las resuelve todas; el conteo "por revisar" baja a 13.

**Acceptance Scenarios**:

1. **Given** variables que se repiten por lote, **When** el operador ve el grupo de roles SII, **Then** ve una sola entrada con el número de lotes y un acceso al detalle.
2. **Given** un grupo con varias variables revisables, **When** el operador aprueba en bloque, **Then** todas pasan a aprobadas y el progreso se actualiza.

---

### User Story 3 - Los huecos de venta son visibles pero no editables ni bloqueantes (Priority: P2)

El operador ve un bloque "Se completa en la venta" (comprador, precio, lote, servidumbre) que explica que esos datos los aporta la venta de cada lote y no se editan desde el molde. Estos datos **no** cuentan en el conteo de "por revisar" ni impiden aprobar el molde.

**Why this priority**: elimina el ruido que hoy infla los pendientes y confunde sobre qué es responsabilidad del operador del proyecto.

**Independent Test**: en un proyecto sin ventas, los grupos de venta aparecen como informativos, fuera del conteo de pendientes, y el molde puede aprobarse igual.

**Acceptance Scenarios**:

1. **Given** un proyecto con su molde, **When** el operador mira los huecos de venta, **Then** los ve marcados como "se completan en la venta", sin acciones de edición.
2. **Given** que solo quedan huecos de venta sin resolver, **When** el operador revisa el progreso, **Then** el molde figura como aprobable.

---

### User Story 4 - Un solo lugar para variables y escritura (Priority: P3)

La matriz de variables es la superficie principal de la sección legal del proyecto (los paneles a medida pasan a ser detalle de cada grupo), y desde ella el operador puede ir a la matriz de escritura resultante. Cuando hay ventas, ve cuántos borradores de venta cuelgan del molde.

**Why this priority**: centraliza el acceso hoy disperso (variables en una pestaña, escritura en otra ruta), pero no bloquea el valor central de US1–US3.

**Independent Test**: desde la matriz de variables, el operador llega a la matriz de escritura del proyecto sin salir a buscar otra ruta.

**Acceptance Scenarios**:

1. **Given** la matriz de variables abierta, **When** el operador busca la escritura, **Then** encuentra un acceso directo a la matriz de escritura del proyecto.

---

### User Story 5 - Revisar el borrador de venta de un lote (Priority: P2)

Cuando una venta se aprueba, se genera un borrador por lote que hereda el molde y trae los huecos de venta ya rellenos (comprador, precio, lote, servidumbre) desde el registro comercial. El operador/abogado revisa ese borrador con el **mismo modelo por productor**: ahora los huecos de venta aparecen con valor y su origen ("desde la venta"), y se revisan/aprueban con la misma mecánica de evidencia antes de la revisión legal y la minuta.

**Why this priority**: cierra el ciclo que el alcance completo exige; sin esta vista el borrador de venta seguiría dependiendo de la mesa de escritura sin una matriz de variables coherente.

**Independent Test**: con un lote vendido y validado, el operador abre su borrador y ve las variables de venta rellenas y el resto heredado del molde, todo agrupado por productor.

**Acceptance Scenarios**:

1. **Given** una venta validada de un lote, **When** el operador abre el borrador, **Then** ve los huecos de venta con valor y marcados como "desde la venta".
2. **Given** un borrador de venta, **When** el operador revisa sus variables, **Then** las ve agrupadas por productor, heredando del molde lo no-venta y mostrando lo de venta ya resuelto.

---

### Edge Cases

- Variable extraída sin evidencia o sin confianza registrada: se muestra el valor y se indica la ausencia, sin romper la fila.
- Grupos canónicos sin variables pobladas (los grupos vacíos del catálogo): no generan ruido; se omiten o se muestran como "sin datos aún".
- Conflicto entre extracciones de una misma clave: la variable se marca para resolución y no se puede aprobar en bloque hasta resolverla.
- Re-ingesta que devuelve a "propuesta" una variable ya aprobada: la matriz lo refleja y vuelve a pedir revisión.
- Proyecto sin lotes SII vs. proyecto con decenas: la entrada colapsada de roles muestra el conteo correcto (incluido 0).
- Variable de autoría sin default disponible: se muestra como pendiente de plantilla, no como dato faltante del operador.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema MUST agrupar las variables del proyecto por productor (extraída, manual, autoría, hueco de venta) como organización principal de la matriz.
- **FR-002**: El sistema MUST mostrar, por cada variable extraída o manual, su valor propuesto, su confianza y su documento fuente, con acceso a la evidencia que lo justifica.
- **FR-003**: El operador MUST poder aprobar, corregir o marcar "no aplica" una variable individual.
- **FR-004**: El sistema MUST permitir aprobar en bloque las variables revisables de un grupo o de una fuente.
- **FR-005**: El sistema MUST colapsar en una sola entrada las variables que se repiten por lote, con acceso al detalle por lote y conteo de lotes.
- **FR-006**: El sistema MUST excluir los huecos de venta del conteo de "por revisar", mostrarlos como "se completan en la venta" y no permitir su edición desde el molde del proyecto.
- **FR-007**: El sistema MUST mostrar el progreso del molde (variables no-venta resueltas sobre el total revisable) y habilitar "Aprobar molde" solo cuando no queden variables revisables pendientes.
- **FR-008**: El sistema MUST mostrar todas las variables pobladas del proyecto en una sola pantalla, incluido el grupo vendedor, sin depender de paneles separados por tipo.
- **FR-009**: Las variables de autoría con default disponible MUST mostrarse como "al día / usa plantilla" sin contar como pendientes del operador.
- **FR-010**: El sistema MUST ofrecer un acceso directo desde la matriz de variables a la matriz de escritura del proyecto.
- **FR-011**: El sistema MUST preservar el comportamiento existente de resolución, aprobación, snapshot, generación de minuta y flujo de venta (sin regresión).
- **FR-012**: El sistema MUST mostrar la matriz del borrador de venta de un lote organizada por el mismo modelo de productor, con los huecos de venta ya rellenos desde la venta y marcados como tales, heredando del molde las variables no-venta.
- **FR-013**: El detalle por lote de los roles SII MUST permitir el ajuste manual de un rol, preservando la capacidad que hoy ofrece el panel especializado, para no perder funcionalidad al reemplazar los paneles a medida.

### Key Entities _(include if feature involves data)_

- **Variable del proyecto**: una propiedad canónica del proyecto, con clave, grupo, productor, valor propuesto, estado, confianza, documento fuente y evidencia.
- **Productor**: quién y cuándo llena la variable — extraída (extracción/agente), manual (operador, desde plano/Conservador), autoría (plantilla de la organización), hueco de venta (la venta de cada lote), firma (notaría).
- **Molde del proyecto**: el conjunto de variables no-venta del proyecto y su estado de aprobación/progreso.
- **Grupo de roles por lote**: la representación colapsada de las variables SII que se repiten por cada lote, con su detalle.
- **Borrador de venta**: el caso de escritura por lote que cuelga del molde una vez aprobada la venta (referencia, no se edita aquí).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El número de ítems "por revisar" que ve el operador refleja decisiones distintas: en un proyecto con roles por lote, el colapso reduce el conteo mostrado en más del 85% (Teno: de 117 a 13).
- **SC-002**: Un operador puede revisar y resolver todas las variables revisables de un proyecto real (Teno: 13) en una sola pantalla y en menos de la mitad del tiempo que toma hoy.
- **SC-003**: El 100% de las variables pobladas del proyecto, incluido el grupo vendedor, es visible y accionable desde la matriz (hoy vendedor no aparece).
- **SC-004**: Los huecos de venta nunca aparecen como bloqueantes ni cuentan como pendientes del molde en un proyecto sin ventas.
- **SC-005**: El molde de un proyecto real puede aprobarse desde la nueva matriz sin recurrir a la pantalla anterior.
- **SC-006**: Cero regresiones en los flujos de aprobación de matriz, snapshot, generación de minuta y venta (suites de prueba existentes en verde).

## Assumptions

- El motor de variables (resolución, gates, snapshot, puente operacional, hook de venta, aprobación en bloque, ingreso manual por clave) ya existe y no se modifica; el único cambio fuera del frontend es exponer el productor —ya calculado— en la respuesta del inventario.
- Los datos de comprador, precio, lote y servidumbre provienen de la venta comercial vía el puente operacional y no se editan en esta pantalla.
- La aprobación del molde hereda el comportamiento actual (four-eyes opcional, desactivado por defecto).
- El alcance de SDD 013 cubre la matriz de variables en sus **dos niveles**: el molde del proyecto y el borrador de venta por lote (donde los huecos de venta aparecen ya rellenos desde la venta). La matriz de escritura (el documento) se enlaza pero su rediseño queda fuera.
- La unificación **reemplaza por completo** los paneles a medida actuales (SAG, Plano, Roles SII, Título): no conviven con la nueva matriz. Toda capacidad fina que hoy vive en esos paneles (en particular el ajuste manual de roles SII por lote) se preserva dentro del detalle genérico de su grupo (FR-013).
- El catálogo canónico de variables y su clasificación de productor son la fuente de verdad para el agrupamiento.
