# Feature Specification: Resolucion de Titulo de Dominio Vigente con Agente

**Feature Branch**: `[009-titulo-dominio-vigente]`

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "Los dominios vigentes cuentan la historia completa de una propiedad y pueden venir como dominio unico, varios dominios que componen la propiedad, compra de derechos, herencia o personeria con un tercero firmando en representacion del dueno. Un extractor por reglas no puede reconstruir esa historia. Se requiere un agente LLM que lea toda la documentacion de titulo del proyecto, reconstruya la cadena de adquisicion con evidencia literal y genere los bloques trascendentales de la escritura (comparecencia del vendedor y clausula PRIMERO), con verificacion deterministica de evidencia y aprobacion de abogado antes de usarse."

## Context

SDD 007 dejo resuelta la extraccion deterministica de certificado de roles SII,
certificado SAG y plano. La pieza faltante es el titulo de dominio. El ejercicio
piloto (dos dominios vigentes CBR Curico, fojas 1.338 N°1.322/1996 y fojas 4.699
N°2.781/2023, predio Teno rol 67-23) demostro tres hechos de diseno:

1. Un LLM moderno reconstruye correctamente la estructura del titulo (compra
   conjunta + compra posterior de acciones y derechos) sin instrucciones
   especificas.
2. El mismo LLM altero fechas de escrituras (2022 -> 2023) y un apellido
   (Minghel -> Minchelli) produciendo texto fluido y verosimil. Sin anclaje de
   evidencia, el error es indetectable para el revisor.
3. La cadena de inscripciones alimenta mas de una clausula: PRIMERO (historia de
   adquisicion) y SEXTO (referencias registrales de la servidumbre). El output
   del agente debe ser estructurado, no solo narrativo.

Por eso la regla central de esta feature: **el agente extrae JSON estructurado
con cita literal por dato; un verificador deterministico (sin LLM) valida cada
cita contra el texto extraido del documento; solo despues se renderizan los
bloques narrativos; el abogado aprueba en el Centro de Control Legal.**

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Analisis de titulo a nivel proyecto (Priority: P1)

Como operador legal, quiero que Plotify analice todos los documentos de titulo
activos del proyecto (dominios vigentes, personerias, hipotecas/gravamenes) como
un solo caso de titulo, para obtener la estructura de propiedad (dominio unico,
multiples dominios, derechos, herencia, mixto), la cadena de inscripciones y los
propietarios actuales con evidencia por dato.

**Why this priority**: Sin la cadena de titulo no existe escritura. Es la unica
fuente de datos del expediente que hoy no se resuelve y bloquea la generacion de
minutas reales.

**Independent Test**: Cargar los dos dominios vigentes del corpus Teno y
verificar que el analisis retorna estructura `derechos`, dos inscripciones con
fojas/numero/anio/CBR correctos, el propietario actual consolidado y evidencia
pagina+snippet por cada dato.

**Acceptance Scenarios**:

1. **Given** un proyecto con dos dominios vigentes activos que componen la misma
   propiedad, **When** corre el analisis de titulo, **Then** Plotify produce un
   analisis con la lista completa de inscripciones (cada una con fojas, numero,
   anio, CBR, tipo de adquisicion, escritura, notario y repertorio cuando
   consten), el propietario actual y la clasificacion de estructura.
2. **Given** un dominio vigente que registra compra de acciones y derechos,
   **When** corre el analisis, **Then** el tramo correspondiente queda tipado
   como `compra_derechos` y la narrativa lo expresa como compra de acciones y
   derechos, no como compra simple.
3. **Given** un documento de titulo escaneado sin texto u OCR fallido, **When**
   corre el analisis, **Then** el analisis queda `needs_review` con causa
   `ocr_required` y no se inventa ningun dato de cadena.
4. **Given** que el agente LLM esta deshabilitado o sin API key, **When** se
   ingesta un dominio vigente, **Then** el caso de titulo queda en estado
   `llm_disabled` y todas las variables de titulo quedan disponibles para
   ingreso manual con auditoria.

---

### User Story 2 - Bloques narrativos verificados (Priority: P1)

Como abogado redactor, quiero que Plotify genere la comparecencia del vendedor y
la clausula PRIMERO (individualizacion + historia de adquisicion) desde la
cadena verificada, para revisar un borrador correcto en lugar de redactar desde
cero.

**Why this priority**: Es el entregable visible de la feature y el insumo
directo de la matriz (SDD 008). El valor diferencial es que cada hecho del
parrafo tiene respaldo literal.

**Independent Test**: Con el corpus Teno, verificar que la clausula PRIMERO
generada contiene las dos compras con fechas de escritura 2022 (no 2023), el
apellido tal como consta en el documento, la mencion de acciones y derechos y la
inscripcion 4.699/2.781/2023; y que los numeros aparecen tambien en palabras.

**Acceptance Scenarios**:

1. **Given** un analisis de titulo verificado, **When** se generan los bloques,
   **Then** la comparecencia y la clausula PRIMERO solo contienen hechos
   presentes en el JSON verificado, con numeros renderizados a palabras de forma
   deterministica.
2. **Given** un dato del analisis cuya cita no calza literalmente con el texto
   extraido del documento, **When** el verificador corre, **Then** ese dato y
   los bloques que lo usan quedan `manual_review` con el detalle del calce
   fallido visible.
3. **Given** que el documento dice un valor distinto al propuesto por el agente
   (por ejemplo fecha 2022 en el documento, 2023 propuesto), **When** corre la
   verificacion, **Then** el valor propuesto no puede quedar `proposed` con la
   cita invalida: queda `manual_review` o se corrige al valor con evidencia.

---

### User Story 3 - Revision y aprobacion en Centro de Control Legal (Priority: P2)

Como abogado u operador legal, quiero revisar el caso de titulo en el Centro de
Control Legal — estructura, linea de tiempo de inscripciones, propietarios,
bloques narrativos editables, alertas y evidencia por dato — y aprobarlo con
auditoria, para que la minuta use solo titulo aprobado por humano.

**Why this priority**: El agente nunca aprueba. La revision humana es el gate
juridico y mantiene la frontera de correccion definida en SDD 007.

**Independent Test**: Abrir el panel de titulo de un proyecto analizado, editar
la clausula PRIMERO con razon, aprobar el caso y verificar historial de cambio,
usuario, fecha y que el gate `title_verified` queda satisfecho.

**Acceptance Scenarios**:

1. **Given** un analisis propuesto, **When** el usuario abre el panel de titulo,
   **Then** ve estructura, cadena con evidencia por inscripcion, propietarios,
   bloques narrativos, alertas y los datos en `manual_review` destacados.
2. **Given** un bloque narrativo editado por el abogado, **When** guarda con
   razon, **Then** Plotify conserva el texto generado original, el texto
   editado, usuario, fecha y razon.
3. **Given** datos de titulo en `manual_review` o `conflict`, **When** se
   intenta aprobar el caso de titulo, **Then** Plotify bloquea la aprobacion y
   lista los datos pendientes.
4. **Given** un caso de titulo aprobado, **When** se reemplaza un dominio
   vigente del proyecto, **Then** el analisis queda `superseded`, se encola un
   reanalisis y el gate `title_verified` vuelve a bloquearse hasta nueva
   aprobacion.

---

### User Story 4 - Alertas legales y cruces automaticos (Priority: P2)

Como abogado redactor, quiero que el analisis levante alertas accionables
detectadas en los titulos — prohibicion DL 3.516/LGUC 55-56, derechos de aguas
incluidos en compras anteriores, certificacion "vigente en el resto",
inscripciones que cubren mas de un inmueble, gravamenes, representacion por
personeria — y cruce valores contra las otras fuentes del expediente, para no
depender de la memoria del revisor.

**Why this priority**: En el corpus piloto, el borrador humano omitio la
referencia a acciones y derechos y dejo sin tratar los derechos de aguas de la
compra de 1996. Las alertas convierten conocimiento implicito del abogado en
checklist explicito.

**Independent Test**: Con el corpus Teno, verificar alertas por DL 3.516,
derechos de aguas de la compra 1996, titulo 1996 "vigente en el resto" y doble
inmueble en la inscripcion 1996; y que `matriz.rol_avaluo` (67-23) cruza limpio
contra el certificado SII del proyecto.

**Acceptance Scenarios**:

1. **Given** un titulo que declara la restriccion DL 3.516/LGUC, **When** corre
   el analisis, **Then** existe una alerta `dl_3516` con evidencia, y el caso de
   escritura exige la clausula correspondiente o una decision explicita.
2. **Given** un rol de avaluo presente en el titulo y un certificado SII activo,
   **When** se consolidan variables, **Then** la coincidencia marca el cruce
   `ok` y la discrepancia marca `conflict` con ambas evidencias.
3. **Given** una inscripcion que cubre mas de un inmueble, **When** corre el
   analisis, **Then** el analisis identifica cual inmueble corresponde al
   proyecto y deja alerta del inmueble excluido para confirmacion humana.

---

### User Story 5 - Integracion con readiness y snapshot (Priority: P3)

Como operador legal, quiero que el caso de titulo aprobado alimente el gate
`title_verified`, las variables del vendedor y el snapshot del caso de
escritura, para que SDD 008 consuma titulo estructurado y bloques aprobados sin
tocar extraccion viva.

**Why this priority**: Cierra el contrato con SDD 008: sin esto el snapshot
sigue incompleto y la matriz no puede renderizar PRIMERO ni las referencias
registrales de la servidumbre.

**Independent Test**: Aprobar el caso de titulo, crear el caso de escritura de
un lote vendido y verificar que `variable_snapshot` contiene la cadena
estructurada, los bloques narrativos aprobados y los datos del vendedor, y que
`title_verified` esta en verde.

**Acceptance Scenarios**:

1. **Given** un caso de titulo aprobado, **When** se crea el snapshot del caso
   de escritura, **Then** el snapshot incluye `titulo.estructura`,
   `titulo.inscripciones[]`, `titulo.propietarios[]`, bloques narrativos
   aprobados y alertas resueltas, sin metadatos de parser ni propuestas vivas.
2. **Given** un proyecto sin caso de titulo aprobado, **When** se consulta el
   readiness de un lote vendido, **Then** `title_verified` aparece bloqueado con
   la causa especifica (sin analisis, en revision, supersedido o datos
   pendientes).

### Edge Cases

- Dos dominios vigentes pueden describir el mismo inmueble con valores
  distintos (superficie, deslindes, nombre); los valores de identidad quedan en
  `conflict` hasta revision.
- Un dominio puede venir certificado "vigente en el resto": el analisis debe
  reflejar que parte del titulo fue transferida y no tratar el documento como
  dominio pleno.
- La cadena puede incluir herencia (posesion efectiva, inscripcion especial de
  herencia, cesion de derechos hereditarios); cada tramo se tipa y si el agente
  no puede reconstruir la secuencia con evidencia, el caso queda
  `manual_review`, nunca con tramos inventados.
- La personeria puede acreditar que firma un representante: la comparecencia
  debe integrarse con `personeria.*` y quedar en revision si las facultades no
  constan.
- Nombres y apellidos en titulos antiguos (maquina de escribir + OCR) pueden
  diferir por un caracter de lo esperado (Minghel/Minchel); el sistema usa el
  valor con evidencia y marca verificacion visual si la confianza OCR del
  snippet es baja.
- El estado civil/profesion del vendedor puede diferir entre titulos de
  distintas epocas (casado 1996, divorciado 2023; agricultor vs rentista); la
  comparecencia usa el dato mas reciente con evidencia y deja alerta de
  declaracion.
- Los textos de titulo pueden exceder la ventana de entrada configurada; el
  analisis debe segmentar por documento y consolidar, o quedar `needs_review`
  explicito, nunca truncar silenciosamente.
- La respuesta del LLM puede no cumplir el schema o agotar timeout; el job
  reintenta con limites y termina en `failed` visible y reanalizable.
- Un reanalisis sobre los mismos documentos (mismo hash de fuentes) debe ser
  idempotente y no duplicar propuestas ni evidencia.
- El LLM puede proponer datos sin cita o con cita de otra pagina; el verificador
  los degrada a `manual_review`; bajo ninguna circunstancia un dato sin
  evidencia literal queda `proposed`/`resolved`.
- El costo por analisis debe estar acotado: paginas/caracteres maximos por run y
  registro de tokens consumidos por analisis.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST analyze title at project scope, consuming all active
  `dominio_vigente`, `personeria` and `hipoteca_gravamen` documents and their
  extracted pages as a single title case.
- **FR-002**: System MUST classify title structure as `dominio_unico`,
  `multiples_dominios`, `compra_derechos`, `herencia` or `mixto`, with evidence.
- **FR-003**: System MUST produce a structured acquisition chain: ordered
  inscriptions, each with fojas, numero, anio, CBR, acquisition type, deed date,
  notary, repertorio and rectificatorias when stated, plus per-field evidence
  (legal_document_id, page, literal snippet).
- **FR-004**: System MUST produce current owners with quota/derechos detail and
  the seller comparecencia data (nombre, RUT, estado civil, profesion,
  domicilio) sourced from the most recent evidence.
- **FR-005**: System MUST run a deterministic evidence verifier (no LLM) that
  matches every proposed snippet against stored `legal_document_pages` text
  using whitespace/accent-normalized comparison; any failed match degrades the
  value and dependent narrative blocks to `manual_review`.
- **FR-006**: System MUST render narrative blocks
  (`titulo.comparecencia_vendedor_texto`, `titulo.clausula_primero_texto`) only
  from verified chain data, with deterministic number-to-words rendering for
  legal text.
- **FR-007**: System MUST persist the analysis as a versioned, tenant-scoped
  `title_analyses` record with model name, prompt/extractor version, source
  document ids, source content hash, token usage, duration and verification
  stats.
- **FR-008**: System MUST stage all title values through `variable_resolutions`
  with states from SDD 007 (`proposed`, `manual_review`, `conflict`, `approved`,
  `superseded`, `missing`, `not_applicable`) and evidence in
  `document_evidence`.
- **FR-009**: System MUST replace the regex dominio extractor
  (`dominio_vigente_rules_v1`) as the production path for title data; matriz
  identity keys (`matriz.nombre_predio`, `matriz.ubicacion`, `matriz.comuna`,
  `matriz.provincia`, `matriz.region`, `matriz.superficie_total`,
  `matriz.deslindes.*`, `matriz.rol_avaluo`) are proposed by the title agent
  with evidence; granular keys `matriz.inscripcion_*` and `matriz.adquisicion_*`
  are removed from the catalog and superseded by `titulo.inscripciones[]`.
- **FR-010**: System MUST keep `matriz.rol_avaluo` and cross-check it against
  the active certificado de roles SII (`sii.rol_matriz`/project SII data);
  mismatch produces `conflict` with both evidences.
- **FR-011**: System MUST emit structured alerts with evidence at least for:
  DL 3.516/LGUC 55-56 restriction, water rights included in prior purchases,
  partial-validity certification ("vigente en el resto"), inscriptions covering
  multiple properties, mortgages/prohibitions found in title text, and
  representation requiring personeria.
- **FR-012**: System MUST expose a title review panel in Centro de Control
  Legal: structure summary, inscription timeline with evidence, owners,
  editable narrative blocks (original generated text preserved), alerts and
  pending `manual_review` items; editing requires a reason and is audited via
  `legal_review_decisions`.
- **FR-013**: System MUST block title-case approval while any chain/identity
  value is `manual_review` or `conflict`, and require an authorized reviewer;
  approval writes approved variable resolutions and satisfies `title_verified`.
- **FR-014**: System MUST supersede the title analysis and re-queue analysis
  when an active source document is replaced or a new title document is
  registered; `title_verified` re-blocks until re-approval.
- **FR-015**: System MUST integrate approved title data into
  `escritura_cases.variable_snapshot` as domain values (structured chain,
  narrative blocks, owners, alerts with resolution) consumable by SDD 008
  without parser metadata.
- **FR-016**: System MUST degrade safely without the LLM: feature flag and
  missing API key produce `llm_disabled` state with full manual entry of title
  variables via the existing audited correction flow.
- **FR-017**: System MUST bound each analysis run: configurable model, max
  input characters, timeout and retry policy; runs are idempotent per source
  content hash and record token usage for cost observability.
- **FR-018**: System MUST enforce tenant isolation (organization/project) on
  all new records and endpoints, following SDD 007 RLS patterns.
- **FR-019**: System MUST treat LLM output strictly as proposals: no
  auto-approval, no evidence creation, no readiness mutation without human
  approval.
- **FR-020**: System MUST keep narrative blocks re-renderable: when a chain
  value is corrected and re-approved, blocks regenerate and prior approved text
  is preserved as history.

### Key Entities _(include if feature involves data)_

- **Title Analysis**: Project-scoped analysis run: structure type, analysis
  JSON (chain, owners, identity, blocks, alerts), status (`processing`,
  `proposed`, `needs_review`, `failed`, `llm_disabled`, `approved`,
  `superseded`), model/prompt version, source document ids and content hash,
  verification stats, token usage, reviewer identity.
- **Title Inscription (embedded)**: One chain link: fojas, numero, anio, CBR,
  acquisition type (`compra`, `compra_derechos`, `herencia_posesion_efectiva`,
  `herencia_inscripcion_especial`, `cesion_derechos`, `otro`), deed
  date/notary/repertorio, rectificatorias, parties, per-field evidence refs.
- **Title Alert (embedded)**: Typed alert (`dl_3516`, `derechos_aguas`,
  `vigente_en_el_resto`, `multi_inmueble`, `gravamen`, `personeria_requerida`,
  `discrepancia_declaracion`, `otro`) with evidence and resolution state.
- **Narrative Block**: Generated + edited text pair for comparecencia and
  clausula PRIMERO with audit trail.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On the Teno corpus (two CBR Curico dominios), the analysis
  extracts 100% of the inscriptions (1.338/1.322/1996 and 4.699/2.781/2023)
  with correct fojas, numero, anio, CBR, deed dates (2022, not 2023) and
  acquisition types (`compra` joint, `compra_derechos`), each with page-level
  evidence.
- **SC-002**: Zero unverified facts reach narrative blocks: every fact in
  generated comparecencia/PRIMERO maps to a verified chain field; the
  hallucination regression fixture (LLM response proposing 2023 dates and
  altered surname) ends in `manual_review`, never `proposed`.
- **SC-003**: On the Teno corpus the alerts include at least `dl_3516`,
  `derechos_aguas`, `vigente_en_el_resto` and `multi_inmueble`, each with
  evidence.
- **SC-004**: `matriz.rol_avaluo` cross-check against the active SII
  certificate yields `ok` on matching fixtures and `conflict` on mismatched
  fixtures, 100% deterministic.
- **SC-005**: A lawyer can review and approve a clean title case in under 10
  minutes from the Centro de Control Legal panel, with all evidence reachable
  in at most 2 clicks per datum.
- **SC-006**: Replacing a source dominio supersedes the analysis and re-blocks
  `title_verified` in 100% of cases, without deleting historical snapshots.
- **SC-007**: With the agent disabled, all title variables remain enterable
  manually with audit, and readiness reflects `llm_disabled` rather than a
  silent gap.
- **SC-008**: An approved title case produces an escritura case snapshot that
  SDD 008 can render PRIMERO and servidumbre registral references from, without
  reading `title_analyses` internals or live proposals.
- **SC-009**: Analysis runs are idempotent per source hash: re-running without
  document changes creates no duplicate proposals/evidence.
- **SC-010**: Every analysis logs model, prompt version, duration and token
  usage; failed/timeout runs end in visible `failed` state with retry action.

## Assumptions

- The evaluation corpus starts with the two Teno dominios and the lawyer's
  final draft (golden output for blocks); cases for herencia and dominio unico
  will be added as fixtures when documents are available. Tests run against
  recorded LLM fixtures; live-model evaluation is a manual, env-gated script.
- The agent runs through the existing LangChain integration in `apps/api`
  with a configurable provider/model (initial default OpenAI `gpt-4o`, since
  the pilot already holds an OpenAI API key in `apps/api/.env`; Anthropic
  `claude-sonnet-4-6` as alternative provider), independent from the sales
  chat agent model.
- Text/OCR extraction from SDD 007 (`legal_text_extraction.py`) remains the
  input authority; this feature does not re-open OCR ownership.
- SII/SAG/plano deterministic extraction from SDD 007 stays untouched.
- The Centro de Control Legal remains the only correction surface; SDD 008
  consumes snapshots only.
- DOCX rendering of the full escritura stays in SDD 008; this feature delivers
  approved data and narrative blocks, not documents.
- Buyer-side comparecencia (`comprador.*`) remains sourced from operational
  sales data, out of scope here.

## Correccion producto 2026-06-10: cardinalidad multi-documento

La prueba manual del flujo detecto que la capa de ingesta heredada de SDD 007
impide cumplir FR-001: `register_legal_document` supersede todos los documentos
activos del mismo `document_type`, y la pestania de documentos del proyecto
modela cada tipo como slot unico. Un proyecto real puede requerir:

- **1..N dominios vigentes** activos a la vez (multiples dominios, compra de
  derechos, herencias cuya cadena se acredita con varias inscripciones CBR).
- **0..N personerias** y documentos complementarios (posesiones efectivas,
  representaciones) activos a la vez.
- **1..N planos** (varias laminas PDF cuando el proyecto abarca varios
  terrenos).

Requisitos incorporados:

- **FR-031**: Legal document types MUST declare cardinality. Multi-active
  types (`dominio_vigente`, `personeria`, `hipoteca_gravamen`, `plano_oficial`,
  `otro`) allow several active documents to coexist per project. Single-active
  types (`certificado_roles_sii`, `certificado_sag`, `rnda`,
  `instruccion_pago`) keep replace-by-type semantics.
- **FR-032**: Registration MUST distinguish **add** (new coexisting document)
  from **replace** (`replaces_legal_document_id` supersedes only the referenced
  document, validated against org/project/type scope). Single-active types keep
  supersede-all on every upload.
- **FR-033**: Project documents UI MUST list every active document for
  multi-active types with per-document actions (view/download/replace) and an
  always-available add action, including a `personeria` row even though the
  legacy `projects` table has no column for it.
- **FR-034**: Adding or replacing any title-type document keeps the SDD 009
  behavior: the current title analysis is superseded and re-queued after
  ingestion (source content hash covers all active documents).

Out of scope of this correction: merging multiple planos in the SDD 007
plano/SAG deterministic extractors (they keep reading the latest active
plano), and onboarding multi-upload UX.

## Correccion producto 2026-06-10 (2): migracion pipeline -> agente

La revision del resultado real detecto que la implementacion del nucleo de
extraccion (pipeline de 4 pasos por segmento + merge mecanico) no reconstruye
la historia juridica de la propiedad: cada documento se analizaba aislado, la
clasificacion de estructura quedaba last-wins, los propietarios historicos se
mezclaban con los actuales y las inscripciones citadas en mas de un titulo se
duplicaban con `orden` colisionado. Ademas, las plantillas Python de bloques
narrativos estaban sobreajustadas al golden Teno e inventaban hechos
(nacionalidad/genero por nombre de pila, notarios hardcodeados).

Decision de producto: el nucleo de extraccion se reemplaza por **un agente
LangGraph con herramientas** que lee todo el corpus de titulo como un solo
caso, reconstruye la cadena consolidada y **redacta** los bloques narrativos.
Plan detallado en `plan-migracion-agente.md`.

Requisitos corregidos:

- **FR-006 (corregido)**: System MUST produce narrative blocks
  (`titulo.comparecencia_vendedor_texto`, `titulo.clausula_primero_texto`)
  drafted by the title agent, and validate them with a deterministic block
  fact-checker: every number-in-words, date-in-words, name, notary and
  registral reference in the drafted text MUST match a verified chain field
  (using deterministic number-to-words rendering). Any failed match degrades
  the block to `manual_review` with the failed matches visible to the
  reviewer; blocks are never silently absent. SC-002 (zero unverified facts
  in blocks) keeps applying unchanged.
- **FR-035**: The title agent MUST analyze all active title documents as a
  single case within one reasoning loop (cross-document consolidation):
  deduplicate inscriptions cited by more than one title, order the chain
  chronologically with a global `orden`, and consolidate current owners using
  the most recent evidenced data. Per-document isolated extraction is not a
  valid production path.
- **FR-036**: Seller comparecencia data (`PropietarioActual`) MUST include
  `nacionalidad` and `tratamiento` (don/dona) as evidenced values extracted
  from the documents; they are never inferred from first-name heuristics.
  When absent, they stay `manual_review` for the lawyer.
- **FR-017 (alcance ampliado)**: run bounding now also covers agent loop
  iterations (`LEGAL_TITLE_AGENT_MAX_ITERATIONS`) and per-tool-read character
  budgets; token usage MUST be recorded per run (this was specified and not
  implemented).

Sin cambios: verificador deterministico como gate final obligatorio (fuera
del agente), aprobacion humana, staging en `variable_resolutions`, contrato
SDD 008, extractores deterministicos SII/SAG/plano intocables.
