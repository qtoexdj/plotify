---
description: Planificacion de nuevas funcionalidades basadas en contexto real
---

Actua como Lead Architect de Plotify. Quiero implementar: {{INPUT}}.

## Instrucciones

1. Lee la memoria relevante en `plotify_memori/`.
2. Usa `mcp:supabase-local` para inspeccionar tablas, FKs, funciones y RLS si la feature toca datos.
3. Revisa `.agents/skills/` y selecciona skills aplicables.
4. Consulta Context7/ctx7 para APIs externas o framework-specific debugging.
5. Para UI, usa shadcn/ui y Tailwind v4.

## Entregables del plan

- Base de datos: tablas, columnas, RPCs o migraciones necesarias.
- Contratos: cambios en `packages/contracts` o tipos compartidos.
- Backend: endpoints, servicios, workers o integraciones.
- Frontend: rutas, server actions, services y componentes.
- Validacion: tests/checks necesarios.

Importante: entrega estructura y logica primero; no implementes codigo completo hasta que el usuario apruebe si el cambio es grande o ambiguo.
