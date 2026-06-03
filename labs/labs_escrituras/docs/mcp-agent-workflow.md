# MCP Agent Workflow

El laboratorio usa MCP para que el analisis lo haga un LLM externo al repo. El servidor entrega contexto y guarda resultados; no contiene heuristicas de extraccion ni un agente LangGraph.

## Flujo esperado

1. Subir PDFs desde `/super-admin/labs/escrituras`.
2. Procesar pendientes con `python -m lab_escrituras.process_pending`.
3. Conectar un cliente MCP local al servidor `plotify-escrituras-lab`.
4. El agente usa `list_lab_documents` y `get_lab_document_context`.
5. Si necesita revisar el Markdown completo, usa `get_lab_document_pages` o `export_lab_document_markdown`.
6. El agente razona con su propio modelo y llama `save_escrituras_llm_analysis`.
7. La UI y `export_reports.py` leen las tablas resultantes.

## Responsabilidad del LLM

El LLM debe producir:

- Variables canonicas candidatas.
- Valor propuesto cuando exista evidencia clara.
- Evidencia textual breve.
- Confianza.
- Fuente futura sugerida en Plotify.
- Tabla/campo existente cuando aplique.
- Razonamiento de por que una variable debe venir de `geometry`, `lots`, `lot_records`, `project_legal_data`, `future_model` o `manual_review`.

## Criterios de calidad

- No inventar datos ausentes del Markdown.
- Marcar como `manual_review` cuando la evidencia sea ambigua.
- Preferir `geometry` para superficies, deslindes, coordenadas y elementos derivados de planos/lotes.
- Preferir `lots` para identificadores y atributos propios del lote.
- Preferir `lot_records` para comprador, reserva, venta y datos comerciales existentes.
- Proponer `future_model` cuando la escritura requiere datos legales que Plotify aun no modela.

## Ejemplo minimo de payload para guardar

```json
{
  "document_id": "uuid-del-documento",
  "model_name": "claude-opus-4.1",
  "variables": [
    {
      "canonical_variable": "matriz.dominio.fojas",
      "proposed_value": "123",
      "confidence": 0.82,
      "evidence": "Inscrita a fojas 123...",
      "future_source": "project_legal_data",
      "source_table": "project_legal_data",
      "source_field": "dominio_cbr_fojas",
      "metadata": { "page_number": 1 }
    }
  ],
  "source_map": [
    {
      "canonical_variable": "matriz.dominio.fojas",
      "future_source": "project_legal_data",
      "source_table": "project_legal_data",
      "source_field": "dominio_cbr_fojas",
      "rationale": "Dato legal del predio matriz, no del lote individual."
    }
  ],
  "template_markdown": "..."
}
```
