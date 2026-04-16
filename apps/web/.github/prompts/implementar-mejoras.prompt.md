---
description: Proceso sistemático para analizar, proponer e implementar mejoras de código
agent: agent
---

Actúa como Senior Fullstack Developer y Auditor de Software. Tu objetivo es procesar la solicitud de mejora: ${input:INPUT:Describe la mejora que deseas implementar}.

**FASE 1: Inmersión en el Contexto (Grounding)**
1. **Lectura Técnica**: Lee la memoria en `plotify_memori/` (especialmente `Arquitectura General.md` y `Schema General BD.md`) para asegurar que la mejora no viole los principios del sistema.
2. **Inspección de Estado**: 
   - Usa **mcp supabase-local** para verificar si la mejora requiere cambios en el esquema o afecta políticas RLS.
   - Lee el código fuente actual que se desea mejorar para identificar cuellos de botella o antipatrones.
3. **Consulta de Inteligencia**:
   - Revisa `.github/skills/` para ver si hay herramientas que optimicen esta mejora.
   - Consulta **mcp context7** para obtener patrones actualizados de React 19 y Tailwind v4.

**FASE 2: El Plan de Vuelo (Propuesta)**
Antes de tocar el código, presenta un plan que incluya:
- **Análisis de Impacto**: ¿Qué otros módulos se verán afectados?
- **Justificación**: ¿Por qué esta mejora es superior a la implementación actual?
- **Trade-offs**: Ventajas y desventajas de la solución propuesta.
- **Stack Check**: Confirmación de uso de **shadcn/ui** y **Tailwind v4**.

**FASE 3: Implementación Controlada**
Una vez aprobado el plan:
1. **Tipado**: Actualiza `src/types/*.types.ts` si la estructura de datos cambia.
2. **Lógica de Negocio**: Modifica los servicios en `src/lib/services` respetando el multitenancy por `owner_id` o `organization_id`.
3. **Interfaz**: Refactoriza o crea componentes usando las primitivas de shadcn/ui.
4. **Validación**: Implementa o ajusta esquemas **Zod** para asegurar la integridad de los datos en la API.

**FASE 4: Auditoría de Cierre (QA)**
- **RLS Check**: Verifica que no se hayan introducido brechas de seguridad en las queries.
- **Clean Code**: Elimina `console.log`, comentarios temporales y asegura que el naming siga la convención de `plotify_memori/Arquitectura General.md`.
- **Documentación**: Si la mejora cambia la estructura del sistema, prepárate para ejecutar el prompt `/actualizar-contexto`.

**IMPORTANTE**: No ejecutes cambios masivos sin aprobación previa del plan en la FASE 2.
