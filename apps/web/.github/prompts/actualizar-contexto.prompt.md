---
description: Sincronización y actualización de la documentación técnica en plotify_memori/
agent: agent
---

Actúa como Technical Writer y Arquitecto de Software. Tu tarea es asegurar que la documentación en `plotify_memori/` sea un reflejo exacto y actualizado del estado del proyecto.

**Pasos de Ejecución:**
1. **Auditoría de Cambios**:
   - Analiza el historial de la conversación, el código generado y los archivos modificados.
   - **Obligatorio**: Usa el **mcp supabase-local** para verificar el esquema actual (tablas, columnas, FKs y RLS) y compararlo con `plotify_memori/Schema General BD.md`.
2. **Revisión de la "Fuente de Verdad"**:
   - Lee las notas existentes en `plotify_memori/` para identificar qué secciones han quedado obsoletas.
3. **Actualización por Módulos**:
   - **Base de Datos**: Si hay cambios en tablas o políticas, actualiza `plotify_memori/Schema General BD.md` y la nota de tablas pertinente.
   - **Arquitectura**: Si hay nuevos servicios, carpetas o cambios en el flujo de datos, actualiza `plotify_memori/Arquitectura General.md`.
   - **Reglas de Negocio**: Si el comportamiento del producto cambió (ej. cómo se manejan los estados de los lotes), actualiza `plotify_memori/Vision y Alcance.md` o `plotify_memori/PRD - Cierre Plotify Piloto Clientes.md`.
   - **Otros**: Si el cambio no encaja, actualiza la nota pertinente en `plotify_memori/` o crea una nueva siguiendo el estilo visual y estructural de las anteriores.
4. **Consistencia**: Mantén el formato Markdown, las tablas y los diagramas de texto que los archivos ya poseen.

Una vez que hayas generado el contenido actualizado de cada archivo necesario, termina con el mensaje:
**"Actualizado todo jefé"**
