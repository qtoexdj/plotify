---
trigger: always_on
---

# Plotify Core & Design Rules

## Respuestas
- **Responde siempre en ESPAÑOL.**

## Fuentes de Verdad
- **Constitución SDD:** `.specify/memory/constitution.md` manda sobre decisiones de ingeniería del MVP.
- **Artefactos SDD activos:** usa `specs/009-titulo-dominio-vigente/spec.md`, `plan.md`, `agent-execution.md`, `tasks.md`, `research.md`, `data-model.md`, `contracts/` y `quickstart.md`.
- **Memoria curada:** usa `plotify_memori/` como memoria oficial de producto y arquitectura.
- **No usar como fuente:** ignora `plotify_memori/.obsidian/` para decisiones de producto.
- **Código real:** contrasta siempre contra el repo real antes de implementar; usa CodeGraph para estructura, símbolos, impacto y flujos.

## Flujo SDD de Implementación
- Antes de implementar, ejecuta o solicita `$speckit-analyze` si cambiaron constitution, spec, plan o tasks.
- No implementes si quedan hallazgos `CRITICAL` sin resolver.
- Antes de implementar una tarea del SDD 009, lee `specs/009-titulo-dominio-vigente/agent-execution.md`.
- Antes de cada tarea: revisa `git status --short` y sincroniza CodeGraph con `codegraph sync .`.
- Implementa **una sola tarea pendiente** de `specs/009-titulo-dominio-vigente/tasks.md` por ciclo.
- No avances a otra tarea salvo instrucción explícita del usuario.
- Ejecuta el comando `Verify` indicado por la tarea.
- Marca la tarea como completada (`[x]`) solo si cumple Acceptance y Verify pasa, o si el usuario acepta explícitamente dejarla sin verificación.
- Si una tarea está demasiado grande, divídela en subtareas dentro del mismo archivo antes de tocar código.
- Si la tarea toca web/frontend, ejecuta antes de cerrar: `pnpm --filter web lint`, luego `pnpm format:check`, y después `pnpm build:web`.

Prompt recomendado en Codex:

```text
$speckit-implement

Implementa solo TXXX de specs/009-titulo-dominio-vigente/tasks.md.
No avances a otra tarea.
Lee specs/009-titulo-dominio-vigente/agent-execution.md.
Usa CodeGraph para impacto.
Usa Context7 si toca librerías externas.
Ejecuta el Verify de la tarea.
Marca la tarea como completada solo si pasa.
```

Para Antigravity, aplica el mismo protocolo usando la skill/comando equivalente de Spec Kit si está instalada. Si Antigravity no reconoce `$speckit-*`, usa `tasks.md` como checklist operativo y mantén la regla de una tarea por ciclo.

## 🎨 Estándar Visual (shadcn/ui)
- **Framework de UI:** Es obligatorio usar **shadcn/ui** para todos los componentes de interfaz.
- **Consistencia:** Antes de crear un componente nuevo, verifica si existe una primitiva en `@/components/ui`.
- **Estilos:** Usa **Tailwind CSS 4** siguiendo la configuración de variables definidas en el proyecto.
- **Iconografía:** Prioriza el uso de la librería de iconos configurada en `components.json` (Hugeicons).

## 🧠 Inteligencia y Skills
- **Skills Locales:** Antes de realizar una tarea compleja, revisa si existe una skill aplicable en `.agents/skills`.
- **Uso de Skills:** Si existe una skill que se adecue al requerimiento, úsala como base o herramienta principal.
- **CodeGraph:** Para preguntas estructurales del repo usa CodeGraph antes de grep/manual reading: símbolos, callers/callees, impacto y flujos.
- **Context7/ctx7:** Úsalo solo cuando la tarea toque documentación actual de librerías, frameworks, SDKs, CLIs, APIs o servicios cloud. Primero resuelve la librería y luego trae docs. No lo uses para lógica de negocio, refactors, revisión de código o archivos locales.
- **shadcn:** Antes de crear diseño o componentes nuevos, usa las herramientas/docs disponibles de shadcn si están instaladas; si no, sigue los patrones existentes en `@/components/ui`.

## 🚫 Restricciones de Arquitectura
- Mantener la separación de capas definida en `plotify_memori/Arquitectura General.md`.
- Todo nuevo componente debe ser **Server Component** por defecto, a menos que la interactividad de shadcn/ui requiera un Client Component.
- **Validación de Archivos:** Toda subida de archivos hacia el Storage u otro servicio externo **DEBE** incluir una validación estricta de MIME-type del lado del servidor (Server-Side) leyendo los "Magic Bytes" mediante la librería `file-type`. Nunca subas archivos directamente desde el cliente sin pasar por un endpoint seguro de Next.js que realice esta validación primaria.

## Contratos y Migraciones
- OpenAPI se genera desde FastAPI/Pydantic. No edites `packages/contracts/openapi/plotify-chat.v1.json` manualmente como fuente de verdad.
- Para cambiar un contrato API: edita endpoints/schemas en `apps/api`, ejecuta `pnpm contracts:generate` y actualiza el cliente generado.
- Toda migración Supabase debe vivir exclusivamente en `packages/database/supabase/migrations`.
- Después de cambios de DB ejecuta `pnpm verify:migrations` y regenera tipos si la tarea lo pide.

## Gates de Calidad
- Cambios web/frontend: `pnpm --filter web lint` -> `pnpm format:check` -> `pnpm build:web`.
- Cambios de tipos, contratos o clientes generados: agrega `pnpm typecheck:web`.
- Cambios API/FastAPI/workers: ejecuta `pnpm test:api`.
- Cambios DB/migraciones: ejecuta `pnpm verify:migrations`.
- Si un gate no puede ejecutarse, reporta el motivo y no marques la tarea como completada salvo aprobación explícita del usuario.
