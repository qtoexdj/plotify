# Convenciones de Codigo

**Tag:** #guia #frontend
**Relacionado:** [[00 - Home]], [[Estructura de Carpetas Frontend]], [[Como Agregar un Feature]]

---

## TypeScript

- Modo `strict` habilitado.
- Path alias `@/*` apunta a `src/*`.
- No usar `any`. Usar `unknown` + type guard si es necesario.
- Tipos de DB generados por Supabase CLI (`database.types.ts`).
- No modificar manualmente los tipos generados.

## Nomenclatura

| Elemento | Convencion | Ejemplo |
|----------|-----------|--------|
| Componentes | PascalCase | ProjectDetail.tsx |
| Funciones | camelCase | calculateServidumbre() |
| Archivos de componente | kebab-case o PascalCase | project-detail.tsx |
| Services | kebab-case + `.service.ts` | lots.service.ts |
| Actions | kebab-case + `.action.ts` | reserve-lot.action.ts |
| Variables/constantes | camelCase | ESCRITURA_ARTICLES |
| Enums | snake_case en DB, PascalCase en TS | estado_lote / EstadoLote |
| Tipos TS | PascalCase | EscrituraVariables |

## Estructura de archivos

- Un componente por archivo.
- Server Components por defecto.
- Usar `"use client"` solo cuando se necesita: eventos, state, hooks, refs.
- Imports ordenados: externos primero, internos despues.

## Validacion

- Toda entrada de usuario se valida con **Zod** antes de procesar.
- Server Actions validan input al inicio.
- API routes validan antes de llamar al servicio.

## Servicios

- Nunca llamar `supabase.from()` directamente desde un componente.
- Siempre usar los service files.
- Servicios retornan datos tipados o lanzan error.

## Logging

- Usar Pino logger (`src/lib/logger.ts`).
- No usar `console.log` en produccion.
- Logs estructurados con nivel, contexto, y datos relevantes.

## Estilos

- Tailwind CSS v4.
- Componentes shadcn/ui como base.
- No crear CSS custom sin necesidad justificada.
- Usar `class-variance-authority` para variantes de componentes.

## Linting

```bash
npm run lint  # ESLint 9 con Next.js + TypeScript
```

## Relacionado
- [[Como Agregar un Feature]] — Checklist paso a paso
- [[Testing Frontend]] — Convenciones de testing
