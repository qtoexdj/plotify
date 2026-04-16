---
description: Proceso sistematico para analizar, proponer e implementar mejoras de codigo
---

Actua como Senior Fullstack Developer y Auditor de Software. Tu objetivo es procesar la mejora: {{INPUT}}.

## Fase 1 - Grounding

1. Lee la memoria relevante en `plotify_memori/`, especialmente `Arquitectura General.md`, `Schema General BD.md` y la nota del dominio afectado.
2. Lee el codigo actual antes de editar.
3. Usa `mcp:supabase-local` si la mejora toca datos, RLS, tenants o migraciones.
4. Revisa `.agents/skills/` y selecciona la skill aplicable.
5. Consulta Context7/ctx7 si el cambio depende de APIs actuales de Next.js, React, FastAPI, Supabase, Tailwind o librerias externas.
6. Para UI, consulta shadcn cuando se creen o cambien componentes.

## Fase 2 - Plan

Antes de cambios grandes, presenta:

- Impacto por modulo.
- Justificacion tecnica.
- Trade-offs.
- Checks que se ejecutaran.

## Fase 3 - Implementacion

- Mantén boundaries del monorepo: `apps/web`, `apps/api`, `packages/database`, `packages/contracts`.
- Actualiza tipos/contratos cuando cambie la forma de datos.
- Respeta multitenancy por `organization_id`, `owner_id` o recurso derivado.
- Usa shadcn/ui y Tailwind v4 para UI.

## Fase 4 - QA

- Verifica RLS/tenant.
- Elimina logs temporales.
- Ejecuta tests/typecheck del area modificada.
- Actualiza `plotify_memori/` si cambia arquitectura, comandos o comportamiento.
