---
title: Hoja de Ruta - Cierre Plotify Piloto Clientes
date: 2026-04-14
tags:
  - roadmap
  - producto
  - piloto
  - documentos
  - ventas
status: draft
---

# Hoja de Ruta - Cierre Plotify Piloto Clientes

> [!summary]
> La prioridad es arquitectura primero para trabajar sobre seguro, luego documentos y venta asistida por Telegram. El objetivo no es una demo: es un producto para usuarios reales en piloto.

## Estrategia

Orden recomendado:

1. Estabilizar fundamentos: DB, contratos, monorepo y seguridad.
2. Cerrar flujo comercial: parcelacion, reserva, venta y aprobacion.
3. Cerrar documentos legales V1: reserva primero, escritura despues.
4. Llevar Telegram al centro operacional.
5. Pulir UX responsive y preparar piloto real.

## Fase 0 - Congelar verdad tecnica

Estimado: 3 a 5 dias.

Funcionalidad entregada:

- Entorno reproducible desde migraciones.
- Contratos claros entre Next.js, FastAPI y Supabase.
- Base para migrar a monorepo sin arrastrar drift.

Entregables:

- Baseline Supabase en `packages/database/supabase/migrations`.
- Tipos TS generados desde Supabase.
- OpenAPI exportado desde FastAPI.
- Cliente frontend tipado desde OpenAPI.
- Comandos de test/build documentados.

Criterios de aceptacion:

- Un entorno limpio puede recrear tablas, buckets y funciones necesarias.
- La DB local no depende de migraciones invisibles.
- Los endpoints criticos tienen contrato request/response validado.

## Fase 1 - Monorepo operativo

Estimado: 3 a 6 dias.

Funcionalidad entregada:

- Workspace unico para trabajar sin perder separacion de responsabilidades.

Estructura objetivo:

```text
apps/web              Next.js
apps/api              FastAPI/LangGraph Python
packages/database     Supabase migrations, types, seeds
packages/ui           UI compartida si aplica
packages/contracts    OpenAPI/generated clients si aplica
```

Decision clave:

- Mantener LangGraph en Python para V1. El costo de migrarlo a TypeScript ahora es mayor que el beneficio. Python ya contiene el motor de documentos, workers, Telegram y tests funcionales.

Criterios de aceptacion:

- `pnpm install` instala workspace JS.
- `apps/api` mantiene entorno Python propio documentado.
- No se rompen comandos actuales.
- Supabase vive en una ubicacion canonica.

## Fase 2 - Flujo comercial minimo completo

Estimado: 1 a 2 semanas.

Funcionalidad entregada:

- Admin puede gestionar parcelacion.
- Vendedor puede solicitar reserva/venta.
- Admin puede aprobar/rechazar.
- Historial del lote refleja eventos reales.

Incluye:

- Validacion de lote/deslindes/servidumbre antes de documentos.
- Formulario vendedor para comprador.
- Estados claros de lote: disponible, reservado, vendido, liberado.
- Audit logs para precio, reserva, venta y documentos.

Criterios de aceptacion:

- Un vendedor solicita reserva desde la plataforma.
- Admin aprueba por Telegram.
- Lote queda reservado con historial.
- Admin puede liberar una reserva.
- Venta puede aprobarse y dejar lote vendido.

## Fase 3 - Documentos de reserva V1

Estimado: 1 a 2 semanas.

Funcionalidad entregada:

- Reserva generada en PDF y DOCX desde plantilla del proyecto.

Incluye:

- Template unico activo de reserva por proyecto.
- Bloques editables por admin.
- Variables canonicas anidadas.
- Preview con advertencias de variables faltantes.
- Snapshot JSON de variables.
- Versionado de documento generado.
- Envio a vendedor y opcionalmente comprador.

Criterios de aceptacion:

- Admin configura template de reserva.
- Sistema detecta variables faltantes.
- Admin decide bloquear o generar con lineas en blanco.
- PDF y DOCX se generan y quedan trazados.
- Telegram presenta documento al admin antes de envio final.

## Fase 4 - Escritura V1

Estimado: 2 a 4 semanas.

Funcionalidad entregada:

- Escritura lista para revision de abogado/notaria, generada desde datos del proyecto.

Incluye:

- Bloques base globales de Plotify.
- Bloques personalizados por organizacion.
- Template unico activo de escritura por proyecto.
- Datos desde dominio vigente, roles, SAG, plano y motor geometrico.
- Flujo de validacion administrativa antes de generar.

Criterios de aceptacion:

- Admin/abogado puede adaptar template de escritura.
- Sistema genera escritura PDF y DOCX con variables reales.
- Variables faltantes quedan claramente marcadas.
- Regeneracion crea version 2 y conserva version 1 en historial.

## Fase 5 - UX responsive y piloto

Estimado: 1 a 2 semanas.

Funcionalidad entregada:

- Experiencia usable en movil para revision y aprobacion.
- Constructor de documentos mas manejable.
- Piloto listo con usuarios reales.

Incluye:

- Bloques a la izquierda y preview a la derecha en desktop.
- Modo movil por pestañas o pasos.
- Estados vacios y errores entendibles.
- Panel de historial por lote.
- Guia de uso para admin y vendedor.

Criterios de aceptacion:

- Admin puede aprobar desde movil.
- Vendedor puede operar desde movil.
- Constructor no depende de pantallas grandes.
- Primer cliente piloto puede completar flujo con acompañamiento minimo.

## Fase 6 - Segunda prioridad

Estimado: posterior al piloto.

Incluye:

- Prompt Ops estable.
- Admin Intelligence ampliado.
- WhatsApp como canal adicional.
- MCP ampliado con allowlist y conectores productivos.
- Firma electronica o integraciones legales externas.

## Riesgos principales

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| Drift de migraciones | Alto | Baseline antes de monorepo |
| Variables documentales inconsistentes | Alto | Contrato canonico anidado |
| Service role sin tenant check | Alto | Validacion backend obligatoria |
| UX documental dificil en movil | Medio | Redisenar builder responsive antes del piloto |
| Telegram con demasiada logica no auditada | Medio | Registrar cada decision en audit logs |

## Relacionado

- [[PRD - Cierre Plotify Piloto Clientes]]
- [[Backlog Implementable - Cierre Plotify]]
- [[Matriz de Decisiones Pendientes]]
- [[ADR-001 - Adoptar Monorepo pnpm]]
- [[ADR-002 - Supabase Migrations como Fuente Unica]]



## Actualizacion Fase 0 - 2026-04-14

Ver [[Implementacion Punto 1 - Congelar DB Supabase]].

Estado: el entregable Baseline Supabase en packages/database/supabase/migrations queda completado y validado. La DB local ya no depende de migraciones invisibles para reconstruir el schema aceptado.

Pendientes restantes de Fase 0:

- Formalizar OpenAPI exportado desde FastAPI.
- Generar cliente frontend tipado desde OpenAPI.
- Documentar comandos de test/build finales para el monorepo.

Actualizacion 2026-04-15: tipos TS desde la DB congelada completados en `packages/database/types/database.generated.ts`; `apps/web/src/types/supabase.ts` reexporta esa fuente canonica.

## Actualizacion Fase 1 - 2026-04-15

Ver [[Implementacion Punto 3 - Monorepo pnpm]].

Estado: monorepo pnpm completado. La raiz contiene `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml` y comandos canonicos. Las apps viven en `apps/web` y `apps/api`; `packages/database` y `packages/contracts` se mantienen como carpetas compartidas.

Verificado:

- `pnpm install`
- `pnpm contracts:generate`
- `pnpm verify:migrations`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm test:api`
