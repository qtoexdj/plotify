# Feature Specification: Creador de Matriz y Minuta DOCX

**Feature Branch**: `[008-creador-matriz]`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Con SDD 007 (variables con evidencia, snapshots,
readiness) y SDD 009 (agente de titulo: cadena estructurada y bloques
narrativos aprobados) cerrados, construir el creador de matriz: una interfaz
profesional nueva en /documentos donde el equipo legal compone la matriz de la
escritura de compraventa con clausulas versionadas y tokens de variables
ligados al snapshot del caso, reordena clausulas, previsualiza en modos
template/resuelto/evidencia y genera la minuta DOCX desde el snapshot
aprobado, con flujo de revision juridica antes de cualquier uso externo."

## Context

SDD 008 parte desde dos contratos congelados:

- `specs/007-escrituras-variable-resolution/handoff-sdd-008.md`: capa de
  variables confiable — catalogo canonico, `variable_resolutions` aprobadas,
  `escritura_cases` con `variable_snapshot`/`evidence_snapshot`/
  `readiness_gates`, matching de rol por lote y gate de revision legal.
- `specs/009-titulo-dominio-vigente/handoff-sdd-008-addendum.md`: capa de
  titulo — `titulo.estructura`, `titulo.inscripciones[]`,
  `titulo.propietarios[]`, bloques narrativos aprobados
  (`titulo.comparecencia_vendedor_texto`, `titulo.clausula_primero_texto`),
  `titulo.alertas_resueltas[]` con contrato de clausulas obligatorias, y la
  remocion de `matriz.inscripcion_*`/`matriz.adquisicion_*` del catalogo.

Reglas de arquitectura heredadas (no negociables):

1. **El creador de matriz consume snapshots, nunca extraccion viva.** Si un
   valor esta mal, el usuario vuelve al Centro de Control Legal (SDD 007/009),
   corrige alli, se genera un nuevo snapshot y la matriz se re-renderiza.
   SDD 008 jamas muta `variable_resolutions`.
2. **El dominio `titulo.*` solo existe con caso de titulo aprobado.** Mientras
   `title_verified` este bloqueado, la matriz muestra la causa con deep link
   al panel de titulo, nunca renderiza una matriz parcial.
3. **Los bloques narrativos entran como tokens de bloque** (nodos de parrafo
   completo, texto ya aprobado por abogado). Las referencias registrales
   (clausula SEXTO y cualquier cita de inscripciones) se templan sobre
   `titulo.inscripciones[]` estructurado con conversion deterministica de
   numeros a palabras (`services/legal_title_words.py`), nunca re-parseando
   los bloques narrativos.
4. **Sin artefactos finales de notaria/CBR**: nada de CVE, repertorio final,
   sellos ni certificaciones. El output es una minuta DOCX para revision.

Codigo existente: las paginas MVP `/documentos` (plantillas, bloques,
generar, historial), `prosekit-editor.tsx`, `template-builder.tsx`,
`document_engine.py` y `document_generator.py` son material de referencia,
no restricciones. La interfaz nueva se construye desde cero. ProseKit,
dnd-kit y python-docx ya estan en las dependencias.

**Decision tecnica 1 (resuelta segun recomendacion de ambos handoffs)**:
ProseMirror JSON es la fuente canonica del contenido de clausulas, con
pipeline de export explicito a DOCX. Los tokens de variables necesitan
atributos estructurados (`variableKey`, `label`, `state`, `evidenceId`) que
HTML/Jinja no modela de forma confiable.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Componer la matriz desde el snapshot (Priority: P1)

Como redactor legal, quiero componer la matriz de la escritura en un editor
de clausulas versionadas con tokens estructurados ligados al snapshot del
caso de escritura, para producir el borrador completo sin copiar/pegar datos
desde documentos fuente.

**Why this priority**: Es el nucleo del feature; sin composicion no hay
minuta. Todo lo demas (preview, DOCX, revision) depende de esto.

**Independent Test**: Con el corpus Teno (caso de titulo aprobado + snapshot
creado), abrir el builder, insertar el token de bloque
`titulo.clausula_primero_texto`, templar la clausula SEXTO sobre
`titulo.inscripciones[]` y verificar que cada token muestra su valor del
snapshot con su estado, sin ninguna llamada a extraccion viva.

**Acceptance Scenarios**:

1. **Given** un caso de escritura con snapshot completo, **When** el redactor
   abre el builder de matriz, **Then** ve la plantilla activa de compraventa
   con sus clausulas ordenadas, y cada token resuelto desde
   `variable_snapshot` con su estado visible.
2. **Given** una clausula con el token de bloque
   `titulo.comparecencia_vendedor_texto`, **When** se renderiza, **Then** el
   texto aprobado se inserta como parrafo completo no editable inline (la
   correccion vive en el panel de titulo) con indicador de origen.
3. **Given** la clausula SEXTO con seccion repetible sobre
   `titulo.inscripciones[]`, **When** el snapshot trae N inscripciones,
   **Then** se renderizan N referencias registrales con fojas/numero/anio/CBR
   en palabras generadas deterministicamente.
4. **Given** un token cuya clave no existe en el snapshot, **When** se
   renderiza la matriz, **Then** el token queda marcado `missing` y la matriz
   no puede pasar a revision con tokens missing sin decision explicita.

---

### User Story 2 - Generar la minuta DOCX desde snapshot aprobado (Priority: P1)

Como redactor legal, quiero generar la minuta DOCX desde la version aprobada
de la matriz y el snapshot del caso, con el warning obligatorio de revision
legal, para entregar el borrador al abogado/notaria.

**Why this priority**: Es el entregable de negocio de toda la linea
SDD 006→009: el documento que hoy se redacta a mano.

**Independent Test**: Con la matriz Teno compuesta y aprobada, generar el
DOCX y verificar que abre en Word, que la clausula PRIMERO contiene el texto
aprobado verbatim, que las referencias del SEXTO calzan con
`titulo.inscripciones[]` y que el documento queda registrado con version de
plantilla, id de snapshot y hash.

**Acceptance Scenarios**:

1. **Given** una matriz en estado aprobado, **When** se genera el DOCX,
   **Then** el archivo se produce desde el snapshot + version de plantilla
   (nunca desde estado vivo del editor) y queda auditado (quien, cuando, que
   version, que snapshot).
2. **Given** una matriz con tokens `missing` o gates de readiness bloqueados,
   **When** se intenta generar, **Then** la generacion se bloquea listando
   las causas con deep links a donde se corrigen.
3. **Given** cualquier generacion, **When** el usuario descarga, **Then**
   antes acepta el warning de revision legal obligatoria (ADR-009) y la
   aceptacion queda registrada.

---

### User Story 3 - Vistas template / resuelto / evidencia (Priority: P2)

Como abogado revisor, quiero alternar entre ver la matriz con tokens, con
valores resueltos y con evidencia por dato, para auditar el borrador sin
salir del builder.

**Why this priority**: La confianza del abogado depende de poder rastrear
cada dato a su evidencia en 2 clics (mismo estandar que SDD 009 SC-005).

**Acceptance Scenarios**:

1. **Given** la vista evidencia, **When** el abogado hace click en un token,
   **Then** ve snippet, pagina y documento desde `evidence_snapshot`, y un
   link "corregir en Centro de Control Legal" (la matriz no edita el valor).
2. **Given** un token en estado distinto de aprobado/resuelto, **When** se
   muestra en cualquier vista, **Then** su estado es visualmente distinguible
   y contabilizado en el resumen de pendientes del caso.

---

### User Story 4 - Orden de clausulas y clausulas obligatorias por alertas (Priority: P2)

Como redactor legal, quiero reordenar clausulas con drag & drop donde la
estructura legal lo permite, y que el builder me exija las clausulas
comprometidas por alertas resueltas como `clause_added`, para que la matriz
cumpla los compromisos juridicos del caso.

**Why this priority**: El contrato de alertas del addendum SDD 009 es lo que
convierte el checklist del abogado en regla ejecutable.

**Acceptance Scenarios**:

1. **Given** clausulas reordenables, **When** el redactor las arrastra,
   **Then** el orden persiste explicitamente (dnd-kit es UI, nunca fuente de
   reglas legales) y las clausulas fijas (comparecencia, PRIMERO) no se
   mueven fuera de su posicion estructural.
2. **Given** una alerta `dl_3516` resuelta `clause_added` en el snapshot,
   **When** la plantilla no contiene la clausula correspondiente, **Then** el
   builder muestra un bloqueo de aprobacion con la clausula faltante segun la
   tabla del addendum (dl_3516, derechos_aguas, vigente_en_el_resto,
   multi_inmueble, gravamen, personeria_requerida, discrepancia_declaracion).
3. **Given** alertas `dismissed_with_reason`, **When** el abogado revisa,
   **Then** la razon es visible en el sidebar de revision.

---

### User Story 5 - Flujo de revision juridica de la minuta (Priority: P3)

Como abogado, quiero un flujo borrador → revision legal pendiente → minuta
aprobada con auditoria, para que ningun DOCX salga a uso externo sin gate
humano.

**Acceptance Scenarios**:

1. **Given** una matriz en borrador, **When** el redactor la envia a
   revision, **Then** queda `legal_review_pending` y solo un revisor
   autorizado puede aprobarla (auditado en `legal_review_decisions`).
2. **Given** una minuta aprobada, **When** el snapshot del caso se supersede
   (correccion aguas arriba), **Then** la matriz vuelve a borrador con las
   diferencias señaladas y la aprobacion anterior queda en historial.

### User Story 6 - Puente de datos operacionales: comprador, precio y lote (Priority: P1)

Como operador legal, quiero que al crear el caso de escritura Plotify proponga
automaticamente los datos que ya viven en el sistema operacional — comprador
desde el registro de venta del lote, precio/abono/saldo desde la venta,
deslindes y superficies desde la geometria oficial del lote, y servidumbre
desde el analisis geometrico — como variables auditables en el Centro de
Control Legal, para que los gates `party_verified`, `price_verified` y
`geometry_verified` no dependan de digitacion manual de datos que Plotify ya
conoce.

**Why this priority**: Sin esto la matriz no llega a produccion: hoy ningun
productor llena `comprador.*`, `transaccion.*` ni `lote.deslindes` en
`variable_resolutions`; los tres gates quedarian rojos para siempre salvo
digitacion manual completa. La data existe (`lot_records.cliente_*`,
`lot_records.valor/abono/saldo`, `lots.boundaries_official`,
`lots.area_official_m2`, `lots.servidumbre_*`) y el catalogo ya contempla
`source_type` `system`/`geometry`/`derived`.

**Independent Test**: Con un lote vendido con registro de venta completo y
geometria oficial, crear el caso de escritura y verificar que
`comprador.nombre/rut/domicilio/estado_civil/profesion_giro`,
`transaccion.precio_numeros/precio_letras/moneda/forma_pago`,
`lote.numero/superficie_m2/superficie_texto/deslindes` y `servidumbre.*`
quedan `proposed` con su `source_ref` operacional, revisables en el Centro de
Control Legal, y que `transaccion.precio_letras` es la conversion
deterministica a palabras del precio numerico.

**Acceptance Scenarios**:

1. **Given** un lote vendido con `lot_records` completo, **When** se crea el
   caso de escritura, **Then** las variables `comprador.*` y `transaccion.*`
   quedan `proposed` con `source_type="system"` y `source_ref` apuntando al
   registro de venta; nada se auto-aprueba.
2. **Given** un lote con `boundaries_official` y superficies oficiales,
   **When** se crea el caso, **Then** `lote.deslindes` se compone
   deterministicamente desde el JSONB de deslindes oficiales,
   `lote.superficie_texto`/`lote.superficie_ha_texto` se derivan en palabras
   con el conversor compartido (`legal_title_words.py`), todo con
   `source_type="geometry"`/`"derived"`.
3. **Given** un dato operacional faltante (p. ej. sin estado civil del
   cliente), **When** se crea el caso, **Then** la variable queda `missing` y
   el gate correspondiente la lista como causa, con correccion manual
   auditada en el Centro de Control Legal.
4. **Given** que el operador corrige el registro de venta despues de creado
   el caso, **When** se re-evalua readiness, **Then** la propuesta
   operacional se actualiza como nueva propuesta (la anterior `superseded`),
   nunca editando silenciosamente un valor ya aprobado.

---

### Edge Cases

- Snapshot supersedido mientras el builder esta abierto: el builder detecta
  el cambio, ofrece recargar y nunca genera DOCX desde snapshot viejo.
- Plantilla que referencia claves removidas del catalogo
  (`matriz.inscripcion_*`): el builder marca el token invalido con migracion
  sugerida a `titulo.inscripciones[]`.
- Multiples propietarios/compradores: las secciones de comparecencia y firmas
  repiten sobre `titulo.propietarios[]` y los datos de comprador del caso.
- Arrays vacios donde la clausula los exige (sin inscripciones, sin
  servidumbre cuando `servidumbre.aplica` es falso): la clausula condicional
  se omite o bloquea segun su regla declarada, nunca renderiza vacio
  silencioso.
- Dos redactores editando la misma matriz: ultima version gana con deteccion
  de conflicto de version (optimistic locking), sin corrupcion del JSON.
- Export DOCX de contenido ProseMirror con nodos desconocidos: la exportacion
  falla explicita listando los nodos, nunca los omite en silencio.
- Numeros en clausulas nuevas escritas a mano: el redactor es responsable; el
  builder ofrece el conversor a palabras como utilidad, pero la matriz no
  re-verifica texto manual (la frontera de verificacion automatica es el
  snapshot).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a new matriz builder interface under
  `/documentos` replacing the MVP plantillas/bloques/generar pages as the
  production path (MVP pages become reference-only/removed).
- **FR-002**: System MUST store clause content as ProseMirror JSON (canonical
  source) in a versioned clause/template model: templates have versions;
  publishing a new version never mutates documents already generated.
- **FR-003**: System MUST model variable tokens as structured ProseMirror
  nodes with attributes `variableKey`, `label`, `state`, `evidenceId`;
  token state renders from the case snapshot at view time.
- **FR-004**: System MUST support block-level tokens for
  `titulo.comparecencia_vendedor_texto` and `titulo.clausula_primero_texto`
  inserted as whole-paragraph nodes, not inline scalars, marked as
  lawyer-approved content not editable inline in the matriz.
- **FR-005**: System MUST support repeating sections bound to array snapshot
  keys (`titulo.inscripciones[]`, `titulo.propietarios[]`,
  `vendedor.representantes[]`) with deterministic numbers-to-words rendering
  for registral references reusing `services/legal_title_words.py`.
- **FR-006**: System MUST resolve tokens exclusively from
  `escritura_cases.variable_snapshot` and evidence from `evidence_snapshot`;
  the builder never reads `variable_resolutions` live nor mutates them.
- **FR-007**: System MUST block matriz approval and DOCX generation while:
  readiness gates are blocked, tokens are `missing`/unresolved, or a
  `clause_added` alert lacks its required clause; each blocker lists its
  cause and deep-links to where it is fixed (title panel, Centro de Control
  Legal, or the clause library).
- **FR-008**: System MUST enforce the alert-clause contract from the SDD 009
  addendum: `clause_added` requires the mapped clause present;
  `acknowledged` carries no obligation; `dismissed_with_reason` surfaces the
  reason in the review sidebar.
- **FR-009**: System MUST provide three preview modes: template tokens,
  resolved values, and evidence review (snippet + page + document per token,
  reachable in at most 2 clicks).
- **FR-010**: System MUST support clause ordering via drag & drop persisted
  as explicit order; structurally fixed clauses (comparecencia, PRIMERO)
  are not reorderable; order is presentation state, never legal logic.
- **FR-011**: System MUST generate the minuta DOCX server-side from approved
  matriz version + case snapshot + template version, recording generator
  inputs (snapshot id, template version, content hash) in an auditable
  registry; generation from live editor state is forbidden.
- **FR-012**: System MUST require explicit acknowledgement of the mandatory
  legal review warning before any DOCX download, recording who and when.
- **FR-013**: System MUST implement the revision workflow draft →
  `legal_review_pending` → `approved` with authorized-reviewer gate audited
  via `legal_review_decisions`; snapshot supersession reverts the matriz to
  draft preserving approval history.
- **FR-014**: System MUST detect snapshot supersession while editing and
  offer reload; stale-snapshot DOCX generation is rejected server-side.
- **FR-015**: System MUST validate templates against the canonical variable
  catalog: unknown or removed keys (`matriz.inscripcion_*`,
  `matriz.adquisicion_*`) are flagged with suggested migration to
  `titulo.inscripciones[]`.
- **FR-016**: System MUST enforce tenant isolation (organization/project) on
  all new records and endpoints, following SDD 007 RLS patterns.
- **FR-017**: System MUST keep the correction boundary: token values, states
  and evidence are read-only in the matriz; the only outbound action is
  navigation to the Centro de Control Legal / title panel.
- **FR-018**: System MUST version generated documents per case with status
  history, never overwriting previous generations.
- **FR-019**: System MUST stage operational case data as auditable variable
  proposals at escritura case creation: `comprador.*` and `transaccion.*`
  from the lot sale record (`lot_records`), `lote.numero/superficie_*/
deslindes/boundaries_official` from official lot geometry (`lots`), and
  `servidumbre.*` from the lot servidumbre analysis — with `source_type`
  `system`/`geometry` and `source_ref` to the operational row; proposals
  follow the SDD 007 state machine (never auto-approved).
- **FR-020**: System MUST derive words-rendered values deterministically
  reusing `services/legal_title_words.py`: `transaccion.precio_letras` from
  `transaccion.precio_numeros`, `lote.superficie_texto`/`lote.
superficie_ha_texto` from official areas, with `source_type="derived"`;
  hand-written numbers in custom clauses remain the redactor's
  responsibility.
- **FR-021**: System MUST re-propose (supersede + new proposal) operational
  variables when the underlying sale record or lot geometry changes after
  case creation; approved values are never silently mutated.
- **FR-022**: System MUST reconcile the clause library with the canonical
  catalog at template authoring time: template keys used by the lawyer's
  golden template that are missing from the catalog (`comprador.
nacionalidad`, `documento.notaria.jurisdiccion`, eviction-exception and
  occupants-exception clause fields, `evidencia.gravamenes_excepciones`)
  are added to the catalog in this feature, and derived presentation keys
  (`vendedor.representantes_texto` from `vendedor.representantes[]`) are
  rendered deterministically, never stored as independent truths.

### Key Entities _(include if feature involves data)_

- **Escritura Template**: versioned compraventa template: name, version,
  status (draft/published/retired), ordered clause list, tenant scope.
- **Template Clause**: one clause: key, title, ProseMirror JSON content,
  fixed-position flag, conditional rule (e.g. requires `servidumbre.aplica`),
  alert-tipo binding for required clauses, explicit order.
- **Matriz Document (case-bound)**: working matriz for an escritura case:
  template version ref, snapshot id, clause order overrides, local clause
  instances, status (draft / legal_review_pending / approved / superseded),
  version history.
- **Minuta Generation**: one DOCX generation: matriz version, snapshot id,
  template version, content hash, file ref, warning acknowledgement,
  generated_by/at.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: With the Teno corpus end-to-end (approved title case + complete
  snapshot), a redactor composes the matriz and generates a DOCX where the
  PRIMERO clause contains the approved block text verbatim and the SEXTO
  registral references match `titulo.inscripciones[]` (numbers in words,
  deterministic), with zero reads of live extraction data.
- **SC-002**: 100% of tokens in the generated DOCX trace to snapshot keys;
  a token without snapshot value can never silently render empty — it blocks
  generation or carries an explicit decision.
- **SC-003**: The alert-clause contract is enforced: with a `clause_added`
  alert and a template missing the clause, approval/generation is blocked in
  100% of cases with the missing clause named.
- **SC-004**: A lawyer reviews a composed matriz reaching any datum's
  evidence in at most 2 clicks, and completes review of a clean case in
  under 15 minutes.
- **SC-005**: Superseding the case snapshot reverts the matriz to draft and
  blocks stale generation in 100% of cases, preserving generation history.
- **SC-006**: DOCX output opens without repair warnings in Microsoft Word and
  LibreOffice for the golden case.
- **SC-007**: All new endpoints enforce tenant isolation (regression tests
  cross-org/cross-project como SDD 007/009).
- **SC-008**: The legal review warning acknowledgement is recorded for 100%
  of downloads; no download path bypasses it.
- **SC-009**: For a sold lot with complete sale record and official geometry,
  the `party_verified`, `price_verified` and `geometry_verified` gates reach
  reviewable state (proposals staged, zero manual typing) at case creation;
  `transaccion.precio_letras` matches the deterministic words rendering of
  the numeric price in 100% of cases.
- **SC-010**: The published compraventa template v1 reproduces the lawyer's
  golden template (labs/labs*escrituras/docs/template-draft.md) with the
  clause 2 dominio antecedents replaced by the approved
  `titulo.clausula_primero_texto` block and zero references to removed
  catalog keys (`matriz.inscripcion*\_`, `matriz.adquisicion\_\_`).

## Assumptions

- ProseMirror JSON as canonical clause format (handoff decision 1 adopted);
  export pipeline ProseMirror → DOCX implemented server-side with
  python-docx (already in requirements), receiving normalized JSON, not HTML.
- The clause library starts with the compraventa template derived from the
  lawyer's golden minuta (Teno) and the existing labs/escrituras material;
  herencia/otros casos enter as template versions later.
- `comprador.*` y `transaccion.*` se originan en datos operacionales de venta
  (`lot_records`) via el puente del US6; la nacionalidad del comprador no
  existe en el registro de venta y entra como variable manual/CCL (catalogo
  ampliado por FR-022). `transaccion.detalle_pago[]` puede complementarse con
  `organization_payment_info` (instruccion de pago) cuando aplique.
- The existing `generated_documents` MVP table is reference material; SDD 008
  defines its own generation registry (data-model decidira si extiende o
  reemplaza).
- Post-SDD 008 queda la consolidacion UX legal de proyectos (rediseño del
  Centro de Control Legal), fuera de alcance aqui.
- ProseKit (`@prosekit/*` ya instalado) provee la capa de edicion con nodos
  custom; dnd-kit el reordenamiento; ambos ya en package.json.
