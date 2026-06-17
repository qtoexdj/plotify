---
title: SDD 010 Mesa de Escritura - Handoff
aliases:
  - SDD 010 Mesa de Escritura
  - Mesa de Escritura Legal
date: 2026-06-11
status: implementado tecnicamente
tags:
  - implementacion
  - sdd
  - documentos
  - escrituras
  - legal
  - ux
related:
  - "[[SDD 007 Escrituras Variable Resolution]]"
  - "[[SDD 008 Creador de Matriz - Handoff]]"
  - "[[SDD 009 Titulo Dominio Vigente]]"
  - "[[SDD 011 Venta-Escritura - Handoff]]"
  - "[[Generador de Escrituras de Compraventa]]"
  - "[[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]"
---

# SDD 010 Mesa de Escritura - Handoff

## Estado

Implementado tecnicamente en `specs/010-mesa-escritura`. SDD 010 reemplaza la
cabina tecnicista de SDD 008 por una mesa de escritura legal: documento
continuo, datos con estado y evidencia, pendientes accionables, editor
in-place, picker "Insertar dato", workflow humanizado y autoria de plantillas
sin JSON visible.

El gate humano T023 sigue pendiente: una sesion de usabilidad observada debe
validar 4/5 tareas principales sin ayuda, revision en menos de 15 minutos y la
tarea de plantillas con perfil administrador. Hasta ese gate, el feature esta
implementado y verificado tecnicamente, pero no cerrado por producto.

## Alcance implementado

- Manifiesto humanizado desde API: etiquetas, categorias, origen de datos,
  pendientes redactados y variables insertables.
- Vocabulario estatico unico en `matriz-microcopy.ts`, con test permanente de
  terminos vetados.
- Componentes nuevos bajo `apps/web/src/components/documents/mesa/`:
  preparacion, pendientes, documento continuo, chips, popover de evidencia,
  panel de datos, encabezado, indice, editor inline, picker, workflow,
  historial y plantillas.
- `/documentos/matriz/[caseId]` monta `MesaEscritura`; `/documentos/plantillas`
  monta `PlantillaEditor`; `/documentos` usa vocabulario de mesa/minutas.
- Retirada la capa vieja de produccion:
  `matriz-builder.tsx`, `matriz-view-switch.tsx`,
  `matriz-clause-editor.tsx`, `template-clause-form.tsx` y
  `template-library.tsx`.
- Quickstart A documentado en `specs/010-mesa-escritura/quickstart.md`, con
  trazabilidad a fixtures Teno, suites permanentes y build de produccion.

## Verificaciones de cierre tecnico

```bash
pnpm test:api            # 525 passed, 2 skipped
pnpm test:web            # 50 files, 670 tests
pnpm typecheck:web       # OK
pnpm --filter web lint   # OK
pnpm format:check        # OK
pnpm build:web           # OK
```

## Reglas que quedan vigentes

- El motor de SDD 008 sigue intocable: tablas, resolutor base, renderer DOCX,
  workflow y RLS no cambiaron.
- La mesa es snapshot-only. Si un dato esta mal, se corrige en el Centro de
  Control Legal y se genera un nuevo snapshot.
- OpenAPI se genera desde FastAPI/Pydantic; los JSON generados no son fuente de
  verdad.
- El usuario nunca debe ver JSON, claves crudas, estados internos ni jerga de
  API.
- Las plantillas publicadas son inmutables; toda edicion ocurre sobre borrador
  o clon.

## Pendientes para el rediseno completo del CCL

SDD 010 deja lista la mesa por caso, pero el Centro de Control Legal completo
debe evolucionar en SDD 011 y posteriores:

- Mostrar una matriz del proyecto previa a la venta, aprobada por abogado, con
  huecos de datos del lote senalizados.
- Crear el caso de escritura automaticamente al validar una venta y abrir la
  mesa del lote desde el CCL.
- Unificar en una misma superficie: documentos fuente, titulo aprobado,
  variables aprobadas, caso de escritura, estado de revision y ultima minuta.
- Reemplazar los textos heredados del CCL que todavia hablan en terminos de
  variables internas por el vocabulario de SDD 010.
- Medir SC-007 con navegador y datos reales de ambiente piloto, no solo con
  build y pruebas de fixtures.

## Continuidad en SDD 011

SDD 011 (`specs/011-venta-escritura/`) reutiliza la mesa como superficie comun
para dos niveles:

1. **Matriz del proyecto**: redactada y aprobada antes de vender lotes, con
   datos de venta como huecos claros.
2. **Borrador del lote**: creado al validar la venta, desde snapshot vigente
   de CCL + datos comerciales aprobados.

La regla de oro se mantiene: ningun flujo de venta debe saltarse la revision
legal ni generar DOCX desde un expediente no vigente.

Ver [[SDD 011 Venta-Escritura - Handoff]] para el estado tecnico del cierre
venta -> borrador -> entrega.

## Relacionado

- [[SDD 007 Escrituras Variable Resolution]]
- [[SDD 008 Creador de Matriz - Handoff]]
- [[SDD 009 Titulo Dominio Vigente]]
- [[SDD 011 Venta-Escritura - Handoff]]
- [[Generador de Escrituras de Compraventa]]
- [[ADR-009 - Generador de Escrituras como Minuta DOCX con Evidencia y Revision Legal]]
