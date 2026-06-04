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
2. **Given** un certificado de roles SII procesado, **When** el extractor encuentra unidad/lote y rol o pre-rol, **Then** Plotify propone variables `sii.*` y `lot_legal_data.*` con estado inicial segun confianza y evidencia.
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

1. **Given** un certificado SII que indica unidad/lote y pre-rol, **When** el extractor procesa el documento, **Then** Plotify propone el matching con los lotes existentes por numero/unidad.
2. **Given** un lote nacido de subdivision con respaldo SII, **When** su rol definitivo aun no existe, **Then** Plotify trata `Rol de avaluo en tramite` como estado valido y no como dato faltante.
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
- Un certificado SII puede usar nombres de unidad que no calzan exactamente con los lotes de Plotify; el matching debe quedar `ambiguous` o `missing`, no inventar una asociacion.
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

### Key Entities _(include if feature involves data)_

- **Legal Document**: Source file attached to a project or lot, with legal document type, version, hash, storage path, upload source and extraction status.
- **Document Ingestion Job**: Background processing attempt for a legal document, including conversion/OCR status, extractor version, errors, attempts and completion timestamps.
- **Document Text Page**: Extracted text or Markdown for a physical page or logical page, used as the source for evidence.
- **Variable Resolution**: Canonical variable key, value, state, source type, confidence, scope and review metadata.
- **Document Evidence**: Link between a variable and a source document/page/chunk/snippet that supports the proposed or approved value.
- **Lot Legal Data**: Lot-level legal values such as SII unit, pre-rol, rol de avaluo en tramite, definitive role and matching status.
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

## Assumptions

- The deliverable for Plotify is a DOCX minuta preliminar, not the final notarized or CBR-certified PDF.
- The table in `plotify_memori/60 - Referencias & Soporte/Variables Escritura Compraventa - Fuentes de Obtencion.md` is the canonical planning source for variables and source ownership.
- `COMPRAVENTA LOTE 29.docx` is the structural reference for the future minuta template, while `escritura.pdf` represents a final or certified layer that Plotify should not reproduce automatically.
- Existing geometry verification and deslinde generators remain the authority for operational lot boundaries, but the user must verify them against the official plan.
- Existing document generation endpoints and template systems remain in place while this feature creates the variable/evidence/readiness foundation.
- Production implementation will reuse patterns from the lab, but the lab schema and MCP server are not production runtime dependencies.
- The next SDD after this feature should build the matriz builder UI on top of approved escritura case snapshots, canonical variable tokens and versioned clause blocks.
