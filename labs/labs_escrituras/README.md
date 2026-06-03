# Laboratorio de Escrituras

Laboratorio local para analizar PDFs legales reales, convertirlos a Markdown, detectar estructura de escrituras, proponer variables canonicas y mapear fuentes futuras para Plotify.

Este laboratorio no es parte del runtime productivo:

- No se despliega.
- No modifica `packages/database/supabase/migrations`.
- No escribe en tablas productivas.
- No genera escrituras productivas.
- No versiona PDFs reales, Markdown extraido, embeddings ni outputs.

## Activacion local

Entrar a la carpeta del proyecto:

```bash
cd /Users/matiasburgos/Developer/plotify
```

Activar el entorno Python existente:

```bash
source apps/api/venv/bin/activate
```

Instalar o refrescar dependencias del laboratorio:

```bash
apps/api/venv/bin/python -m pip install -e labs/labs_escrituras
```

Aplicar bootstrap local si el panel indica que falta el laboratorio:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < labs/labs_escrituras/sql/001_bootstrap_lab.sql
```

Levantar el front:

```bash
PLOTIFY_ENABLE_ESCRITURAS_LAB=true pnpm dev:web
```

Entrar como super-admin a:

```text
/super-admin/labs/escrituras
```

Reset completo:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < labs/labs_escrituras/sql/002_reset_lab.sql
```

Consultas utiles:

```bash
docker exec -i supabase-db psql -U postgres -d postgres < labs/labs_escrituras/sql/003_sample_queries.sql
```

## Flujo

1. Un super admin sube uno o varios documentos PDF, DOCX, DOC o RTF desde `/super-admin/labs/escrituras`.
2. El archivo original se guarda en el bucket privado `lab-escrituras-documents`.
3. El registro queda en `lab_escrituras.source_documents` con `source_format`.
4. El boton `Procesar pendientes` ejecuta el procesador local y guarda Markdown en `document_pages` y chunks en `document_chunks`.
5. Un agente conectado por MCP lee chunks/paginas, analiza con el LLM configurado en ese cliente y guarda variables/source map/template en el laboratorio.
6. Los reportes exportables quedan en `output/` solo para revision local.
7. El boton `Embeddings pendientes` genera embeddings OpenAI para buscar chunks por similitud semantica desde el MCP.

## Analisis documental v1

El cierre de analisis para estructura, variables, source map y arquitectura del
gestor de escrituras queda en:

- `docs/escrituras-data-architecture-study.md`: estudio consolidado con
  evidencia MCP, base normativa chilena, variables bloqueantes, gates y
  arquitectura recomendada.
- `docs/template-draft.md`: template inicial de escritura de compraventa rural
  chilena con datos variables en corchetes.
- `docs/variables-catalog.md`: catalogo inicial de variables canonicas.
- `docs/source-map.md`: mapa de fuentes futuras recomendadas por variable.
- `docs/gestor-escrituras-logic.md`: logica del gestor y bounded contexts.

El bootstrap intenta exponer `lab_escrituras` a PostgREST local con:

```sql
alter role authenticator set pgrst.db_schemas = 'public,storage,graphql_public,lab_escrituras';
notify pgrst, 'reload config';
```

Si el panel indica que el schema no esta expuesto, reinicia los contenedores Supabase locales o revisa si el stack fuerza `PGRST_DB_SCHEMAS` por variable de entorno.

## Operacion local

Copiar variables:

```bash
cp labs/labs_escrituras/.env.example labs/labs_escrituras/.env
```

El entorno recomendado es el existente en `apps/api/venv`; no hace falta crear otro.

El procesamiento normal se hace desde el front con el boton `Procesar pendientes`. El comando queda solo como diagnostico manual:

```bash
apps/api/venv/bin/python -m lab_escrituras.process_pending
```

Exportar reportes:

```bash
apps/api/venv/bin/python -m lab_escrituras.export_reports
```

## MCP para agentes

El analisis de escrituras lo hace el modelo conectado al cliente MCP. El servidor MCP de este laboratorio no llama a OpenAI, Claude ni otro proveedor: solo entrega contexto y persiste la respuesta estructurada del agente.

Instalar el paquete del laboratorio en un entorno local:

```bash
apps/api/venv/bin/python -m pip install -e labs/labs_escrituras
```

Ejecutar por stdio:

```bash
apps/api/venv/bin/plotify-escrituras-mcp
```

Ese comando no se deja corriendo junto con el front. Cada cliente MCP lo inicia como subproceso cuando esta configurado. Ejecutarlo manualmente solo sirve para comprobar que arranca.

Tools expuestas:

- `list_lab_documents`: lista documentos cargados/procesados.
- `get_lab_document_context`: entrega metadata, chunks Markdown y guia de analisis.
- `get_lab_document_pages`: entrega Markdown por pagina cuando el agente necesita mas contexto.
- `search_lab_chunks`: busca chunks embebidos por similitud semantica.
- `export_lab_document_markdown`: escribe paginas/chunks en `labs/labs_escrituras/output/` para revisar en VS Code.
- `get_escrituras_analysis_guidance`: devuelve esquema esperado y reglas de source mapping.
- `save_escrituras_llm_analysis`: persiste variables candidatas, source map y template draft producidos por el LLM.

### Claude Desktop

Archivo macOS:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Agregar:

```json
{
  "mcpServers": {
    "plotify-escrituras": {
      "command": "/Users/matiasburgos/Developer/plotify/apps/api/venv/bin/plotify-escrituras-mcp",
      "args": [],
      "env": {
        "LAB_MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Reiniciar Claude Desktop despues de editar. Logs utiles:

```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```

### Claude Code

Opcion CLI:

```bash
claude mcp add --transport stdio --env LAB_MCP_TRANSPORT=stdio plotify-escrituras -- /Users/matiasburgos/Developer/plotify/apps/api/venv/bin/plotify-escrituras-mcp
```

Verificar:

```bash
claude mcp list
```

Dentro de Claude Code tambien puedes usar:

```text
/mcp
```

### Codex CLI / Codex IDE

Archivo global:

```text
~/.codex/config.toml
```

Agregar:

```toml
[mcp_servers.plotify-escrituras]
command = "/Users/matiasburgos/Developer/plotify/apps/api/venv/bin/plotify-escrituras-mcp"
args = []
startup_timeout_sec = 30
tool_timeout_sec = 600

[mcp_servers.plotify-escrituras.env]
LAB_MCP_TRANSPORT = "stdio"
```

Verificar en Codex:

```text
/mcp
```

Tambien puedes agregarlo por CLI:

```bash
codex mcp add plotify-escrituras -- /Users/matiasburgos/Developer/plotify/apps/api/venv/bin/plotify-escrituras-mcp
```

### Google Antigravity

Archivo:

```text
~/.gemini/antigravity/mcp_config.json
```

Agregar:

```json
{
  "mcpServers": {
    "plotify-escrituras": {
      "command": "/Users/matiasburgos/Developer/plotify/apps/api/venv/bin/plotify-escrituras-mcp",
      "args": [],
      "cwd": "/Users/matiasburgos/Developer/plotify",
      "env": {
        "LAB_MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

En Antigravity tambien puedes abrir el MCP Store, elegir `Manage MCP Servers`, luego `View raw config`, y pegar el bloque anterior.

### VS Code / GitHub Copilot

Archivo workspace:

```text
.vscode/mcp.json
```

Contenido:

```json
{
  "servers": {
    "plotifyEscrituras": {
      "type": "stdio",
      "command": "/Users/matiasburgos/Developer/plotify/apps/api/venv/bin/plotify-escrituras-mcp",
      "args": [],
      "env": {
        "LAB_MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Comandos utiles en VS Code:

- `MCP: Open Workspace Folder MCP Configuration`
- `MCP: List Servers`
- `MCP: Reset Cached Tools`

Prompt recomendado para el agente:

```text
Usa el MCP plotify-escrituras. Lista documentos procesados, toma el contexto del documento elegido, analiza variables canonicas para una futura escritura Plotify, no inventes datos sin evidencia, propone source_map y guarda el resultado con save_escrituras_llm_analysis.
```

Referencias usadas para estos formatos:

- Claude Desktop/local MCP: https://modelcontextprotocol.io/docs/develop/connect-local-servers
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- VS Code MCP: https://code.visualstudio.com/docs/copilot/reference/mcp-configuration
- Antigravity MCP: https://antigravity.google/docs/mcp
- Codex MCP: https://developers.openai.com/codex/mcp

## Conversion documental, PDF Inspector y OCR

El laboratorio acepta PDF, DOCX, DOC y RTF. DOCX se procesa con `python-docx`; DOC y RTF usan el conversor local macOS `textutil`. Si `textutil` no esta disponible, esos documentos quedan marcados como fallidos con una instruccion explicita.

El laboratorio usa un comando compatible con `firecrawl/pdf-inspector` para clasificar PDFs, extraer texto cuando el PDF es textual y detectar paginas que requieren OCR. Configurar:

```bash
PDF_INSPECTOR_COMMAND="pdf2md"
```

El comando debe aceptar:

```bash
pdf2md path/to/file.pdf --json
```

Si no existe un binario `pdf2md` en el PATH, el laboratorio usa un fallback local basado en `pypdf` que mantiene el mismo contrato JSON.

Para PDFs escaneados, mixtos, imagen o con paginas sin texto, el procesador aplica OCR local con Tesseract:

```bash
LAB_OCR_ENABLED=true
LAB_OCR_LANGUAGE=spa+eng
LAB_OCR_DPI=220
```

Dependencias locales:

```bash
brew install tesseract tesseract-lang
apps/api/venv/bin/python -m pip install -e labs/labs_escrituras
```

`pdf-inspector` sigue siendo la pieza de routing: detecta `TextBased`, `Scanned`, `Mixed` o `ImageBased` y reporta `pages_needing_ocr`. Tesseract es el backend OCR que convierte esas paginas a texto.

## Embeddings y busqueda vectorial

Configurar la API key en `labs/labs_escrituras/.env`:

```bash
OPENAI_API_KEY=sk-...
LAB_EMBEDDING_MODEL=text-embedding-3-small
LAB_EMBEDDING_BATCH_SIZE=64
```

`text-embedding-3-small` genera vectores de 1536 dimensiones, que coincide con `document_chunks.embedding extensions.vector(1536)`.

Generar embeddings para chunks pendientes desde el front:

```text
/super-admin/labs/escrituras -> Embeddings pendientes
```

Comando manual equivalente:

```bash
apps/api/venv/bin/python -m lab_escrituras.embeddings
```

Verificar conteo:

```bash
apps/api/venv/bin/python -c "from lab_escrituras.config import load_config; from lab_escrituras.db import connect; c=load_config(); cm=connect(c); conn=cm.__enter__(); cur=conn.cursor(); cur.execute('select count(*) from lab_escrituras.document_chunks where embedding is not null'); print(cur.fetchone()); conn.close()"
```

Una vez generados, los agentes pueden usar la tool MCP:

```text
search_lab_chunks
```

Ejemplo de prompt:

```text
Usa search_lab_chunks para encontrar evidencia sobre dominio, fojas, rol SII, lote, superficie y certificado SAG. Luego abre el contexto de los documentos relevantes y guarda variables candidatas.
```

## Git

Se versiona codigo, SQL, docs y fixtures sinteticos. Se ignoran:

- `input/`
- `output/`
- `.env`
- PDFs reales
- Markdown extraido
- embeddings/dumps
