---
description: Proceso sistemático para validar, commitear y subir cambios de código a GitHub
agent: agent
---

Actúa como Senior Release Engineer de Plotify. Tu objetivo es subir los cambios del código: ${input:INPUT:Describe los cambios que deseas subir}.

**FASE 1: Control de Calidad Pre-Commit (Gating)**
Antes de cualquier acción en Git, es obligatorio asegurar la estabilidad del proyecto:
1. **Linting**: Ejecuta `npm run lint` para asegurar que no hay errores de estilo.
2. **Type Check**: Ejecuta `npx tsc --noEmit` para validar la integridad de TypeScript.
3. **Tests**: Ejecuta `npm test` para asegurar que los cambios no introdujeron regresiones.
4. **Build Check**: Ejecuta `npm run build` para confirmar que el proyecto compila correctamente.

**FASE 2: Sincronización y Estándares**
1. **Actualización Local**: Ejecuta `git pull origin [rama_activa]` para evitar conflictos de integración.

**FASE 3: Preparación del Commit**
1. **Naming de Rama**: Si estás en una rama nueva, asegúrate de que siga la convención: `feature/*`, `fix/*` o `refactor/*`.
2. **Mensaje de Commit**: Genera un mensaje siguiendo los estándares de Plotify:
   - **Formato**: `<tipo>: <descripción en español>` (ej. `feat: implementación de buscador de lotes`).
   - **Tipos permitidos**: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
   - El mensaje debe ser breve pero descriptivo.

**FASE 4: Publicación**
1. **Staging**: Ejecuta `git add .` (asegurando que el `.gitignore` proteja los secrets de Supabase).
2. **Commit & Push**: Realiza el commit y sube los cambios a la rama correspondiente en GitHub.

**IMPORTANTE**: No realices el push si alguna de las pruebas de la FASE 1 falla y antes de hacer cambios di los errores que encontraste.
