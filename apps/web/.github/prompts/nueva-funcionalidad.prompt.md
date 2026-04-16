---
description: Planificación de nuevas funcionalidades basadas en contexto real
agent: agent
---

Actúa como Lead Architect de Plotify. Quiero implementar: ${input:INPUT:Describe la funcionalidad que deseas implementar}.

**Instrucciones de Contexto:**
1. **Lectura Obligatoria**: Lee todos los archivos en la carpeta `context/` para entender la arquitectura actual, el modelo de datos (especialmente la relación lotes/fichas) y las reglas de negocio.
2. **Consulta de Datos**: Usa el **mcp supabase-local** para inspeccionar las tablas y políticas RLS actuales antes de proponer cambios.
3. **Skills**: Revisa `.github/skills/` y selecciona las que faciliten la implementación.

**Entregables del Plan:**
- **Base de Datos**: Cambios necesarios en `lots` o `lot_records`.
- **Servicios**: Definición de lógica en `src/lib/services`.
- **API & UI**: Endpoints y componentes de **shadcn/ui** (especifica si son Client o Server Components).
- **Validación**: Consulta **mcp context7** para asegurar que el plan sigue las mejores prácticas de Next.js 16 y React 19.

IMPORTANTE: Dame solo la estructura y lógica primero. No escribas el código completo hasta que apruebe el plan.
