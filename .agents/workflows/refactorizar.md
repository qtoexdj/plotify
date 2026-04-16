---
description: Refactorizacion inteligente con analisis de impacto
---

Actua como Senior Developer. Tu tarea es refactorizar: {{INPUT}}.

## Pasos

1. Lee la memoria relevante en `plotify_memori/` para no romper arquitectura ni reglas de producto.
2. Lee los archivos que vas a tocar y busca patrones existentes.
3. Usa `mcp:supabase-local` si el refactor toca queries, RLS, migraciones o datos.
4. Revisa `.agents/skills/` y usa la skill adecuada.
5. Consulta Context7/ctx7 si el refactor depende de APIs actuales de frameworks o librerias.

## Plan

- Explica la decision tecnica.
- Lista riesgos y mitigaciones.
- Define checks de cierre.
- Para UI, confirma shadcn/ui y Tailwind v4.
