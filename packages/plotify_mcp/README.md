# Plotify MCP Server (`plotify_mcp`)

Servidor MCP (Model Context Protocol) oficial para **Plotify**. Permite a los agentes de IA interactuar directamente con la plataforma inmobiliaria, consultar proyectos, analizar el estado del inventario de lotes y ejecutar el **Generador de Textos Legales** para minutas y escrituras públicas.

---

## 🛠️ Herramientas Disponibles

1. **`plotify_list_projects`**: Lista proyectos con métricas de inventario (total lotes, disponibles, reservados, vendidos, estado y ubicación).
2. **`plotify_get_project`**: Ficha técnica y legal del proyecto (documentos de dominio, subdivisiones SAG, planos oficiales, vías y vendedores).
3. **`plotify_list_lots`**: Listado de lotes con filtros por estado (`disponible`, `reservado`, `vendido`), precio y superficie en m².
4. **`plotify_get_lot`**: Ficha 360° del lote con deslindes estructurados, servidumbres, rol SII y datos del comprador/notaría/CBR.
5. **`plotify_generate_lot_legal_texts`**: Ejecuta el **Generador de Textos Legales** de Plotify para obtener la redacción oficial notarial de deslindes y servidumbre de tránsito con números en palabras.
6. **`plotify_get_lot_legal_variables`**: Entrega las variables agrupadas para redactar contratos y escrituras (inmueble, deslindes, SII, comprador, precio).
7. **`plotify_search_lots`**: Búsqueda global por comprador, RUT, Rol SII o número de lote.

---

## 🚀 Configuración en Clientes MCP

### Antigravity / Claude Desktop / Cursor

Agrega la siguiente configuración a tu archivo `mcp_config.json`:

```json
{
  "mcpServers": {
    "plotify": {
      "command": "/Users/matiasignacio/Developer/plotify/apps/api/.venv/bin/python",
      "args": ["/Users/matiasignacio/Developer/plotify/packages/plotify_mcp/server.py"],
      "env": {
        "SUPABASE_URL": "https://swkrnjdpnlrgxgotmfxy.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<TU_SUPABASE_SERVICE_ROLE_KEY>"
      }
    }
  }
}
```

---

## 🧪 Pruebas Locales

Para probar el servidor manualmente o con el inspector de MCP:

```bash
# Ejecutar directamente
/Users/matiasignacio/Developer/plotify/apps/api/.venv/bin/python /Users/matiasignacio/Developer/plotify/packages/plotify_mcp/server.py

# Inspeccionar con MCP Inspector
npx @modelcontextprotocol/inspector /Users/matiasignacio/Developer/plotify/apps/api/.venv/bin/python /Users/matiasignacio/Developer/plotify/packages/plotify_mcp/server.py
```
