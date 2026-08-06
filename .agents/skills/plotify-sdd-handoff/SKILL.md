---
name: plotify-sdd-handoff
description: Cierra un SDD o hito relevante de Plotify y sincroniza la evidencia durable hacia el vault de Obsidian, memory.md y las reglas de agentes cuando corresponda. Usar al completar una feature, preparar un handoff, actualizar contexto técnico tras un hito o reconciliar documentación con cambios verificados.
---

# Plotify SDD Handoff

Actualiza memoria durable después de evidencia verificable. No uses esta skill para documentar hipótesis ni para cerrar un SDD con gates pendientes.

## Procedimiento

1. Lee `AGENTS.md`, `memory.md`, constitution y los artefactos del SDD involucrado.
2. Revisa `git status --short`, sincroniza CodeGraph y contrasta alcance real. Conserva cambios ajenos.
3. Confirma Verify, tests, gates y evidencia. Si falta una condición de cierre, registra el bloqueo y no declares el SDD terminado.
4. Actualiza sólo las notas afectadas de `plotify_memori/`: producto, arquitectura, decisiones y el handoff bajo `50 - Implementaciones/`.
5. Enlaza el handoff o hitos relevantes desde `plotify_memori/00 - Home.md`.
6. Actualiza `memory.md` con estado, referencias, correcciones verificadas y skills efectivamente usadas. Manténlo resumido; no copies el vault.
7. Actualiza `AGENTS.md` sólo cuando descubras una regla general, estable y verificable; no agregues detalles temporales ni tareas cerradas.
8. Ejecuta `pnpm check:agent-context` y `codegraph sync .`. Reporta archivos, evidencia, riesgos y verificación pendiente.

## Restricciones

- Código, manifiestos, migraciones y tests son evidencia del estado actual.
- Usa Context7 sólo para documentación externa vigente y Supabase MCP para introspección cloud; nunca Supabase local ni Docker.
- No edites `.obsidian/` como fuente de producto ni registres secretos, datos personales o evidencia sensible en vault o memoria.
