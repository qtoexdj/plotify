---
description: Refactorización inteligente con análisis de impacto
agent: agent
---

Actúa como Senior Developer. Tu tarea es refactorizar: ${input:INPUT:Describe el código o módulo a refactorizar}.

**Pasos de Ejecución:**
1. **Sincronización**: Lee los archivos de `context/` para asegurar que el cambio no rompa la arquitectura definida.
2. **Inspección DB**: Usa **mcp supabase-local** para entender las relaciones de los datos que vas a modificar.
3. **Skills**: Utiliza las herramientas de `.github/skills/` que optimicen la tarea.
4. **Validación Externa**: Consulta **mcp context7** para aplicar patrones actualizados y evitar antipatrones.

**Presentación del Plan:**
- Explica la decisión técnica tomada.
- Detalla ventajas y posibles riesgos (trade-offs).
- Asegura el uso estricto de **Shadcn/UI** y **Tailwind v4**.
