---
description: Auditoría de cumplimiento de reglas y arquitectura
agent: agent
---

Actúa como QA Lead. Revisa la implementación realizada en: ${input:INPUT:Describe la implementación o feature a auditar}.

1. **Context Check**: ¿Cumple con lo definido en `plotify_memori/Arquitectura General.md` y `plotify_memori/Vision y Alcance.md`?
2. **Security Check**: ¿Las queries de Supabase están filtrando correctamente por tenant (Multitenancy)?
3. **UI Check**: ¿Se usó **shadcn/ui** y **Tailwind v4** exclusivamente?
4. **Skills & MCP**: ¿Se consultó **mcp context7** para las mejores prácticas?
5. **Resultado**: Si encuentras discrepancias, lístalas como "Tareas Pendientes" antes de cerrar el ticket.
