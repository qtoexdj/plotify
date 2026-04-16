# Roadmap Plotify

**Tag:** #referencia #roadmap
**Relacionado:** [[00 - Home]], [[Vision y Alcance]], [[Schema General BD]]

---

## Version actual: V2.1 (CAD Freeze)

### Estado actual

- KMZ/KML import funcional.
- Asignacion de geometrias en mapa interactivo.
- Gestion de estados de venta (disponible, reservado, vendido).
- Tracking contractual con lot_records.
- Dashboard con KPIs.
- Agente IA con LangGraph (Telegram).
- Sistema de documentos legales (bloques + plantillas).
- Prompt Ops y Skill Registry.

### Congelado

- Procesamiento CAD (DWG/DXF) — congelado/experimental.

## Fases ejecutadas

### Fase 1: DB Foundations
- system_prompts, prompt_versions
- agent_skills, org_skill_configs
- agent_custom_instructions

### Fase 2: Agent Refactor
- Agent lee prompts de DB (no hardcodeados).
- CRUD APIs para prompts y skills.

### Fase 3: Prompt Ops UI
- Super admin puede gestionar prompts.

### Fase 4-5: Skill Registry
- Backend + frontend para skills.
- Nuevas habilidades del agente.

### Fase 6: Document Orchestrator
- Backend Jinja2 + WeasyPrint + python-docx.
- 18 articulos atomicos de escritura.

### Fase 7: Document Frontend
- Template builder con drag-and-drop.
- Generador por lote.
- Historial de documentos.

## Proximas fases (P2-P3)

> [!note]
> La hoja de ruta activa para cierre de piloto quedo separada en [[Hoja de Ruta - Cierre Plotify Piloto Clientes]] y [[Backlog Implementable - Cierre Plotify]]. Este roadmap queda como referencia historica del estado V2.1.

### MCP Integration Hub
- OAuth2 para Google Drive, Gmail, Notion, Slack.
- Credenciales encriptadas con pgcrypto.

### Admin-Intelligence Agent
- Multi-tool orchestration.
- Agente que usa MCP connections para contexto.

### Telegram Proactivo
- Notificaciones push a compradores.
- Alertas de estado de lote.

## Relacionado
- [[Vision y Alcance]] — Que es Plotify hoy
- [[Schema General BD]] — Base de datos actual
- [[PRD - Cierre Plotify Piloto Clientes]] — PRD activo del piloto
- [[Hoja de Ruta - Cierre Plotify Piloto Clientes]] — Roadmap activo
- [[Backlog Implementable - Cierre Plotify]] — Tareas verificables
