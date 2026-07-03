# Feature Specification: Motor de Servidumbres de Precision para Visor de Proyecto

**Feature Branch**: `014-servidumbre-precision-visor`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Crear SDD14 para mejorar el calculo y renderizado de servidumbres del visor de proyecto. El calculo debe tomar caminos designados en onboarding desde KMZ no uniformes, calcular solo la superficie del camino que afecta cada lote, soportar anchos como 5, 10 y 5 y 10 segun plano real Teno, mostrar superficie total, servidumbre y superficie util, renderizar la huella afecta y alinear los tests para asegurar una implementacion correcta."

## Context

El flujo core de Plotify depende de que la geometria del KMZ y del plano oficial produzca valores legales confiables. En servidumbres, el dato de negocio no es "un camino existe cerca del lote", sino la superficie exacta del lote que queda afecta por la huella del camino. El plano real Teno muestra una tabla donde cada lote tiene:

- superficie util
- superficie de servidumbre
- ancho de servidumbre
- superficie total

La relacion esperada es:

```text
superficie total = superficie util + superficie de servidumbre
superficie util = superficie total - superficie de servidumbre
```

El plano tambien muestra servidumbres de 5 metros, 10 metros y combinaciones "5 Y 10" en un mismo lote. Por lo tanto, el sistema debe dejar de tratar el proyecto como si tuviera un unico ancho global suficiente para todos los caminos y lotes.

La regla de dominio para este feature es:

```text
servidumbre del lote = area de la huella de camino que intersecta el poligono del lote
```

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Calcular servidumbre desde huellas reales y anchos por camino (Priority: P1)

El administrador carga un KMZ, designa que geometrias son lotes y que geometrias son caminos, indica como se debe interpretar cada camino y define su ancho cuando corresponde. El sistema calcula por cada lote la superficie afecta a servidumbre usando solo la interseccion entre el lote y la huella del camino.

**Why this priority**: sin este calculo no hay superficie util confiable, y la escritura puede terminar usando valores legales equivocados.

**Independent Test**: con fixtures geometricos controlados, un camino de 5 metros, uno de 10 metros y una huella poligonal ya dibujada producen areas afectas esperadas dentro de cada lote, sin depender de la UI.

**Acceptance Scenarios**:

1. **Given** un lote de 5.000 m2 y una huella de camino de 300 m2 dentro del lote, **When** se recalcula la servidumbre, **Then** el lote queda con 300 m2 de servidumbre y 4.700 m2 utiles.
2. **Given** un camino representado como eje con ancho 10 m, **When** se calcula su huella, **Then** la huella corresponde al ancho completo del camino y solo se considera la porcion dentro del lote.
3. **Given** un camino representado como poligono, **When** se calcula servidumbre, **Then** el sistema usa ese poligono como huella y no le aplica un segundo ensanche.
4. **Given** dos caminos que se superponen dentro del mismo lote, **When** se calcula servidumbre, **Then** el area superpuesta se cuenta una sola vez.

---

### User Story 2 - Registrar y mostrar anchos multiples por lote (Priority: P1)

El administrador ve que un lote puede quedar afecto por una servidumbre de 5 m, de 10 m o por ambas. El sistema registra los anchos que realmente afectan al lote y los muestra de forma equivalente al plano, por ejemplo "5", "10" o "5 y 10".

**Why this priority**: el plano real Teno usa anchos multiples por lote; un unico numero por lote no representa el dominio.

**Independent Test**: con un fixture donde un lote intersecta un camino de 5 m y otro de 10 m, el resultado guarda ambos anchos, muestra "5 y 10" y mantiene la superficie afecta sin doble conteo.

**Acceptance Scenarios**:

1. **Given** un lote afectado solo por camino de 5 m, **When** se visualiza su informacion, **Then** el ancho mostrado es "5 m".
2. **Given** un lote afectado por caminos de 5 m y 10 m, **When** se visualiza su informacion y se genera su variable documental, **Then** el ancho mostrado es "5 y 10 m".
3. **Given** un lote sin servidumbre, **When** se visualiza su informacion, **Then** no se muestra ancho de servidumbre ni se activa texto legal de servidumbre.

---

### User Story 3 - Renderizar la superficie afecta en el visor (Priority: P2)

El administrador abre el visor de proyecto y ve no solo la linea o poligono original del camino, sino tambien la superficie afecta de servidumbre sobre los lotes, diferenciada visualmente de los lotes y del camino.

**Why this priority**: sin overlay de huella afecta, el usuario no puede validar visualmente que el calculo coincide con el plano.

**Independent Test**: con un proyecto fixture que tiene lotes, camino y huella afecta calculada, el visor expone una capa de servidumbre renderizable y la informacion del lote seleccionado coincide con la capa.

**Acceptance Scenarios**:

1. **Given** un lote con servidumbre calculada, **When** el usuario abre el visor, **Then** la huella afecta se muestra sobre el lote con una capa diferenciada.
2. **Given** el usuario selecciona un lote con servidumbre, **When** mira el panel de informacion, **Then** ve superficie total, servidumbre, superficie util y ancho(s) aplicables.
3. **Given** una servidumbre recalculada despues de cambiar caminos, **When** el visor refresca, **Then** la capa muestra la huella recalculada y no una geometria obsoleta.

---

### User Story 4 - Mantener consistencia legal y documental (Priority: P2)

El flujo legal y documental consume la misma verdad calculada que ve el administrador en el visor. La superficie de servidumbre, superficie util y anchos mostrados en pantalla coinciden con lo que se usa para variables y documentos.

**Why this priority**: el visor es fuente operacional; los documentos no pueden divergir de la tabla legal del lote.

**Independent Test**: una venta o escritura generada desde un lote con servidumbre usa la misma superficie y ancho(s) que quedaron persistidos tras el recalculo.

**Acceptance Scenarios**:

1. **Given** un lote con servidumbre de 300 m2 y ancho "5 y 10", **When** se preparan las variables documentales, **Then** los valores documentales usan 300 m2 y "5 y 10".
2. **Given** un administrador corrige oficialmente la superficie de servidumbre, **When** el lote se verifica, **Then** queda claro que el valor oficial reemplaza al calculado y se mantiene trazabilidad.

---

### User Story 5 - Validar contra casos de plano real y regresiones geometricas (Priority: P2)

El equipo implementador cuenta con una suite de pruebas que cubre los casos que el plano real exige: huella poligonal directa, eje con ancho, anchos 5/10, combinacion "5 y 10", lotes sin servidumbre, geometrias multipartes y ausencia de doble conteo.

**Why this priority**: este calculo es fundacional; una regresion silenciosa afecta superficies, escritura y confianza legal.

**Independent Test**: la suite automatizada falla si se vuelve al modelo de ancho unico global, si se mezcla area geodesica con area legal UTM o si se pierde la huella renderizable.

**Acceptance Scenarios**:

1. **Given** la suite de geometria, **When** se ejecuta, **Then** cubre centro de camino, poligono de camino, anchos multiples, doble conteo y MultiPolygon con huecos.
2. **Given** un fixture tipo Teno, **When** se validan los totales, **Then** cada lote cumple que superficie util + servidumbre = superficie total dentro de tolerancia definida.
3. **Given** cambios al onboarding o al visor, **When** se ejecutan los tests de integracion, **Then** verifican que los datos persistidos alimentan el visor y los documentos.

### Edge Cases

- Camino designado como linea sin modo claro: el sistema debe pedir confirmacion de interpretacion antes de calcular valores persistentes.
- Camino designado como poligono o multipoligono: se usa como huella directa, no como eje a ensanchar.
- Camino designado como eje: el ancho completo se aplica alrededor del eje.
- Camino de borde: solo puede calcularse si el usuario define el lado afecto o acepta una previsualizacion inequívoca.
- Dos o mas huellas se superponen dentro del mismo lote: la interseccion final no debe contar dos veces la zona compartida.
- Lote MultiPolygon o con huecos internos: el area de servidumbre debe respetar todos los componentes y descontar huecos.
- Camino fuera del lote o tangente sin area: servidumbre igual a cero, sin ancho mostrado.
- Proyecto con caminos de distintos anchos: el resultado por lote debe conservar todos los anchos que lo afectan.
- Lote con superficie oficial verificada: la superficie util debe usar la base oficial cuando existe.
- Correccion manual de servidumbre: debe quedar distinguida del valor calculado y no ser sobrescrita sin recalculo explicito.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema MUST modelar cada camino asignado con una interpretacion explicita: eje, huella poligonal o borde con lado afecto.
- **FR-002**: El sistema MUST permitir registrar ancho por camino o tramo de camino, no solo un ancho global de proyecto.
- **FR-003**: El sistema MUST convertir cada camino asignado en una huella de servidumbre antes de intersectarlo con lotes.
- **FR-004**: El sistema MUST calcular la servidumbre de cada lote como la interseccion entre el lote y la union de huellas que lo afectan.
- **FR-005**: El sistema MUST evitar doble conteo cuando dos o mas huellas de camino se superponen dentro del mismo lote.
- **FR-006**: El sistema MUST calcular superficie total, superficie de servidumbre y superficie util sobre la misma base legal de medicion.
- **FR-007**: El sistema MUST soportar y persistir anchos multiples por lote, incluyendo la representacion "5 y 10".
- **FR-008**: El sistema MUST impedir calculos nuevos desde ancho global de proyecto; los proyectos existentes deben transformarse o recargarse con `project_road_segments` antes de recalcular.
- **FR-009**: El sistema MUST renderizar en el visor una capa diferenciada de huella afecta de servidumbre.
- **FR-010**: El panel de lote MUST mostrar superficie total, servidumbre, superficie util y ancho(s) aplicables de forma coherente con el plano.
- **FR-011**: El sistema MUST recalcular servidumbres cuando se asigna, cambia o elimina un camino que afecta al proyecto.
- **FR-012**: El sistema MUST recalcular servidumbre de un lote cuando se asigna o cambia su geometria despues de existir caminos.
- **FR-013**: El sistema MUST preservar overrides oficiales de superficie, deslindes y servidumbre, distinguiendolos del calculo automatico.
- **FR-014**: Las variables y documentos MUST consumir los mismos valores persistidos que muestra el visor para servidumbre y superficie util.
- **FR-015**: La implementacion MUST incluir pruebas automatizadas para eje con ancho, huella poligonal directa, anchos multiples, doble conteo, lotes sin servidumbre, MultiPolygon/huecos y fixture tipo Teno.
- **FR-016**: El sistema MUST rechazar o dejar pendiente cualquier camino ambiguo cuya interpretacion no permita calcular una huella confiable.
- **FR-017**: El sistema MUST exponer trazabilidad suficiente para saber que caminos/tramos aportaron a la servidumbre de cada lote.
- **FR-018**: El sistema MUST mantener la generacion de texto legal de servidumbre alineada con la huella calculada y con los anchos aplicables.

### Key Entities _(include if feature involves data)_

- **Camino asignado**: geometria designada por el usuario durante onboarding como camino o servidumbre de transito, con modo de interpretacion, ancho, nombre/tramo y fuente.
- **Huella de servidumbre**: poligono real que representa el area del camino que puede afectar lotes. Puede venir directa del KMZ o derivarse de un eje/borde confirmado.
- **Resultado de servidumbre por lote**: superficie afecta, superficie util, ancho(s), geometria intersectada y trazabilidad de caminos que aportaron al resultado.
- **Override oficial**: correccion administrativa que reemplaza valores calculados para uso legal, con estado de verificacion y auditoria.
- **Capa de visor de servidumbre**: conjunto renderizable de huellas afectas por lote para validacion visual.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: En fixtures controlados, el 100% de los lotes cumple `superficie util + servidumbre = superficie total` dentro de una tolerancia maxima de 0,5 m2.
- **SC-002**: La suite automatizada cubre al menos 8 escenarios de servidumbre: eje 5 m, eje 10 m, poligono directo, anchos 5 y 10, doble conteo, sin interseccion, MultiPolygon/huecos y lote asignado despues del camino.
- **SC-003**: Un lote afectado por caminos de 5 m y 10 m muestra "5 y 10" tanto en visor como en datos documentales.
- **SC-004**: Ningun lote con caminos superpuestos registra mas area afecta que la union real de las huellas dentro del lote.
- **SC-005**: El visor muestra una capa de servidumbre para todos los lotes con `servidumbre_m2 > 0` y no la muestra para lotes sin area afecta.
- **SC-006**: Proyectos sin `project_road_segments` no calculan servidumbres desde `projects.road_geometry`; deben recargarse o transformarse a tramos canonicos con ancho explicito.
- **SC-007**: La validacion tipo Teno incluye lotes con ancho 5, 10, 5 y 10, y lotes sin servidumbre.
- **SC-008**: La implementacion no puede cerrarse hasta que pasen los tests de geometria, onboarding/persistencia, visor y documentos definidos en `tasks.md`.

## Assumptions

- El KMZ no es uniforme; por eso onboarding debe conservar la decision humana sobre que geometrias son lotes, caminos o areas comunes.
- Cuando el usuario marca un camino como poligono, ese poligono representa la huella afecta y no requiere buffer.
- Cuando el usuario marca un camino como eje, el ancho ingresado es el ancho total de la servidumbre.
- Cuando el usuario no puede identificar si una linea es eje o borde, el sistema debe tratarla como ambigua y pedir confirmacion visual antes de persistir calculos.
- El PDF Teno se usa como referencia de dominio y validacion, pero la implementacion se apoya en fixtures reproducibles, no en parsing automatico del PDF.
- `project_road_segments` es la fuente canonica para caminos y anchos; `road_geometry` y `road_width_m` pueden existir en base por historia, pero no participan en nuevos calculos ni en el render del visor SDD14.
