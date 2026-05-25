---
title: Revision Integral 2026-04-14
date: 2026-04-14
tags:
  - revision
  - arquitectura
  - decisiones
  - frontend
  - backend
  - db
status: draft
---

# Revision Integral 2026-04-14

> [!summary]
> Plotify esta compuesto por dos aplicaciones independientes que se complementan sobre una misma base Supabase: `plotify/` como producto web Next.js y `plotify_chat/` como motor FastAPI/LangGraph. La documentacion existente en [[00 - Home]] cubre muchos modulos, pero las decisiones pendientes estan principalmente en los contratos entre ambos sistemas.

## Alcance revisado

- `plotify/`: app web Next.js 16 + React 19, Supabase SSR, Server Actions, API Routes, dashboard, onboarding, geometria, documentos, Prompt Ops y skills del agente.
- `plotify_chat/`: microservicio Python 3.13 + FastAPI, LangGraph, Redis/arq, webhooks WhatsApp/Telegram, generacion documental, Prompt Ops backend, MCP gateway y workers.
- `plotify_memori/`: vault Obsidian con documentacion actual del proyecto.
- `supabase/migrations` en ambos codigos: el esquema esta repartido entre migraciones del frontend y del microservicio.
- Planes raiz: `auditoria-tecnica.md`, `plan-frontend.md`, `plan-microservicio.md`, `plan-fase4-documentos.md`, `roadmap-v2.md`.

## Estado del repositorio

- La raiz `/Users/matiasburgos/Desktop/SaaS/antigravity/plotify` no es un repo git.
- `plotify/` si es repo git, rama `main`, con cambios sin commit en UI, documentos, servicios, tipos, tests y migraciones.
- `plotify_chat/` si es repo git, rama `feature/fase-4-5-6-7`, con un archivo nuevo `scripts/dev-only/test_cli.py`.
- `plotify_memori/` es el vault Obsidian activo.

## Lectura del sistema

### Producto web

`plotify/` concentra la experiencia principal: proyectos, lotes, vendedores, operaciones, onboarding geoespacial, documentos legales, super-admin y configuracion del agente. Usa Supabase como backend primario y delega capacidades asincronas o de IA al microservicio mediante `src/lib/services/microservice.client.ts`.

### Motor de mensajeria e IA

`plotify_chat/` opera como backend especializado: recibe webhooks, procesa mensajes con workers arq, compila grafos LangGraph por organizacion/rol, consulta Supabase con service role, entrega respuestas por Meta o Telegram y genera documentos PDF/DOCX.

### Contrato compartido

La base de datos es el contrato mas fuerte entre ambos codigos. Hay tablas core de negocio, tablas de agente, Prompt Ops, documentos, MCP, leads, payment info y DLQ. Esto permite integracion rapida, pero sube el riesgo de drift si no hay un dueno unico del esquema.

## Verificacion ejecutada

- `npm test` en `plotify/`: 22 archivos pasaron y 1 suite fallo. Resultado: 439 tests pasados, 4 omitidos, 1 suite fallida.
- Falla frontend: `tests/fase3-components.test.ts` no mockea `File02Icon`, nuevo import de `src/components/app-sidebar.tsx`.
- `pytest` global en `plotify_chat/`: fallo por `ModuleNotFoundError` porque el proyecto no configura import path por defecto.
- `PYTHONPATH=. ./venv/bin/pytest` en `plotify_chat/`: 70 pasados, 2 omitidos.

Actualizacion 2026-04-15:

- Gate frontend corregido: `File02Icon` agregado al mock de `@hugeicons/core-free-icons`; `npm test -- --run` pasa con 23 archivos y 443 tests.
- Gate backend corregido: `pytest.ini` configura `pythonpath = .`; `./venv/bin/pytest -q` pasa sin `PYTHONPATH` con 70 tests pasados y 2 omitidos.

## Hallazgos principales

### 1. Los dos codigos se complementan, pero el contrato HTTP no esta estable

El frontend llama al microservicio con `X-Internal-Secret`, pero varios endpoints nuevos tienen rutas, metodos o headers distintos entre implementacion y consumo. Ver [[Riesgos y Brechas Tecnicas#Contratos frontend-backend]].

### 2. El esquema Supabase esta dividido entre dos carpetas de migraciones

`plotify/supabase/migrations` define el core, RLS, documentos, prompts y skills. `plotify_chat/supabase/migrations` agrega `leads`, `organization_payment_info` y `dead_letter_queue`. Esto debe tener una decision explicita: fuente unica o reglas de ownership.

### 3. Documentos legales tienen dos modelos de variables

El wizard del frontend construye preview local con `EscrituraVariables`, mientras el microservicio genera desde Jinja2 plano con variables como `numero_lote`, `proyecto_comuna`, `cliente_nombre`. Hay riesgo de que el preview no represente lo que se genera finalmente.

### 4. Prompt Ops parece incompleto en el puente UI/API

Las pantallas de super-admin usan rutas internas `/api/prompt-ops/...`, pero no hay route handlers bajo `src/app/api/prompt-ops`. Ademas, el cliente de microservicio envia `Authorization: Bearer`, mientras FastAPI espera `X-User-Id` para super-admin.

### 5. La arquitectura de operaciones criticas todavia mezcla RPC atomicas y mutaciones multi-step

Reservas/ventas usan RPC (`reserve_lot`, `direct_sale_lot`) con locking. En cambio, geometria, asignaciones, documentos y algunos flujos de onboarding usan varias operaciones Supabase desde TypeScript. Esa diferencia debe volverse una regla de arquitectura.

## Recomendacion de direccion

La decision mas importante no es "frontend vs backend", sino "cual es el contrato estable". Para poder decidir con bajo riesgo:

- Definir Supabase migrations como fuente unica de verdad.
- Generar o mantener un contrato API para `plotify_chat`.
- Crear una tabla de compatibilidad por feature: UI, API, DB, tests, ownership.
- Convertir las operaciones multi-step con impacto legal/comercial a RPC o endpoint transaccional.
- Tratar documentos y Prompt Ops como integraciones prioritarias antes de seguir agregando superficie.

## Notas relacionadas

- [[Mapa de Integracion Frontend Backend]]
- [[Riesgos y Brechas Tecnicas]]
- [[Matriz de Decisiones Pendientes]]
- [[Arquitectura General]]
- [[Comunicacion entre Servicios]]
- [[Schema General BD]]
- [[Generacion de Documentos]]
- [[Agente IA LangGraph]]
