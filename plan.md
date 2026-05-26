# Plan Agent-Agnostic: CodeGraph + Spec Kit + plotify_memori + Context7

## Resumen

El objetivo es instalar el flujo sin asumir agente: CodeGraph indexa el repo, Spec Kit crea el SDD, `plotify_memori/` actúa como memoria oficial de producto/arquitectura, y Context7 se usa solo cuando el SDD toque librerías o SDKs actuales.

Estado local confirmado: existe `plotify_memori/` y `.agents/`; no existen `.codegraph` ni `.specify`.

Fuentes revisadas: [github/spec-kit](https://github.com/github/spec-kit), [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph/), Context7 `/github/spec-kit`, Context7 `/colbymchenry/codegraph`.

## Paso 1: Checkpoint

```bash
cd /Users/matiasburgos/Developer/plotify
git status --short
git switch -c chore/spec-kit-codegraph-bootstrap
```

Si la rama ya existe:

```bash
git switch chore/spec-kit-codegraph-bootstrap
```

## Paso 2: Instalar e inicializar CodeGraph

CodeGraph documenta instalación vía `npx`, luego uso del comando `codegraph`.

```bash
cd /Users/matiasburgos/Developer/plotify
npx @colbymchenry/codegraph
```

Inicializar e indexar el repo:

```bash
codegraph init . --index
codegraph status .
```

Validar que entiende la estructura:

```bash
codegraph files . --max-depth 3
codegraph context "Understand Plotify architecture: Next.js frontend, FastAPI LangGraph backend, Supabase database, OpenAPI contracts, document generation, Telegram workflow"
```

Comandos útiles durante el proyecto:

```bash
codegraph sync .
codegraph status .
codegraph query "reservation"
codegraph context "Plotify MVP gap analysis against product memory"
codegraph affected apps/web/src apps/api packages/database
```

Para MCP, no se asume agente. La configuración que debe recibir cualquier agente compatible es:

```text
MCP server name: codegraph
MCP command: codegraph
MCP args: serve --mcp
```

Comando manual para verificar que el servidor arranca:

```bash
codegraph serve --mcp
```

## Paso 3: Instalar/verificar Spec Kit

Spec Kit recomienda instalación desde GitHub con `uv`, no paquetes PyPI con nombres parecidos.

Verificar `uv`:

```bash
uv --version
```

Opción persistente recomendada:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
specify version
specify integration list
```

Opción sin instalación persistente:

```bash
uvx --from git+https://github.com/github/spec-kit.git specify version
uvx --from git+https://github.com/github/spec-kit.git specify integration list
```

## Paso 4: Elegir agente sin asumirlo

Tú eliges el agente desde la lista real:

```bash
specify integration list
```

Guardar tu elección en variable:

```bash
export SPEC_AGENT="<agent-from-specify-integration-list>"
export SPEC_AGENT_OPTIONS=""
```

Ejemplos de valores posibles según docs actuales: `copilot`, `claude`, `gemini`, `codex`, `codebuddy`, `pi`.

Si el agente elegido requiere opciones, completar `SPEC_AGENT_OPTIONS`. Si no requiere, dejar vacío.

## Paso 5: Inicializar Spec Kit en este repo

Como el repo ya existe y no está vacío:

```bash
cd /Users/matiasburgos/Developer/plotify
specify init --here --force --integration "$SPEC_AGENT" --script sh
```

Si necesitas opciones específicas del agente:

```bash
specify init --here --force --integration "$SPEC_AGENT" --integration-options="$SPEC_AGENT_OPTIONS" --script sh
```

Verificar resultado:

```bash
find .specify -maxdepth 3 -type f | sort
git status --short .specify .agents AGENTS.md
```

## Paso 6: Declarar `plotify_memori/` como memoria oficial

No hay que exportar Obsidian: el vault ya está en el repo.

Abrirlo si quieres revisarlo visualmente:

```bash
obsidian "obsidian://open?path=/Users/matiasburgos/Developer/plotify/plotify_memori"
```

Notas base para el SDD:

```bash
sed -n '1,220p' 'plotify_memori/00 - Home.md'
sed -n '1,220p' 'plotify_memori/20 - Producto & Proyectos/Vision y Alcance.md'
sed -n '1,260p' 'plotify_memori/20 - Producto & Proyectos/PRD - Cierre Plotify Piloto Clientes.md'
sed -n '1,260p' 'plotify_memori/60 - Referencias & Soporte/Backlog Implementable - Cierre Plotify.md'
sed -n '1,220p' 'plotify_memori/60 - Referencias & Soporte/Riesgos y Brechas Tecnicas.md'
sed -n '1,220p' 'plotify_memori/60 - Referencias & Soporte/Matriz de Decisiones Pendientes.md'
```

Regla para el agente:

```text
Usa plotify_memori/ como memoria oficial curada de Plotify.
No uses plotify_memori/.obsidian como fuente de producto.
Contrasta la memoria contra el código real usando CodeGraph antes de generar plan o tareas.
```

## Paso 7: Ejecutar el flujo SDD

Usa los comandos que tu agente instale. Spec Kit documenta estos nombres base:

```text
speckit.constitution
speckit.specify
speckit.clarify
speckit.plan
speckit.tasks
speckit.analyze
speckit.implement
```

Prompt para constitution:

```text
Crea o actualiza la constitution de Plotify. Antes de escribir, revisa plotify_memori/ y hazme preguntas para cerrar principios de producto, calidad, seguridad, testing, UX y límites. No implementes código.
```

Prompt para spec:

```text
Crea la spec 001-stabilize-plotify-mvp. Usa plotify_memori/ como memoria oficial y CodeGraph para revisar el código actual. Primero entrevístame para cerrar MVP, usuarios, flujos críticos, fuera de alcance y criterios de éxito.
```

Prompt para clarify:

```text
Detecta ambigüedades entre mi idea, plotify_memori/ y el código real. Haz preguntas concretas antes de planificar.
```

Prompt para plan:

```text
Genera el plan técnico para terminar el MVP. Usa CodeGraph para impacto y estructura real. Usa Context7 para documentación actual de librerías tocadas. No inventes APIs ni esquemas sin verificar el repo.
```

Prompt para tasks:

```text
Divide el plan en tareas pequeñas, ordenadas por dependencia, con aceptación y comando de verificación por tarea.
```

Prompt para analyze:

```text
Revisa constitution, spec, plan y tasks. Marca contradicciones, huecos, tareas demasiado grandes y riesgos no cubiertos.
```

## Paso 8: Context7 dentro del SDD

Antes de planear o implementar con una librería concreta:

```bash
npx ctx7@latest library "Next.js" "Plotify MVP stabilization with Next.js App Router"
npx ctx7@latest docs <library-id> "Next.js App Router route handlers server actions caching typegen build"
```

Repetir solo cuando aplique:

```bash
npx ctx7@latest library "React" "React 19 forms effects state frontend architecture"
npx ctx7@latest library "Supabase" "Supabase SSR auth migrations RLS PostgreSQL generated types"
npx ctx7@latest library "FastAPI" "FastAPI OpenAPI endpoints testing pydantic"
npx ctx7@latest library "LangGraph" "LangGraph FastAPI agent workflow workers persistence"
npx ctx7@latest library "Tailwind CSS" "Tailwind CSS v4 Next.js design system"
```

Regla: Context7 para documentación de librerías/SDKs/CLI/cloud. CodeGraph para código propio. `plotify_memori/` para intención, decisiones y producto.

## Paso 9: Implementación controlada

Antes de cada tarea:

```bash
git status --short
codegraph sync .
```

Pedir al agente:

```text
Implementa solo la siguiente tarea de .specify/specs/001-stabilize-plotify-mvp/tasks.md. Usa CodeGraph para impacto. Usa Context7 si toca librerías externas. No avances a otra tarea.
```

Verificaciones base:

```bash
pnpm typecheck:web
pnpm test:web
pnpm build:web
pnpm test:api
pnpm verify:migrations
```

Después de cada tarea:

```bash
codegraph sync .
git status --short
```

## Supuestos

- Tú eliges el agente con `specify integration list`; el plan no fija uno.
- `plotify_memori/` es la memoria oficial de Obsidian ya curada.
- `.obsidian/` no se usa como fuente de SDD.
- CodeGraph se usa para entender código real e impacto.
- Spec Kit gobierna el proceso SDD.
- Context7 se usa bajo demanda para documentación actual, no para lógica de negocio.
