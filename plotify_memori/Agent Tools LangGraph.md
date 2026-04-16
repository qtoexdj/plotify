# Agent Tools (LangGraph)

**Tag:** #backend #ia
**Relacionado:** [[00 - Home]], [[Agente IA LangGraph]], [[Estructura Backend]]

---

## Vision general

5 herramientas LangGraph en `agent/tools/` que el agente IA puede usar para consultar y actuar sobre datos del sistema.

---

## lot_search.py

Herramientas de busqueda de lotes.

**Exports:**
- `check_lot_availability(organization_id, max_price, min_m2, numero_lote)` — Busca lotes disponibles con filtros de precio, m2, numero.
- `get_lot_stage(organization_id, numero_lote)` — Retorna etapa actual del pipeline de un lote especifico.

---

## projects.py

Busqueda de proyectos activos.

**Exports:**
- `search_projects(organization_id)` — Lista proyectos activos con descripciones.

---

## reservations.py

Requisitos de reserva y datos bancarios.

**Exports:**
- `_get_payment_info(organization_id)` — Obtiene datos bancarios de la org desde `organization_payment_info`.
- `get_reservation_requirements(organization_id, numero_lote)` — Retorna pasos de reserva, info bancaria, y valor especifico del lote. Registra accion en audit_logs.

---

## clients.py

Busqueda de leads/clientes.

**Exports:**
- `search_clients(organization_id, name, phone)` — Busca leads por nombre o telefono (top 10 resultados).

---

## reports.py

Reportes de pipeline y KPIs.

**Exports:**
- `get_pipeline_summary(organization_id, project_name)` — Conteo de lotes por estado, opcionalmente filtrado por proyecto.
- `get_delinquent_lots(organization_id)` — Lotes reservados sin avance en 30+ dias.
- `get_kpis(organization_id)` — Totales de lotes por estado, leads capturados, y vendedores activos.

---

## Skill Registry

**Archivo:** `agent/skill_registry.py`

- `BUILTIN_HANDLERS` — Dict slug → StructuredTool.
- `@register_builtin` — Decorador para registrar tool al importar modulo.
- `get_tools_for_org(org_id, role)` — Resuelve skills activas para org+role, combina skills del sistema con configs de la org. Cache en Redis (5 min TTL).
- `_create_mcp_tool(...)` — Crea StructuredTool dinamico que proxy a servidor MCP externo (Phase 5).

---

## Prompt Cache

**Archivo:** `agent/prompt_cache.py`

- `get_active_prompt(slug)` — Cache-aside con Redis (5 min TTL). Fallback a Supabase (system_prompts + prompt_versions).
- `invalidate_prompt_cache(slug)` — Invalida cache tras activar nueva version.

---

## Grafo LangGraph

**Archivo:** `agent/graph.py`

- `get_llm()` — Selecciona LLM: OpenAI GPT-4o-mini preferido, Anthropic Claude 3 Haiku fallback.
- `get_llm_with_tools()` — LLM con herramientas vinculadas.
- `get_graph_for_org(org_id, role)` — Factory async que compila workflow con tools por org/role. Soporta custom instructions para admins.

**Archivo:** `agent/state.py`

- `AgentState` — TypedDict con: messages (add_messages reducer), lead_info, context, role (lead/vendor/admin), organization_id, user_id.

---

## Relacionado
- [[Agente IA LangGraph]] — Arquitectura general del agente
- [[Tablas Agente IA]] — Tablas de prompts y skills
