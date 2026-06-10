# Feature Specification: Resolucion de Variables para Escrituras

**Feature Branch**: `[007-escrituras-variable-resolution]`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Investigar el codigo, Obsidian y el laboratorio de escrituras para preparar un plan SDD senior por fases que implemente la extraccion automatica de variables legales desde documentos fuente, revision en Centro de Control Legal, matching de roles por lote y readiness para generar minutas DOCX de compraventa."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Registrar documentos legales sin friccion (Priority: P1)

Como administrador de una inmobiliaria, quiero subir dominio vigente, certificado de roles, certificado SAG, plano y otros documentos legales durante el onboarding o desde el proyecto, para que Plotify inicie la extraccion automatica sin obligarme a revisar variables durante la creacion del proyecto.

**Why this priority**: Sin registro confiable de documentos fuente no existe evidencia ni extraccion. Esta historia conecta el flujo actual de uploads con el expediente legal productivo sin aumentar la carga del onboarding.

**Independent Test**: Crear un proyecto con documentos legales cargados y verificar que el proyecto queda creado, cada archivo queda registrado como documento legal del proyecto, y cada documento queda con una extraccion en cola o en proceso sin pedir intervencion manual en onboarding.

**Acceptance Scenarios**:

1. **Given** un usuario administrador creando un proyecto, **When** sube dominio vigente y certificado de roles y finaliza el onboarding, **Then** Plotify crea el proyecto, registra ambos documentos con su tipo legal y dispara extraccion automatica en segundo plano.
2. **Given** un proyecto existente, **When** el usuario reemplaza el certificado de roles desde la pestaña de documentos, **Then** Plotify actualiza el archivo del proyecto, registra una nueva version documental y deja una nueva extraccion en cola.
3. **Given** un archivo rechazado por tipo, tamano o firma, **When** el usuario intenta subirlo, **Then** Plotify rechaza la carga antes de registrar documento legal o job de extraccion.

---

### User Story 2 - Resolver variables con evidencia documental (Priority: P1)

Como operador legal, quiero que Plotify extraiga texto y proponga variables desde dominio vigente, certificado de roles, certificado SAG y plano, para saber que datos estan resueltos, cuales faltan y donde esta la evidencia de cada valor.

**Why this priority**: La matriz solo puede ser confiable si las variables tienen fuente, confianza y estado. El valor de Plotify no es solo completar texto, sino mostrar por que cada dato fue elegido.

**Independent Test**: Procesar documentos de prueba y verificar que el inventario de variables contiene valores, estado, fuente, evidencia por documento/pagina/chunk, y brechas para los valores no encontrados.

**Acceptance Scenarios**:

1. **Given** un dominio vigente procesado, **When** el extractor encuentra inscripcion CBR, rol matriz, predio matriz, ubicacion, superficie e historial de adquisicion, **Then** esas variables aparecen como propuestas con evidencia y fuente `dominio_vigente`.
2. **Given** un certificado de roles SII procesado, **When** el extractor encuentra filas o bloques con numero de lote, rol/pre-rol y comuna, **Then** Plotify propone variables `sii.*` y `lot_legal_data.*` por lote usando esa tupla documental como evidencia primaria, sin depender de inferencia LLM para asociar el rol.
3. **Given** dos documentos que proponen valores distintos para una misma variable critica, **When** se consolida el inventario, **Then** la variable queda en estado `conflict` y no puede aprobarse automaticamente.

---

### User Story 3 - Revisar y corregir variables en Centro de Control Legal (Priority: P2)

Como administrador u operador legal, quiero revisar en una pantalla central las variables extraidas, editar valores con auditoria y aprobarlas, para que la futura minuta use valores revisados en vez de texto bruto de OCR.

**Why this priority**: La extraccion automatica no puede ser la aprobacion juridica. La interfaz de revision es el punto donde el usuario corrige OCR, resuelve conflictos y deja trazabilidad.

**Independent Test**: Abrir el Centro de Control Legal de un proyecto, filtrar variables faltantes/conflictivas, editar una variable, aprobarla y verificar que queda historial de cambio, usuario, fecha, razon y evidencia.

**Acceptance Scenarios**:

1. **Given** un proyecto con variables propuestas, **When** el usuario abre el Centro de Control Legal, **Then** ve documentos fuente, estado de extraccion, variables por grupo, estado y evidencia.
2. **Given** una variable con OCR incorrecto, **When** el usuario edita el valor y guarda una razon, **Then** Plotify actualiza la variable, marca fuente manual/revisada y conserva el valor anterior en auditoria.
3. **Given** variables criticas pendientes, **When** el usuario intenta marcar el proyecto como listo para escritura, **Then** Plotify muestra las brechas que bloquean el readiness.

---

### User Story 4 - Asignar roles SII a lotes (Priority: P2)

Como administrador, quiero que Plotify asocie los roles o roles de avaluo en tramite del certificado SII con los lotes del proyecto, para que cada escritura use el rol correcto del lote vendido.

**Why this priority**: La escritura es por lote. Si el rol se queda como dato global, la minuta puede individualizar mal el bien. La variable de roles fue la brecha principal detectada.

**Independent Test**: Cargar un certificado SII con varias unidades y verificar que cada unidad queda asociada al lote correcto, con estado `matched`, `ambiguous` o `missing`.

**Acceptance Scenarios**:

1. **Given** un certificado SII que indica numero de lote, rol/pre-rol y comuna, **When** el extractor procesa el documento, **Then** Plotify extrae cada registro como una tupla normalizada `lote + rol/pre-rol + comuna` y propone el matching con los lotes existentes por numero de lote.
2. **Given** un lote nacido de subdivision con respaldo SII, **When** el certificado contiene rol/pre-rol asociado al lote y comuna, **Then** Plotify trata `Rol de avaluo en tramite numero [rol] de la comuna de [comuna]` como valor valido y no como dato faltante.
3. **Given** dos unidades SII que podrian coincidir con un mismo lote, **When** se consolida el matching, **Then** Plotify marca conflicto y exige revision humana.

---

### User Story 5 - Crear readiness de caso de escritura por lote vendido (Priority: P3)

Como operador legal, quiero que al preparar una escritura de un lote vendido Plotify consolide variables de proyecto, lote, comprador, precio, geometria, roles y revision legal, para saber si la minuta DOCX preliminar esta lista para generarse y enviarse a revision.

**Why this priority**: La generacion de minuta no debe depender de variables vivas dispersas. Antes de construir el documento se necesita un snapshot revisable del caso.

**Independent Test**: Marcar un lote como vendido con comprador/precio, revisar su readiness de escritura y verificar que Plotify muestra gates por dominio, SII, SAG/plano, geometria, comprador, precio y abogado redactor/revisor.

**Acceptance Scenarios**:

1. **Given** un lote vendido con geometria verificada, comprador, precio y variables legales aprobadas, **When** se consulta su readiness, **Then** Plotify retorna `ready_for_minuta` con snapshot de variables y evidencia.
2. **Given** un lote vendido sin abogado redactor/revisor asignado, **When** se intenta aprobar la minuta para uso externo, **Then** Plotify bloquea la aprobacion y muestra la variable faltante de workflow legal.
3. **Given** un lote con readiness incompleto, **When** el usuario abre el caso de escritura, **Then** Plotify muestra que la minuta automatica requiere revision y aprobacion de abogado antes de presentarse a notaria o usarse como instrumento final.

### Edge Cases

- El dominio vigente puede venir como PDF escaneado, imagen, DOCX, DOC o RTF; el sistema debe aceptar solo formatos soportados y marcar extraccion fallida si no se puede obtener texto suficiente.
- El usuario puede subir dos dominios vigentes con informacion distinta; los valores criticos deben quedar en conflicto hasta revision.
- El plano oficial puede no entregar texto confiable; numero de plano, archivo CBR o registro deben quedar como variables manuales cuando la confianza sea baja.
- Un certificado SII puede usar nombres de unidad que no calzan exactamente con los lotes de Plotify; primero debe intentarse el patron deterministico `numero de lote + rol/pre-rol + comuna`, y si ese patron esta incompleto la extraccion queda `manual_review` mientras el matching queda `ambiguous` o `missing`, no inventar una asociacion.
- Un certificado SII puede declarar la comuna y el rol matriz en el encabezado, mientras las filas solo muestran unidad y rol/pre-rol; el sistema debe asociar esos valores de encabezado a cada fila con evidencia de la misma pagina/certificado.
- Un certificado SII puede usar variantes reales como `LOTE N SECTOR... [rol]`, `PROY. PARC... LOTE N [rol]`, `PARCELA X LT N ... [rol]` o `SAN JOSE LOTE N ... [rol]`; el parser debe normalizar el numero de lote sin depender de que la fila empiece por `LOTE`.
- Una fila SII puede contener varios numeros visibles, por ejemplo `GAONA 7 PARCELA 8 LT 9 01234-00009`; el matching automatico debe usar solo el numero normalizado extraido como lote juridico de la fila, no cualquier numero presente en la etiqueta.
- Un certificado SII puede partir el encabezado y sus filas en paginas distintas; el parser debe propagar comuna, rol matriz, numero de solicitud y metadatos de certificado dentro del mismo documento/certificado con evidencia de encabezado, y exigir revision si el contexto es ambiguo.
- Un certificado SII puede venir como PDF escaneado sin texto extraible; el sistema debe intentar OCR configurado, marcar `ocr_required` si no puede ejecutarlo, y no crear datos SII sin evidencia textual u OCR.
- Un certificado SII puede contener mas de un rol matriz; el sistema debe conservar la lista de roles matriz y exigir revision humana si no puede determinar si todos aplican a todos los lotes.
- Un certificado SII reemplazado no debe participar en matching automatico ni readiness, aunque sus evidencias historicas sigan disponibles para snapshots antiguos.
- Una correccion manual de rol/pre-rol o comuna debe regenerar el texto `Rol de avaluo en tramite numero [rol] de la comuna de [comuna]` en backend; el cliente no puede ser la fuente de verdad de ese texto compuesto.
- El KMZ puede no coincidir con el plano oficial; la geometria solo pasa readiness cuando el usuario verifica o corrige deslindes oficiales.
- Una variable puede ser correcta pero no aplicable al caso, por ejemplo personeria en una compraventa entre personas naturales.
- Datos notariales finales como repertorio real, CVE, sellos, autorizacion final o certificaciones CBR/notaria no deben generarse como parte de la minuta preliminar.
- El LLM, si se usa, puede proponer valores, pero no puede aprobar juridicamente ni crear evidencia inexistente.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST register legal source documents uploaded during onboarding or project document management without adding a variable review step to onboarding.
- **FR-002**: System MUST create an extraction job for each registered legal source document and expose status values at least for `queued`, `processing`, `text_extracted`, `variables_proposed`, `failed` and `needs_review`.
- **FR-003**: System MUST validate file size, MIME type and file signature before persisting a legal document record.
- **FR-004**: System MUST retain extracted text at page or logical-page level and make it available as evidence for variables.
- **FR-005**: System MUST maintain a canonical variable inventory for escritura de compraventa grouped by `documento`, `revision_juridica`, `vendedor`, `comprador`, `personeria`, `matriz`, `sag`, `sii`, `lote`, `servidumbre`, `transaccion`, `clausulas`, `mandato` and `evidencia`.
- **FR-006**: System MUST resolve variables from existing operational data where available: `lots`, `lot_records`, `projects`, `organizations`, `project_legal_data`, geometry readiness and payment/commercial records.
- **FR-007**: System MUST resolve legal variables from source documents with evidence references: source document, page/logical page or chunk, extracted snippet or snippet hash, confidence, extractor name and timestamp.
- **FR-008**: System MUST support variable states `missing`, `proposed`, `resolved`, `approved`, `manual_review`, `conflict`, `derived`, `not_applicable` and `superseded`.
- **FR-009**: System MUST detect conflicts when multiple sources propose incompatible values for a critical variable.
- **FR-010**: System MUST allow authorized users to edit variables manually, require or store a correction reason, and preserve an audit trail with previous value, new value, user and timestamp.
- **FR-011**: System MUST match SII roles or roles of avaluo en tramite to project lots by unit/lote number and expose `matched`, `ambiguous`, `missing` and `manual_override` outcomes.
- **FR-012**: System MUST treat `Rol de avaluo en tramite` as a valid lot role state when supported by SII evidence or legal approval.
- **FR-013**: System MUST include lawyer/redactor workflow variables before a minuta can be marked legally approved for external use.
- **FR-014**: System MUST integrate legal variable readiness with the existing geometry/deslinde readiness before a sold lot can be considered ready for minuta.
- **FR-015**: System MUST create an escritura case snapshot for a sold lot before document generation uses approved variables.
- **FR-016**: System MUST show a clear warning that automatically generated minuta content requires lawyer review and approval before being used at notary or as a final legal instrument.
- **FR-017**: System MUST enforce tenant isolation for all document, extraction, variable, evidence and escritura case records.
- **FR-018**: System MUST not generate notary/CBR final artifacts such as CVE, final repertoire numbers, certifications, seals or final authorization text unless those values are explicitly entered as post-minuta context.
- **FR-019**: System MUST persist escritura case variable and evidence snapshots in a stable format consumable by the future matriz builder without querying raw OCR or live extraction proposals.
- **FR-020**: System MUST extract SII certificate role records with deterministic rules before any LLM-assisted fallback: each record MUST preserve normalized lot number, role/pre-role value, comuna, source page/snippet and row/block position when available.
- **FR-021**: System MUST render `sii.rol_avaluo_en_tramite_texto` from the extracted certificate tuple as `Rol de avaluo en tramite numero [rol] de la comuna de [comuna]`; the role matrix and all lot roles remain in `rol_en_tramite` until a definitive SII role certificate or approved post-inscription value exists.
- **FR-022**: System MUST classify a certificado de roles extraction as `manual_review` when the lot number, role/pre-role or comuna is missing from the same documental row/block, instead of silently joining values from unrelated snippets.
- **FR-023**: System MUST extract the common SII matrix role from phrases such as `Numero(s) de Rol(es) Matriz(ces):` even when the role value appears on a following line, and preserve multiple matrix roles when present.
- **FR-024**: System MUST extract SII certificate comuna from certificate header/context when rows omit comuna, and attach that comuna to each role row only when the header evidence belongs to the same certificate/page context.
- **FR-025**: System MUST support real SII row shapes observed in pilot certificates, including `LOTE N ... [rol]`, prefixed `... LOTE N [rol]`, `PARCELA X LT N ... [rol]` and `... UNIDAD N [rol]`, while preserving the original unit label.
- **FR-026**: System MUST attempt OCR for image-only SII certificate PDFs when OCR is configured, store OCR-derived text as document pages with converter/stats metadata, and mark documents as requiring OCR review when OCR is unavailable or fails.
- **FR-027**: System MUST expose SII role extraction quality in the Centro de Control Legal, including certificate metadata, matrix role, comuna, OCR/text source, extracted unit count, matched count and rows needing review.
- **FR-028**: System MUST perform automatic SII lot matching against the extracted `sii_lot_number_normalized` from the role row, not fuzzy matches against every number in `sii_unit_name`; a single SII row MUST NOT automatically match more than one lot.
- **FR-029**: System MUST exclude superseded or inactive SII certificate versions from current role matching and readiness while preserving their evidence for historical escritura case snapshots.
- **FR-030**: System MUST propagate SII certificate header context across pages of the same certificate only when certificate identity/page evidence supports that relationship; ambiguous header context MUST force `manual_review`.
- **FR-031**: System MUST preserve multiple SII matrix roles as a list and block automatic propagation unless the parser can prove the roles are globally applicable to all extracted rows.
- **FR-032**: System MUST derive manual override `sii_role_in_process_text` server-side from the approved pre-role/role and comuna, and audit the legal reason instead of trusting client-composed text.
- **FR-033**: System MUST treat OCR runtime dependency, timeout and converter failures as explicit OCR review states with stats, not as generic empty extraction failures.

### Key Entities _(include if feature involves data)_

- **Legal Document**: Source file attached to a project or lot, with legal document type, version, hash, storage path, upload source and extraction status.
- **Document Ingestion Job**: Background processing attempt for a legal document, including conversion/OCR status, extractor version, errors, attempts and completion timestamps.
- **Document Text Page**: Extracted text or Markdown for a physical page or logical page, used as the source for evidence.
- **Variable Resolution**: Canonical variable key, value, state, source type, confidence, scope and review metadata.
- **Document Evidence**: Link between a variable and a source document/page/chunk/snippet that supports the proposed or approved value.
- **Lot Legal Data**: Lot-level legal values such as SII unit, normalized lot number, comuna, matrix role, pre-rol, rol de avaluo en tramite, definitive role and matching status.
- **Escritura Case**: Per-lot case created when a sold lot is prepared for minuta, including readiness gates, variable snapshot and legal workflow status.
- **Legal Review Decision**: Human approval, rejection, correction or legal gate decision with reviewer identity and reason.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A project can be created with legal documents uploaded during onboarding without adding more than one additional confirmation step after file upload.
- **SC-002**: For a test project with one domain document and one SII roles certificate, at least 80% of the variables listed as primary for those documents are either proposed with evidence or explicitly marked `missing`/`manual_review`.
- **SC-003**: Every proposed or approved variable produced from a document includes an evidence reference to a legal document and page/logical page.
- **SC-004**: A legal operator can identify all missing/conflicting variables for a project in under 2 minutes from the Centro de Control Legal.
- **SC-005**: Role matching for SII certificates produces no silent assignments: every lot is classified as `matched`, `ambiguous`, `missing` or `manual_override`.
- **SC-006**: A sold lot readiness response explains all blocking gates before minuta generation, including geometry, SII role, domain/title data, buyer/commercial data and lawyer review workflow.
- **SC-007**: Manual corrections preserve audit history and can be traced back to the user and timestamp in 100% of correction cases.
- **SC-008**: A future matriz builder can retrieve an approved escritura case snapshot containing canonical variable values, evidence references and readiness gates without depending on raw document extraction tables.
- **SC-009**: For SII role certificate fixtures that contain tabular or repeated `lote + rol/pre-rol + comuna` records, 100% of complete records are extracted into lot-level role candidates with evidence before any LLM-assisted fallback is considered.
- **SC-010**: For the pilot SII certificate fixture family covering Teno, Gaona 3, Gaona 7 and Pemuco textual PDFs, the extractor recovers certificate number, emission date, request number, matrix role, comuna and every visible lot role row with page evidence; scanned SII fixtures are classified as OCR-backed or OCR-required, not silently empty.
- **SC-011**: For multi-number SII unit labels, automatic matching assigns a row only to the lot whose normalized number equals `sii_lot_number_normalized`, and all other visible numbers remain unmatched or manual-review candidates.
- **SC-012**: Replacing a certificado de roles SII removes superseded certificate variables from current matching/readiness without deleting historical evidence or escritura case snapshots.
- **SC-013**: OCR-enabled and OCR-unavailable environments produce deterministic statuses: successful OCR stores `ocr_image` pages with converter stats, while dependency, timeout or converter failures surface `ocr_required`/`needs_review` with no invented role rows.

## Assumptions

- The deliverable for Plotify is a DOCX minuta preliminar, not the final notarized or CBR-certified PDF.
- The table in `plotify_memori/60 - Referencias & Soporte/Variables Escritura Compraventa - Fuentes de Obtencion.md` is the canonical planning source for variables and source ownership.
- `COMPRAVENTA LOTE 29.docx` is the structural reference for the future minuta template, while `escritura.pdf` represents a final or certified layer that Plotify should not reproduce automatically.
- Existing geometry verification and deslinde generators remain the authority for operational lot boundaries, but the user must verify them against the official plan.
- Existing document generation endpoints and template systems remain in place while this feature creates the variable/evidence/readiness foundation.
- The SII certificate shapes for this feature include both simple row tuples and real pilot layouts where comuna and rol matriz are declared in the header while rows contain unit labels plus role/pre-role. Deterministic parsing remains the extraction authority; OCR/LLM usage is only a controlled fallback for image-only or unusual layouts and cannot approve legal values.
- Production implementation will reuse patterns from the lab, but the lab schema and MCP server are not production runtime dependencies.
- The next SDD after this feature should build the matriz builder UI on top of approved escritura case snapshots, canonical variable tokens and versioned clause blocks.
