# Tipos TypeScript

**Tag:** #frontend #tipos
**Relacionado:** [[00 - Home]], [[Convenciones de Codigo]], [[Validaciones Zod]]

---

## Vision general

7 archivos en `src/types/` que definen todos los tipos del frontend.

---

## database.types.ts

**Tipos generados por Supabase CLI** — canonical type definitions para todo el schema de la DB (~1496 lineas).

**Contiene:**
- Enums: `GeometryType`, `SourceType`, `EstadoLote`, `VerifiedStatus`, `ProcessStage`.
- Tipos de servidumbre: `ServidumbreEdge`, `ServidumbreTramo`, `ServidumbreAnalysis`.
- Tipos de aprobacion: `ApprovalStatus`, `VendorPlatform`, `ApprovalRequestPayload`, `ApprovalRequest`.
- GeoJSON: `GeoJSONGeometry`, `GeoJSONFeature`, `GeoJSONFeatureCollection`.
- Tipos de tablas: `Project`, `Lot`, `Geometry`, `LotRecord`, `Vendor`, `Profile`, `Organization`, `OrganizationMember`.
- `ProjectWithMetrics` — Project con conteos de lotes.
- Tipo `Database` completo con todas las tablas (Row/Insert/Update), funciones y relaciones para ~30 tablas incluyendo: `agent_custom_instructions`, `agent_skills`, `approval_requests`, `audit_logs`, `document_blocks`, `document_templates`, `generated_documents`, `geometries`, `lot_records`, `lots`, `mcp_connections`, `organizations`, `profiles`, `projects`, `system_prompts`, `prompt_versions`, `vendors`, `notification_subscriptions`, `checkpoint_blobs`, `checkpoints`, `dead_letter_queue`, `leads`.

**Regla:** Nunca modificar manualmente. Regenerar con Supabase CLI.

---

## documents.ts

Tipos para generacion de documentos legales (escrituras).

**Exports:**
- `ComparecientePersona` — Persona natural o juridica que firma.
- `EscrituraVariables` — Payload completo de variables para generar escritura (comparecientes, matriz, SAG, lote, servidumbre, transaccion, mandato, personeria).
- `ArticleType`, `ArticleCondition`, `ArticleMetadata` — Metadata de articulos atomicos.
- `ESCRITURA_ARTICLES` — Catalogo de 18 articulos (comparecencia, ART-01 a ART-16, personeria, cierre) con variables requeridas y logica condicional.

---

## onboarding.types.ts

Tipos para el workflow de upload KMZ/KML y asignacion de geometrias.

**Exports:**
- `ParsedFeature` — Feature parseada del upload (aun no en DB).
- `UploadResponse` — Respuesta de la API de upload.
- `SaveAndAssignGeometryPayload` — Payload para guardar y asignar geometria.
- `SaveInfrastructurePayload` — Payload para guardar caminos.
- `SaveGeometryResponse` — Respuesta de guardado.
- `AssignGeometryPayload` — Para vincular geometria a lote.

---

## supabase.ts

Aliases de conveniencia derivados del tipo `Database` de Supabase.

**Exports:**
- `SystemPrompt`, `PromptVersion`, `PromptVersionInsert`
- `AgentSkill`, `OrgSkillConfig`, `OrgSkillConfigUpsert`
- `DocumentBlock`, `DocumentBlockInsert`, `DocumentTemplate`, `DocumentTemplateInsert`, `TemplateBlockItem`, `GeneratedDocument`
- `McpConnection`
- `AgentCustomInstruction`
- `SkillWithConfig` — AgentSkill + org config.
- `TemplateWithBlocks` — DocumentTemplate con sus bloques.
- `PromptWithActiveVersion` — SystemPrompt con version activa.

---

## viewer.types.ts

Tipos especificos del visor de geometrias (muestra poligonos de lotes en canvas).

**Exports:**
- `ViewerFeature` — Combina geometria con datos del lote (numero_lote, estado, precio, m2, etc.).
- `ViewerFeatureCollection` — FeatureCollection GeoJSON de ViewerFeatures.
- `GeometryBounds` — min/max lon/lat.
- `CanvasConfig` — Config de renderizado del canvas.
- `LotDetails` — Detalle de lote: area oficial, perimetro, boundaries, estado verificado.

---

## canvas-transform.types.ts

Tipos puros para transformacion geo-to-canvas (renderizado Konva).

**Exports:**
- `BoundingBox` — min/max X/Y en coordenadas geograficas.
- `CanvasDimensions` — width/height en pixeles.
- `TransformParams` — Parametros pre-computados (scale, offsets, canvas height, bounds).
- `TransformOptions` — Config de padding y scaleFactor.

---

## v2.ts

Archivo placeholder/reservado para tipos V2 futuros.

---

## Relacionado
- [[Convenciones de Codigo]] — Reglas de tipado
- [[Validaciones Zod]] — Validacion runtime complementaria
