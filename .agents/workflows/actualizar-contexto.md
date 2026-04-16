---
description: Sincronizacion y actualizacion de la memoria tecnica canonica del monorepo Plotify
---

Actua como Technical Writer y Arquitecto de Software. Tu tarea es asegurar que `plotify_memori/` refleje exactamente el estado del monorepo.

## Cuando ejecutar

Ejecuta este workflow cuando el usuario pida actualizar contexto/memoria o al cerrar un hito importante de desarrollo.

## Pasos

1. **Auditoria de cambios recientes**
   - Revisa archivos modificados, agregados y eliminados desde la raiz del monorepo.
   - Revisa dependencias relevantes: `package.json`, `apps/web/package.json`, `apps/api/requirements.txt` y paquetes en `packages/**`.

2. **Introspeccion de base de datos**
   - Usa `mcp:supabase-local` para verificar esquema, FKs, RLS, funciones y storage cuando el cambio toque datos.
   - No inventes tablas, columnas ni politicas.

3. **Fuente de verdad**
   - La documentacion canonica vive en `plotify_memori/`.
   - No recrees `apps/api/docs/` ni `apps/web/src/context/` como fuente primaria.
   - Si una nota queda obsoleta, actualizala o reemplazala por una referencia clara a la nota canonica.

4. **Notas a revisar segun impacto**
   - Arquitectura: `plotify_memori/Arquitectura General.md`.
   - Base de datos: `plotify_memori/Schema General BD.md` y notas de tablas relacionadas.
   - Backend/IA: `plotify_memori/Core del Microservicio.md`, `plotify_memori/Workers del Microservicio.md`, `plotify_memori/Agente IA LangGraph.md`.
   - Integraciones: `plotify_memori/Integraciones Telegram WhatsApp.md`.
   - Producto: `plotify_memori/Vision y Alcance.md`, `plotify_memori/PRD - Cierre Plotify Piloto Clientes.md`.
   - Setup y contribucion: `plotify_memori/Setup Local.md`, `plotify_memori/Convenciones de Codigo.md`.

5. **Cierre**
   - Lista los `.md` modificados.
   - Resume la informacion clave que se agrego o corrigio.
   - Termina con: **"Actualizado todo jefé"**
