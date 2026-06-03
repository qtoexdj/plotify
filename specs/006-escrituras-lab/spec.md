# Feature Specification: Laboratorio de Escrituras

**Feature Branch**: `006-escrituras-lab`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "Crear un laboratorio paralelo para analizar PDFs legales reales, convertirlos a Markdown, detectar estructura de escrituras, proponer variables canónicas y mapear su fuente futura en Plotify. El laboratorio se opera desde super-admin, usa Supabase local aislado y queda fuera del deploy productivo. El análisis de variables debe hacerlo un LLM externo conectado por MCP, no un extractor heurístico ni un agente LangGraph interno."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Subir y catalogar documentos legales (Priority: P1)

Como super admin, quiero subir PDFs y documentos legales Word/RTF a un laboratorio aislado para iniciar análisis documental sin afectar el flujo productivo de Plotify.

**Why this priority**: Sin ingesta segura no existe corpus para generar templates, variables ni mapa de fuentes.

**Independent Test**: Se puede probar subiendo un PDF, DOCX, DOC y RTF sintéticos desde el panel de laboratorio y verificando que quedan registrados como documentos de laboratorio con storage path, hash, formato fuente y estado inicial.

**Acceptance Scenarios**:

1. **Given** un usuario super admin autenticado, **When** sube un PDF, DOCX, DOC o RTF válido desde el laboratorio, **Then** el sistema guarda el archivo original en el bucket de laboratorio y registra el documento en el schema de laboratorio con su formato fuente.
2. **Given** un usuario no super admin, **When** intenta acceder al laboratorio, **Then** el sistema bloquea el acceso con la protección existente de super-admin.
3. **Given** un archivo que no es PDF, DOCX, DOC ni RTF válido, **When** se intenta subir, **Then** el sistema rechaza la carga antes de crear registros persistentes.

---

### User Story 2 - Procesar documentos a Markdown y chunks (Priority: P2)

Como super admin, quiero que el laboratorio procese documentos pendientes y persista Markdown por página física o lógica y chunks para revisar evidencia textual y alimentar análisis semántico.

**Why this priority**: El Markdown versionado por página/chunk es la base de trazabilidad para variables, templates y futuras decisiones productivas.

**Independent Test**: Se puede ejecutar el script de procesamiento sobre documentos sintéticos PDF, DOCX, DOC y RTF y verificar páginas/chunks persistidos sin tocar tablas productivas.

**Acceptance Scenarios**:

1. **Given** un documento pendiente, **When** se ejecuta el procesamiento Python, **Then** el laboratorio crea páginas Markdown y chunks vinculados al documento.
2. **Given** un PDF textual con más de una página, **When** se procesa, **Then** cada página física se persiste con su número real y sus chunks derivados.
3. **Given** un DOCX, DOC o RTF válido, **When** se procesa, **Then** se convierte a Markdown y se persiste como páginas lógicas y chunks embebibles.
4. **Given** un PDF escaneado, mixto o con encoding problemático, **When** se procesa, **Then** el documento queda marcado como requiere OCR/fallback y no se inventa contenido.
5. **Given** una exportación solicitada, **When** se ejecuta el export local, **Then** los `.md` se generan solo bajo una carpeta ignorada por Git.

---

### User Story 3 - Generar conocimiento para escrituras futuras (Priority: P3)

Como super admin, quiero conectar agentes locales por MCP para que distintos LLMs revisen el corpus, propongan variables candidatas, fuentes futuras y template draft, y guarden el resultado estructurado como insumo de una futura feature productiva de escrituras.

**Why this priority**: El objetivo del laboratorio no es generar documentos productivos, sino entregar conocimiento accionable para diseñar el motor real.

**Independent Test**: Se puede cargar datos sintéticos, conectar un cliente MCP local, leer contexto del documento, guardar un análisis LLM simulado y verificar que variables/source map/template quedan persistidos sin escribir en tablas productivas.

**Acceptance Scenarios**:

1. **Given** chunks procesados, **When** un agente LLM usa el MCP del laboratorio, **Then** puede leer contexto suficiente para proponer variables candidatas con evidencia y fuente futura sugerida.
2. **Given** un análisis producido por un LLM, **When** el agente llama la tool MCP de guardado, **Then** el laboratorio persiste template draft, catálogo de variables y mapa de fuentes.
3. **Given** cualquier resultado del laboratorio, **When** se revisa el sistema productivo, **Then** no existen escrituras, plantillas productivas ni migraciones canónicas modificadas por el laboratorio.

### Edge Cases

- Si el schema `lab_escrituras` o el bucket no existen, el panel debe mostrar una instrucción clara para ejecutar el SQL bootstrap.
- Si PostgREST no expone el schema de laboratorio, el panel debe fallar de forma visible y documentada, sin bloquear los scripts Python directos.
- Si se sube dos veces el mismo PDF, el hash debe permitir detectar duplicados para análisis manual.
- Si se sube dos veces el mismo documento, el hash debe permitir detectar duplicados para análisis manual.
- Si un documento no puede convertirse a Markdown confiable, debe quedar marcado como pendiente de OCR/fallback.
- Si se intenta operar el laboratorio fuera de entorno local/desarrollo o sin `PLOTIFY_ENABLE_ESCRITURAS_LAB=true`, la página y las rutas internas deben quedar bloqueadas.
- Si se elimina el laboratorio, `public`, las migraciones canónicas y los flujos productivos deben permanecer intactos.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST expose a super-admin-only laboratory page for Escrituras document analysis.
- **FR-002**: System MUST upload PDF, DOCX, DOC, and RTF files to a private lab-only storage bucket and register metadata in a lab-only schema.
- **FR-003**: System MUST persist extracted Markdown in Supabase lab tables as the source of truth, with optional local Markdown export only under ignored output folders.
- **FR-004**: System MUST keep all lab tables under `lab_escrituras` and MUST NOT add lab tables to canonical production migrations.
- **FR-005**: System MUST provide SQL bootstrap/reset scripts that can be run directly against the local Docker Postgres container.
- **FR-006**: System MUST provide Python-first processing for pending-document conversion/chunking and report export.
- **FR-006a**: System MUST expose a local MCP server so external agents can read lab documents/chunks, export Markdown for local review, and persist LLM-produced variable/source-map/template analysis.
- **FR-007**: System MUST mark scanned, mixed, image-based, or encoding-problem PDFs for OCR/fallback rather than treating extracted content as complete.
- **FR-008**: System MUST version-control only lab code, SQL, docs, and synthetic fixtures; real PDFs, extracted Markdown, embeddings, and output dumps MUST be ignored.
- **FR-009**: System MUST present or export variable candidates with evidence and a proposed future source in Plotify.
- **FR-010**: System MUST make the lab removable by dropping the lab schema and deleting the lab storage bucket without touching production tables.
- **FR-011**: System MUST keep the lab disabled unless explicitly enabled for local/development operation.
- **FR-012**: System MUST reject unsupported or invalid uploads before creating analysis runs, source document rows, or storage objects.
- **FR-013**: System MUST route processed Markdown chunks from every supported format into the existing embedding pipeline without generating embeddings automatically at upload time.

### Key Entities _(include if feature involves data)_

- **Analysis Run**: A single lab execution or upload session with status, parameters, timestamps, and error details.
- **Source Document**: A PDF, DOCX, DOC, or RTF stored for analysis with document type, source format, hash, storage path, processing status, and detection metadata.
- **Document Page**: Markdown extracted for a physical PDF page or logical Word/RTF page with OCR/encoding/layout flags.
- **Document Chunk**: Semantic unit derived from Markdown, optionally embedded for retrieval and evidence lookup.
- **Variable Candidate**: Proposed canonical variable, value, confidence, evidence, and future source mapping.
- **Template Candidate**: Draft escritura/template output generated from observed document structures.
- **Source Map Entry**: Proposed mapping from canonical variable to a future Plotify source such as existing tables, geometry, manual review, or new data model.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A super admin can upload valid synthetic PDF, DOCX, DOC, and RTF files and see them listed in the lab panel in one session.
- **SC-002**: SQL bootstrap and reset can create and remove all lab database/storage artifacts without changing canonical migration files.
- **SC-003**: A processing run can persist Markdown pages and chunks from text-based synthetic PDF, DOCX, DOC, and RTF files.
- **SC-004**: A local MCP client can read stored lab data and save a variables catalog, source map, and template draft produced by its LLM.
- **SC-005**: `git status` must not show real PDFs, extracted Markdown, embeddings, or lab outputs after a normal lab run.

## Assumptions

- The lab runs only in local/development environments and is excluded from production deployment planning.
- The existing Supabase Docker stack remains unchanged; `pgvector` is available and installed by lab bootstrap SQL if needed.
- Python processing and the MCP server can use direct database access through `SUPABASE_DB_URL`, while the web panel uses internal Next.js routes.
- `firecrawl/pdf-inspector` is invoked as an external PDF conversion tool or wrapper; DOCX is read with Python tooling; DOC/RTF conversion uses the local macOS `textutil` fallback in v1.
- Embeddings remain an explicit operator action after conversion; upload does not auto-vectorize chunks.
- The future production feature will reuse the findings, not necessarily the lab implementation unchanged.
- MCP is the agent integration boundary for this lab; LangGraph is intentionally out of scope for v1.
