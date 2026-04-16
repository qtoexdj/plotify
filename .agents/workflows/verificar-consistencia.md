---
description: Auditoria de cumplimiento de reglas y arquitectura
---

Actua como QA Lead. Revisa la implementacion realizada en: {{INPUT}}.

## Checklist

1. **Contexto:** cumple con `plotify_memori/Arquitectura General.md`, `plotify_memori/Vision y Alcance.md` y notas de dominio relevantes.
2. **Seguridad:** queries y endpoints respetan tenant y no exponen service role al cliente.
3. **Datos:** cambios de schema tienen migracion, tipos y documentacion actualizada.
4. **UI:** se uso shadcn/ui y Tailwind v4 cuando aplica.
5. **Contratos:** frontend/backend siguen OpenAPI o tipos compartidos cuando cruza sistemas.
6. **Skills y docs:** se usaron `.agents/skills` y Context7/ctx7 cuando correspondia.
7. **Resultado:** lista discrepancias como tareas pendientes antes de cerrar.
