# Flujo de Contexto, SDD y Obsidian

## Propósito

Plotify usa tres capas: [AGENTS.md](../../AGENTS.md) para reglas permanentes, [memory.md](../../memory.md) para contexto operativo corto y este vault para documentación profunda e histórica navegable en Obsidian.

## Antes de trabajar

1. Leer `AGENTS.md` y `memory.md`.
2. Identificar SDD activo y abrir sus artefactos relevantes.
3. Ejecutar `git status --short` y `codegraph sync .`.
4. Consultar sólo notas relacionadas con la tarea.
5. Usar Context7 sólo para documentación externa vigente y una skill cuando corresponda.

## Dónde documentar

- Producto: `20 - Producto & Proyectos/`.
- Arquitectura y stack: `30 - Arquitectura/`.
- Guías: `40 - Guias & Convenciones/`.
- Handoffs y evidencia SDD: `50 - Implementaciones/`.
- Riesgos y backlog: `60 - Referencias & Soporte/`.
- Decisiones de larga vida: `10 - Decisiones/`.

`.obsidian/` contiene configuración de vault, no fuente de producto.

## Cierre de SDD

Al completar tareas, Verify, análisis y gates:

1. Usar `$plotify-sdd-handoff`.
2. Crear o actualizar handoff con alcance, evidencia, riesgos, decisiones y siguiente foco.
3. Actualizar notas de producto, arquitectura y decisiones afectadas.
4. Enlazar hitos relevantes desde `00 - Home.md`.
5. Actualizar `memory.md` con estado, enlaces, correcciones verificadas y skills usadas.
6. Actualizar `AGENTS.md` sólo ante una regla permanente.
7. Ejecutar `pnpm check:agent-context` y `codegraph sync .`.

## Correcciones

Registrar una corrección del usuario como pendiente con fecha y fuente. Verificarla contra código, SDD, tests, CodeGraph o decisión explícita antes de promoverla a hecho y actualizar la nota del vault correspondiente.

## Concisión

No copiar vault completo a `memory.md` ni convertir `AGENTS.md` en documentación extensa. La memoria enlaza; el vault explica; código y pruebas demuestran.
