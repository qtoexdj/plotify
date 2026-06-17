# Plan de Migración: Pipeline → Agente de Título (SDD 009 rework)

**Fecha**: 2026-06-10 | **Estado**: Implementado (F0-F4 + script F5) —
pendiente: corridas en vivo del gate F5 con API key antes de habilitar el
flag. | **Reemplaza**: el núcleo de extracción de `plan.md` (decisión
"pipeline estructurado, no ReAct" de research.md queda revertida por decisión
de producto).

**Estado de ejecución (2026-06-10)**: F0 ✔ (corrección FR-006/FR-035/FR-036
en spec.md) · F1 ✔ (`apps/api/agent_titulo/` + `legal_title_words.py`, 14
tests) · F3 ✔ (verificador endurecido: miles en palabras, token boundary,
`ocr_suspect`) · F2 ✔ (orquestador recableado, `legal_title_block_check.py`,
pipeline borrado, status honesto, token_usage persistido, guard
`ocr_required`) · F4 ✔ (polling, motivos de bloque, propietarios
consolidados, notas del agente) · F5 script ✔ — **gate en vivo pendiente**:
3 corridas limpias con `RUN_TITLE_LIVE_EVAL=1` antes de
`LEGAL_TITLE_AGENT_ENABLED=true`.

## Decisión de producto

El pipeline de 4 pasos por segmento no puede reconstruir la historia jurídica
de la propiedad: cada documento se analiza aislado y el merge mecánico no
razona sobre el caso completo (structure_type last-wins, propietarios
históricos mezclados con actuales, `orden` colisionado, inscripciones
duplicadas). Se reemplaza por **un agente LangGraph con herramientas** que:

1. Lee todos los documentos de título del proyecto (dominios vigentes,
   personerías, hipotecas/gravámenes) como un solo caso.
2. Reconstruye la cadena de adquisición cronológica consolidada
   (deduplicando inscripciones citadas en más de un documento).
3. Consolida el/los propietarios actuales y la estructura del título.
4. Levanta las alertas legales con evidencia.
5. **Redacta** la comparecencia del vendedor y la cláusula PRIMERO usando
   herramientas determinísticas de números/fechas/RUT a palabras.
6. Auto-verifica sus citas con la herramienta de verificación antes de
   entregar.

## Invariantes que NO cambian

- **Extractores determinísticos SII / SAG / plano: intocables** (mandato
  explícito del usuario). El agente solo _lee_ `sii.rol_matriz` y la
  superficie del plano ya extraídos, para cruces.
- **El verificador determinístico sigue siendo sagrado** y corre _fuera_ del
  agente como gate final, aunque el agente se haya auto-verificado. Ningún
  dato sin evidencia literal queda `proposed`.
- El agente solo propone: aprobación humana en Centro de Control Legal,
  staging en `variable_resolutions`, snapshot inmutable, gate
  `title_verified`, supersede + re-análisis al reemplazar documentos.
- Contrato con SDD 008 (handoff-sdd-008-addendum.md): claves `titulo.*`,
  `matriz.*`, `vendedor.*` y semántica de alertas no cambian.
- Tabla `title_analyses` y columnas existentes: **sin migración DB**. Los
  bloques redactados por el agente se persisten en las columnas
  `narrative_*_generated` existentes.
- Tests pytest sin LLM vivo; `titulo_live_eval.py` es el único camino de
  llamada real.

## Cambio de regla del spec (corrección a registrar en spec.md)

**FR-006 (bloques)**: antes "render determinístico desde datos verificados"
(plantillas Python). Ahora: **el agente redacta los bloques; un
fact-checker determinístico (nuevo) valida que cada hecho del texto
provenga de la cadena verificada** — números en palabras deben calzar con
`number_to_words_spanish(valor_verificado)`, fechas en palabras con la fecha
verificada, nombres/notarios/CBR deben existir en campos verificados. Si un
hecho del bloque no calza, el bloque queda `manual_review` **con la lista de
calces fallidos visible**, nunca `None` silencioso. SC-002 (cero hechos no
verificados en bloques) se mantiene — cambia el mecanismo, no la garantía.

Razón: las plantillas estaban sobreajustadas al golden Teno (mapa de
notarios hardcodeado, nacionalidad/género adivinados por nombre de pila,
solo 1 propietario, solo compra/compra_derechos) e inventaban hechos
legales. El agente redacta para cualquier estructura (herencia, comunidades,
N compradores) y el gate determinístico conserva la frontera anti-alucinación.

## Qué se BORRA

### `apps/api/services/legal_title_llm.py` (se reemplaza casi completo)

- `TITULO_AGENT_PROMPT_V1` (4 líneas genéricas en inglés).
- `TITLE_EXTRACTION_STEPS`, `STEP_INSTRUCTIONS` (extracción por pasos aislados).
- `merge_title_analyses`, `_merge_unique_models`, `_merge_property_identity`,
  `_model_key` (merge mecánico — causa raíz del problema).
- `extract_title_analysis_from_documents`, `extract_title_analysis`,
  `_invoke_structured_title_analysis`.
- Se conserva: `_get_llm_client` (movido al agente),
  `build_title_document_segments`/`TitleDocumentSegment` (reutilizado como
  presupuesto de contexto para la herramienta de lectura, no como unidad de
  análisis).

### `apps/api/services/legal_title_blocks.py` (se poda a utilidades)

Borrar (sobreajuste al golden / fabricación de hechos):

- `NOTARY_TITLE_MAP`, `format_notary` (notarios hardcodeados).
- `format_property_name` ("Cóndor", "Fundo" hardcodeados).
- Inferencia de nacionalidad/género por lista de nombres de pila.
- `generate_narrative_comparecencia`, `generate_narrative_primero`,
  `render_title_blocks` (plantillas all-or-nothing).
- `format_domicilio_spanish`, `format_deslinde`, `ordinal_spanish`,
  `title_case_name` (heurísticas de la plantilla).

Conservar como módulo de utilidades determinísticas (renombrar a
`legal_title_words.py`): `number_to_words_spanish`, `date_to_words_spanish`,
`rut_to_words_spanish`, `superficie_to_words`, `normalize_text`,
`parse_int_or_none`. Doble uso: (a) herramientas del agente para redactar,
(b) base del fact-checker de bloques.

### Tests

- `test_titulo_blocks.py`: se reescribe (utilidades de palabras +
  fact-checker de bloques con casos de calce fallido).
- Tests del merge/pasos en `test_titulo_analysis.py`: se reemplazan por
  tests del agente con LLM guionizado (scripted/fake) que reproduce la
  secuencia de tool-calls grabada.

## Qué se CONSERVA (con ajustes menores)

| Pieza                                                                                   | Estado                                         | Ajuste                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemas/legal_titles.py` (`TitleAnalysis` + EvidencedValue)                            | Se conserva como contrato de salida del agente | Agregar a `PropietarioActual`: `nacionalidad` y `tratamiento` ("don"/"doña") como `EvidencedValue` — hoy se adivinaban; deben extraerse con evidencia o quedar en `manual_review` |
| `legal_title_verification.py`                                                           | Sagrado, se conserva                           | Endurecer heurísticas (ver F3); además se expone como herramienta del agente                                                                                                      |
| `legal_title_analysis.py` (orquestador, idempotencia, supersede, staging, aprobación)   | Se conserva                                    | Cambiar la llamada de extracción al agente; registrar `token_usage`; pasar `plano_superficie` real; status según verificación (ver F2)                                            |
| Endpoints `legal_titles.py` + proxies web                                               | Se conservan                                   | Sin cambios de contrato                                                                                                                                                           |
| `title-case-panel.tsx` y subcomponentes                                                 | Se conservan                                   | Polling + razones de bloque + visor de evidencia (F4)                                                                                                                             |
| Fixtures Teno (`teno_golden_chain.json`, `teno_golden_blocks.md`, páginas, alucinación) | Se conservan                                   | Pasan a ser el gate de la eval en vivo y few-shot del prompt                                                                                                                      |
| `titulo_live_eval.py`                                                                   | Se conserva                                    | Se extiende con fact-coverage de bloques y se convierte en gate de cierre                                                                                                         |
| Worker `legal_document_ingestion` (encolado/supersede)                                  | Se conserva                                    | Solo timeout                                                                                                                                                                      |

## Qué se IMPLEMENTA

### F1 — Agente de título (`apps/api/agent_titulo/`)

Nuevo paquete (espejo del patrón de `apps/api/agent/`, grafo independiente —
no se toca el agente de ventas):

- `graph.py`: grafo LangGraph ReAct acotado
  (`create_react_agent`/`StateGraph`), `recursion_limit` configurable
  (default 24), salida final estructurada `TitleAgentResult`:

  ```python
  class TitleAgentResult(LegalTitleBaseModel):
      analysis: TitleAnalysis                     # contrato existente
      narrativa_comparecencia: str | None = None  # redactada por el agente
      narrativa_primero: str | None = None
      notas_razonamiento: list[str] = []          # resumen auditable de pasos
  ```

- `tools.py` (todas tenant-scoped, solo lectura, acotadas por
  `LEGAL_TITLE_AGENT_MAX_INPUT_CHARS`):
  - `listar_documentos()` → inventario: id, tipo, filename, n° páginas.
  - `leer_paginas(legal_document_id, desde, hasta)` → texto OCR paginado.
  - `buscar_texto(consulta)` → búsqueda normalizada (sin acentos) en todas
    las páginas; retorna doc/página/contexto. Para localizar snippets
    exactos y verificar grafías (Minghel vs Minchelli).
  - `verificar_hechos(hechos[])` → corre `verify_evidenced_value` sobre
    borradores; el agente corrige citas antes de entregar.
  - `numero_a_palabras(n)`, `fecha_a_palabras(f)`, `rut_a_palabras(r)` →
    de `legal_title_words.py`; el agente DEBE usarlas para los números de
    los bloques (instrucción de prompt + fact-checker lo fuerza).
  - `datos_expediente()` → `sii.rol_matriz`, superficie del plano,
    personerías activas (solo lectura de lo ya extraído por SDD 007).
- `prompts.py`: prompt de sistema en **español**, específico de estudio de
  títulos chileno: semántica de cadena (el título posterior cita la
  inscripción anterior → misma inscripción, deduplicar; orden cronológico
  global; "vigente en el resto" = transferencia parcial; compra de acciones
  y derechos ≠ compra simple; herencia: posesión efectiva → inscripción
  especial → cesión), consolidación del propietario actual (el dato más
  reciente con evidencia manda; discrepancias → alerta
  `discrepancia_declaracion`), taxonomía de alertas, reglas de evidencia
  (snippet literal de la página, jamás parafrasear), y few-shot compacto
  derivado del golden Teno (entrada resumida → salida esperada).
- `runner.py`: `run_title_agent(source_documents, expediente, settings) ->
TitleAgentResult` + captura de `token_usage` (callback de usage de
  LangChain) y trazas (`notas_razonamiento`).

Config (`core/config.py`):

- `LEGAL_TITLE_AGENT_TIMEOUT_SECONDS`: 10 → **300** (presupuesto del run
  completo del grafo; el timeout por llamada LLM se deriva de él).
- Nuevos: `LEGAL_TITLE_AGENT_MAX_ITERATIONS` (default 24),
  `LEGAL_TITLE_AGENT_MAX_TOOL_CHARS` (presupuesto por lectura).
- Proveedor/modelo siguen configurables (OpenAI default por la key
  existente; Anthropic alternativa). La eval en vivo (F5) decide el default
  definitivo.

### F2 — Recableado del orquestador y fact-checker de bloques

`legal_title_analysis.py::run_title_analysis`:

1. Reemplazar `extract_title_analysis_from_documents(...)` por
   `run_title_agent(...)`.
2. Verificador final (sin cambios de rol) sobre `result.analysis`, ahora
   con `plano_superficie` real (leído de los datos de plano ya extraídos —
   hoy se pasa `None` siempre: bug).
3. **Nuevo** `legal_title_block_check.py::check_block_facts(texto, analysis)
-> BlockCheckResult`: extrae del texto los números en palabras, fechas en
   palabras, nombres propios y referencias registrales, y los calza contra
   los campos **verificados** de la cadena. Resultado: `ok` o lista de
   `{hecho, motivo}`. Bloque con calces fallidos → `manual_review` con
   motivos persistidos (nueva clave en `verification_stats`, sin migración:
   es JSONB).
4. Status honesto: `proposed` solo si la cadena tiene ≥1 inscripción y 0
   fallas de verificación en cadena/identidad; si hay fallas →
   `needs_review` (la causa ya viaja en `verification_stats.failures`).
   OCR vacío → `needs_review` causa `ocr_required` (hoy no se distingue).
5. Persistir `token_usage` y `notas_razonamiento` (en `verification_stats`
   o `analysis_json._meta`; decidir en implementación, sin migración).
6. `stage_title_analysis_proposals`: sin cambios de contrato; los textos de
   bloque ahora vienen del agente + fact-checker. Gap conocido a registrar:
   `vendedor.*` solo toma `propietarios_actuales[0]` — con comunidades de
   herederos queda corto; se documenta y se resuelve con SDD 008 (la
   comparecencia redactada sí cubre N propietarios).

### F3 — Endurecimiento del verificador (precisión, nunca relajación)

- `number_to_spanish` solo cubre < 100: extender a miles usando
  `number_to_words_spanish` (hoy "fojas mil trescientos treinta y ocho" en
  palabras no valida contra valor 1338).
- Calce de año demasiado laxo: `"23" in clean_snip` matchea cualquier
  substring; exigir token completo (word boundary).
- Calce de nombres demasiado estricto con ruido OCR: mantener el fallo
  (correcto: → manual_review) pero reportar `reason: "ocr_suspect"` con
  distancia de edición ≤1 para que el revisor priorice (el spec ya prevé
  "verificación visual si la confianza OCR es baja").
- Regresión obligatoria: fixture de alucinación (fechas 2023, apellido
  alterado) debe seguir terminando en `manual_review`.

### F4 — Interfaz (Centro de Control Legal)

- **Polling** en `title-case-panel.tsx` durante `processing` (intervalo 5s,
  tope 10 min) — hoy dice "se actualizará" y no se actualiza.
- **Bloques con explicación**: cuando un bloque está en `manual_review` o
  ausente, mostrar los motivos del fact-checker ("notario de la inscripción
  Dos no verificado: snippet no calza en página 3") en
  `title-narrative-editor.tsx`, con CTA al dato pendiente.
- **Evidencia a 2 clics**: reutilizar `legal-evidence-viewer.tsx` (SDD 007)
  desde cada inscripción del `title-chain-timeline.tsx` y cada alerta
  (doc + página + snippet resaltado). SC-005 hoy es incumplible.
- Mostrar `propietario(s) actual(es) consolidado(s)` como sección propia
  (hoy solo se ve la cadena).
- Mostrar tokens/duración del run en el detalle (observabilidad SC-010).

### F5 — Gate de calidad y rollout

1. Extender `titulo_live_eval.py`: además de exactitud de cadena vs
   `teno_golden_chain.json`, (a) cobertura de alertas esperadas, (b)
   fact-coverage de los bloques redactados (0 hechos no verificados), (c)
   similitud estructural contra `teno_golden_blocks.md` (informativa, no
   gate duro).
2. **Criterio de cierre de la migración** (reemplaza "tests verdes"):
   - SC-001: 100% de inscripciones correctas (fechas 2022, Minghel) en ≥3
     corridas en vivo consecutivas.
   - SC-002: fixture de alucinación → `manual_review` siempre.
   - SC-003: alertas `dl_3516`, `derechos_aguas`, `vigente_en_el_resto`,
     `multi_inmueble` presentes con evidencia.
   - Bloques: fact-checker en `ok` y revisión visual del usuario contra el
     golden.
3. Correr la eval con OpenAI y Anthropic; fijar el default por resultados y
   costo (tokens registrados por fin).
4. Solo entonces `LEGAL_TITLE_AGENT_ENABLED=true` y avanzar a SDD 008.

## Orden de ejecución y dependencias

```
F0 Corrección spec.md (regla de bloques) ─┐
F1 Agente (paquete nuevo, sin tocar prod) ─┼─→ F2 Recableo + borrado pipeline ─→ F4 UI
F3 Verificador (paralelo a F1)            ─┘            │
                                                        └─→ F5 Eval viva = gate
```

F1 y F3 son paralelizables y no rompen nada (código nuevo + utilidades).
F2 es el punto de no retorno (borra el pipeline); se hace cuando los tests
guionizados del agente están verdes. F5 bloquea el flag y SDD 008.

## Riesgos

- **Reproducibilidad de tests del agente**: un ReAct no es determinístico;
  los pytest usan un LLM guionizado (replay de tool-calls grabadas) y la
  calidad real se mide solo en la eval viva. Asumido y alineado con la regla
  "no LLM en tests".
- **Costo/latencia**: un run del agente son N tool-calls + redacción
  (estimado 3-6 llamadas LLM vs 4×segmentos del pipeline — comparable o
  menor, con mejor calidad). Acotado por iteraciones, chars y timeout, y
  ahora medible (tokens registrados).
- **Corpus de un solo caso**: todo sigue calibrado a Teno. Acción: pedir al
  abogado 1 caso de herencia y 1 dominio único para fixtures antes de dar
  por cerrada la migración (ya estaba asumido en spec, sigue pendiente).
