# Quickstart: Venta a Escritura - Wireframes y Validacion

**Feature**: `011-venta-escritura`

Este quickstart registra los gates humanos y las pasadas E2E del feature. El
primer gate es T006: aprobar los wireframes antes de construir las superficies
de UI de US1, US3, US4 y US5.

## Contexto usado para T006

- `spec.md`, `plan.md`, `data-model.md`, `research.md` y `tasks.md` de
  `specs/011-venta-escritura/`.
- Memoria curada: `plotify_memori/50 - Implementaciones/SDD 010 Mesa de Escritura - Handoff.md`.
- CodeGraph sincronizado sobre el repo real.
- Superficies existentes revisadas con CodeGraph:
  - `apps/web/src/app/(dashboard)/documentos/page.tsx`
  - `apps/web/src/app/(dashboard)/documentos/matriz/[caseId]/page.tsx`
  - `apps/web/src/components/app-sidebar.tsx`
  - `apps/web/src/components/documents/mesa/mesa-escritura.tsx`
  - `apps/web/src/components/documents/mesa/mesa-documento.tsx`

Decisiones de encaje:

- Reusar la mesa SDD 010 como superficie del documento; no crear otro editor
  legal.
- Mantener `/documentos` como hub operativo, agregando selector de proyecto y
  accesos a matriz de escritura del proyecto y matriz de variables.
- Agregar la entrada "Mis documentos" como superficie de vendedor, separada de
  las herramientas de abogado/administrador.
- Mostrar siempre estados del diccionario unico: "Esperando matriz del
  proyecto", "En preparacion", "Borrador por revisar", "Aceptada" y
  "Entregada".
- Evitar jerga tecnica, claves internas, JSON visible y acciones ambiguas.

## T006 - Wireframes para aprobacion

**Estado**: aprobado por el usuario el 2026-06-16.

**Criterio de aprobacion**: el usuario debe aprobar explicitamente estos tres
wireframes antes de iniciar las tareas de UI. Frase sugerida:

```text
Apruebo T006: wireframes de matriz del proyecto, matriz de variables y mis documentos del vendedor.
```

### Wireframe 1 - Documentos por proyecto y matriz del proyecto

Perfil principal: abogado o administrador legal.

Objetivo: elegir un proyecto, abrir la matriz de escritura del proyecto, ver
que esta resuelta con datos del proyecto y que los datos de venta aparecen como
huecos `______` con nombre humano. Desde aqui tambien se accede a la matriz de
variables del proyecto ya existente en el CCL.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Sidebar                                                                      │
│                                                                              │
│ Principal                                                                    │
│   Dashboard                                                                  │
│   Proyectos                                                                  │
│                                                                              │
│ Herramientas                                                                 │
│   Agente                                                                     │
│   Leads                                                                      │
│   Vendedores                                                                 │
│   Documentos                                                                 │
│     Escrituras                                                               │
│     Historial                                                                │
│     Plantillas                                                               │
│   Mis documentos                  (visible para perfil vendedor)             │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Documentos legales                                                           │
│ Matrices, variables legales e historial documental por proyecto.             │
│                                                                              │
│ Proyecto                                                                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Teno - El Condor                                      Cambiar proyecto   │ │
│ │ Revision juridica lista     24 lotes     3 ventas por validar           │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐           │
│ │ Matriz de escritura          │ │ Matriz de variables           │           │
│ │ del proyecto                 │ │ del proyecto                  │           │
│ │                              │ │                              │           │
│ │ Estado: Esperando ventas     │ │ Estado: Revision lista        │           │
│ │ Version 1, aprobada          │ │ Titulo, SII, SAG y plano      │           │
│ │ Ultima revision: abogado     │ │ revisados en el CCL           │           │
│ │                              │ │                              │           │
│ │ [Abrir matriz]               │ │ [Abrir variables]             │           │
│ └──────────────────────────────┘ └──────────────────────────────┘           │
│                                                                              │
│ Actividad reciente                                                           │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Matriz aprobada para esperar ventas                   Hoy, 10:42         │ │
│ │ Lote 12: borrador por revisar                         Hoy, 11:05         │ │
│ │ Lote 08: entregada                                    Ayer, 17:20        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

Al abrir "Matriz de escritura del proyecto", la mesa reutiliza el layout actual
de SDD 010:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Mesa de escritura                                                            │
│ Matriz del proyecto Teno - El Condor                                         │
│ Estado: Esperando ventas       Version 1       [Aprobar matriz] [Guardar]    │
├─────────────────┬────────────────────────────────────────────┬───────────────┤
│ Clausulas       │ Escritura del proyecto                     │ Acciones      │
│                 │                                            │               │
│ Comparecencia   │ COMPARECEN: Don Juan de Dios Galaz...      │ Estado        │
│ Antecedentes    │                                            │ Esperando     │
│ Predio          │ PRIMERO: El vendedor es dueño del predio   │ ventas        │
│ Precio          │ denominado "El Condor"...                  │               │
│ Entrega         │                                            │ Pendientes    │
│                 │ SEGUNDO: Vende, cede y transfiere a        │ No hay        │
│                 │ Comprador                                  │ pendientes    │
│                 │ ______                                     │ del proyecto  │
│                 │                                            │               │
│                 │ Lote                                       │ Datos         │
│                 │ ______                                     │ Verificados   │
│                 │                                            │ - Vendedor    │
│                 │ Precio                                     │ - Predio      │
│                 │ ______                                     │ - Titulo      │
│                 │                                            │               │
│                 │ Los huecos muestran nombre humano, no      │ Por completar │
│                 │ claves ni espacios vacios silenciosos.     │ con la venta  │
│                 │                                            │ - Comprador   │
│                 │                                            │ - Lote        │
│                 │                                            │ - Precio      │
└─────────────────┴────────────────────────────────────────────┴───────────────┘
```

Estados esperados del wireframe 1:

| Situacion                       | Lo que debe verse                                                   |
| ------------------------------- | ------------------------------------------------------------------- |
| Proyecto sin matriz aprobada    | Estado "Esperando matriz del proyecto" y accion para crear/abrirla. |
| Matriz en borrador              | Acciones "Guardar" y "Aprobar matriz"; pendientes humanizados.      |
| Matriz aprobada                 | Estado "Esperando ventas"; documento bloqueado salvo nueva version. |
| Datos de venta sin lote vendido | Huecos `______` con etiquetas "Comprador", "Lote" y "Precio".       |
| Revision de proyecto incompleta | Aprobacion bloqueada con accion al CCL o panel de titulo.           |

### Wireframe 2 - Matriz de variables del proyecto

Perfil principal: abogado, administrador legal o usuario que revisa el CCL.

Objetivo: exponer desde Documentos la revision de variables legales del
proyecto que ya existe en el Centro de Control Legal. No crea una entidad nueva:
es la misma revision a scope proyecto (`lot_id` y `escritura_case_id` vacios)
presentada con lenguaje operativo, evidencia visible y acciones de correccion.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Matriz de variables del proyecto                                             │
│ Teno - El Condor                                                             │
│ Datos legales revisados antes de aprobar la matriz de escritura.             │
│                                                                              │
│ Resumen                                                                      │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌──────────────────┐ │
│ │ Aprobadas 42  │ │ Por revisar 3 │ │ Faltan 2      │ │ Sin aplicar 5    │ │
│ └───────────────┘ └───────────────┘ └───────────────┘ └──────────────────┘ │
│                                                                              │
│ Filtros                                                                      │
│ ┌───────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │
│ │ Grupo: Todos          │ │ Estado: Todos        │ │ Buscar dato o valor  │ │
│ └───────────────────────┘ └──────────────────────┘ └──────────────────────┘ │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Dato legal                  Valor revisado             Estado           │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ Nombre del predio           El Condor                  Aprobada         │ │
│ │ Fuente: Dominio vigente, pag. 1                         [Ver respaldo]  │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ Rol matriz SII              67-23                      Aprobada         │ │
│ │ Fuente: Certificado SII, pag. 2                         [Ver respaldo]  │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ Inscripcion del plano       Sin valor                   Falta           │ │
│ │ Se completa manualmente en el CCL                       [Completar]     │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ Alerta de derechos de aguas Requiere clausula           Por revisar     │ │
│ │ Fuente: Estudio de titulo                              [Revisar]       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ [Volver a Documentos]                         [Abrir matriz de escritura]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Detalle lateral al seleccionar un dato:

```text
┌──────────────────────────────────────────┐
│ Inscripcion del plano                    │
│ Grupo: Plano y SAG                       │
│ Estado: Falta                            │
│                                          │
│ Valor actual                             │
│ ┌──────────────────────────────────────┐ │
│ │                                      │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Motivo de correccion o decision          │
│ ┌──────────────────────────────────────┐ │
│ │ Ingresado desde plano aprobado por...│ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Respaldo                                 │
│ Plano de subdivision, pag. 1             │
│ [Abrir documento]                        │
│                                          │
│ [Guardar correccion] [Aprobar] [No aplica] │
└──────────────────────────────────────────┘
```

Estados esperados del wireframe 2:

| Situacion                      | Lo que debe verse                                            |
| ------------------------------ | ------------------------------------------------------------ |
| Dato aprobado                  | Valor, estado "Aprobada", fuente y accion para ver respaldo. |
| Dato propuesto o en conflicto  | Estado "Por revisar" y accion "Revisar".                     |
| Dato faltante                  | Estado "Falta" y accion "Completar".                         |
| Dato no aplicable              | Estado "Sin aplicar" con motivo visible.                     |
| Evidencia documental existente | Documento y pagina en lenguaje humano; sin claves internas.  |
| Correccion manual              | Campo de motivo auditable antes de guardar/aprobar.          |

### Wireframe 3 - Mis documentos del vendedor

Perfil principal: vendedor asignado a proyectos y ventas.

Objetivo: ver solo sus borradores, distinguir el estado de cada escritura,
descargar o compartir el documento, y renovar enlaces vencidos sin pedir ayuda
al administrador.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Mis documentos                                                               │
│ Borradores de escritura de tus ventas.                                       │
│                                                                              │
│ Filtros                                                                      │
│ ┌───────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │
│ │ Proyecto: Todos       │ │ Estado: Todos        │ │ Buscar lote o cliente│ │
│ └───────────────────────┘ └──────────────────────┘ └──────────────────────┘ │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Lote 12 - Teno                                      Entregada            │ │
│ │ Comprador: Maria Fernandez                          Enlace vigente       │ │
│ │ Aceptada por administracion: hoy, 11:12              Vence en 7 dias     │ │
│ │                                                                          │ │
│ │ [Descargar]    [Compartir enlace]                                        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Lote 08 - Teno                                      Borrador por revisar │ │
│ │ Comprador: Carlos Rojas                             Aun no disponible    │ │
│ │ El administrador esta revisando los datos de la venta.                   │ │
│ │                                                                          │ │
│ │ [Ver estado]                                                              │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Lote 03 - Los Maitenes                              Aceptada             │ │
│ │ Comprador: Ana Silva                                Enlace vencido       │ │
│ │                                                                          │ │
│ │ [Renovar enlace]                                                          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

Vista movil esperada:

```text
┌──────────────────────────────┐
│ Mis documentos               │
│ [Proyecto] [Estado]          │
│                              │
│ Lote 12 - Teno               │
│ Entregada                    │
│ Maria Fernandez              │
│ Enlace vigente               │
│ [Descargar] [Compartir]      │
│                              │
│ Lote 08 - Teno               │
│ Borrador por revisar         │
│ Carlos Rojas                 │
│ [Ver estado]                 │
│                              │
│ Lote 03 - Los Maitenes       │
│ Aceptada                     │
│ Enlace vencido               │
│ [Renovar enlace]             │
└──────────────────────────────┘
```

Estados esperados del wireframe 3:

| Situacion                 | Lo que debe verse                                                    |
| ------------------------- | -------------------------------------------------------------------- |
| Documento entregado       | Estado "Entregada", descarga y compartir enlace.                     |
| Borrador aun en revision  | Estado "Borrador por revisar"; sin descarga todavia.                 |
| Venta sin matriz aprobada | Estado "Esperando matriz del proyecto" con texto humano.             |
| Enlace vencido            | Accion "Renovar enlace".                                             |
| Telegram no vinculado     | El documento aparece igual en la web; Telegram no falla en silencio. |
| Venta de otro vendedor    | No aparece en la lista.                                              |

## Checklist de aprobacion T006

El usuario debe validar:

- [x] La matriz del proyecto se entiende como una escritura aprobada una vez
      antes de vender lotes.
- [x] Los datos de venta se ven como huecos `______` y cada hueco tiene nombre
      humano.
- [x] La matriz de variables del proyecto se entiende como el CCL existente, no
      como una entidad nueva.
- [x] La matriz de variables permite revisar datos por grupo, estado, valor y
      respaldo documental sin mostrar claves internas.
- [x] El detalle de un dato permite corregir, aprobar o marcar como no aplicable
      con motivo auditable.
- [x] "Mis documentos" comunica que el vendedor ve solo sus ventas.
- [x] Descargar, compartir y renovar enlace estan claros.
- [x] Los estados usan vocabulario humano y consistente.
- [x] No aparecen JSON, claves internas ni jerga tecnica.

## Registro de aprobacion

| Fecha      | Gate            | Resultado | Evidencia                                                                    |
| ---------- | --------------- | --------- | ---------------------------------------------------------------------------- |
| 2026-06-16 | T006 wireframes | Aprobado  | El usuario reviso los tres wireframes y dijo: "ahora si me gusto avancemos". |

## Pasada T023 - Camino real contra Supabase

| Fecha      | Gate                        | Resultado | Evidencia                                                                                                                                                                                                                           |
| ---------- | --------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-16 | T023 venta validada -> mesa | Aprobado  | `./.venv/bin/python scripts/verify_venta_escritura_supabase.py --allow-remote` en `apps/api`, usando Supabase real configurado en `apps/api/.env` y datos fixture Teno deterministas, no `FakeStore`. Resultado JSON: `status: ok`. |

Resumen de la pasada:

- Script agregado: `apps/api/scripts/verify_venta_escritura_supabase.py`.
- Seed real: organizacion/proyecto/lote fixture Teno + plantilla golden
  publicada + variables legales de proyecto + `lot_records` real actualizado
  por `lot_id`.
- Matriz del proyecto generada y aprobada para la pasada:
  `a4587e9a-dbbd-4e64-a497-8f4af402718e`.
- Hook de venta validada ejecutado:
  `handle_sale_validated_for_escritura(...)`.
- Caso creado:
  `5f5c1d6a-a1c2-4a52-abb0-8fd1f4d69b47`.
- Borrador del lote creado:
  `0ae201e4-9bb5-4b05-8f44-c6741433c41e`.
- Mesa abierta por el endpoint real de caso con `mesa_scope: lot`,
  `mesa_status: draft` y
  `mesa_source_project_matriz_id: a4587e9a-dbbd-4e64-a497-8f4af402718e`.
- URL funcional de mesa:
  `/documentos/matriz/5f5c1d6a-a1c2-4a52-abb0-8fd1f4d69b47`.
- Claves verificadas en el snapshot del caso desde el puente operacional:
  `comprador.nombre`, `comprador.rut`, `transaccion.precio_numeros`,
  `lote.deslindes`.

Notas tecnicas de la pasada:

- El harness fuerza `status = approved` en la matriz del proyecto despues de
  generarla porque no ejecuta una sesion UI con usuario administrador real; la
  aprobacion interactiva queda para T024/T026.
- La pasada descubrio y corrigio dos diferencias de Supabase real frente a
  fakes: `maybe_single()` puede devolver `None` sin fila en
  `create_escritura_case_snapshot` y en el hook de venta antes de insertar el
  borrador.

## Pasada E2E final

### T024 - E2E tecnico completo

| Fecha      | Gate             | Resultado | Evidencia                                                                                                 |
| ---------- | ---------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| 2026-06-16 | T024 E2E tecnico | Aprobado  | Recorrido completo documentado y gates tecnicos de T024 ejecutados. T026 queda como gate humano separado. |

Recorrido cubierto para T024:

1. Proyecto -> matriz aprobada: la matriz de escritura del proyecto se genera
   desde la plantilla general, resuelve datos del proyecto y deja los datos de
   venta como huecos humanos. La pasada real T023 confirmo este tramo contra
   Supabase con la matriz `a4587e9a-dbbd-4e64-a497-8f4af402718e`.
2. Venta validada -> borrador instanciado: `handle_sale_validated_for_escritura`
   crea el caso del lote, propone los datos de venta e instancia el borrador
   desde la matriz aprobada. La pasada real T023 confirmo el caso
   `5f5c1d6a-a1c2-4a52-abb0-8fd1f4d69b47` y el borrador
   `0ae201e4-9bb5-4b05-8f44-c6741433c41e`.
3. Administrador revisa y acepta: la mesa reutilizada de SDD 010 distingue
   datos aprobados del proyecto frente a datos de venta "Por revisar"; al
   aceptar, el flujo genera DOCX con marca de borrador sujeto a revision legal
   y registro ADR-009.
4. Entrega al vendedor: al aceptar/entregar se audita `escritura_deliveries`,
   se intenta Telegram con enlace seguro vencible y se mantiene fallback web.
5. "Mis documentos": el vendedor ve solo documentos de sus ventas, con
   descargar, compartir y renovar enlace vencido; documentos ajenos no aparecen.

Evidencia automatizada que cubre el recorrido:

| Tramo                        | Cobertura principal                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Proyecto -> matriz aprobada  | `apps/api/tests/test_project_matriz.py`, `apps/api/tests/test_matriz_endpoints.py`, pasada real T023. |
| Venta -> borrador            | `apps/api/tests/test_venta_escritura_hook.py`, pasada real T023.                                      |
| Revision y aceptacion        | `apps/api/tests/test_matriz_docx.py`, `apps/web/tests/mesa-escritura.test.ts`.                        |
| Entrega y auditoria          | `apps/api/tests/test_escritura_delivery.py`, `apps/api/tests/test_escritura_notifications.py`.        |
| Mis documentos del vendedor  | `apps/web/tests/mis-documentos.test.ts`, `apps/web/tests/render/mis-documentos.render.test.tsx`.      |
| Estados y superficies nuevas | `apps/web/tests/estados-flujo.test.ts`, `apps/web/tests/render/documentos-page.render.test.tsx`.      |

Gates tecnicos de cierre T024:

| Comando                  | Resultado                 |
| ------------------------ | ------------------------- |
| `pnpm test:api`          | OK: 577 passed, 2 skipped |
| `pnpm test:web`          | OK: 59 files, 699 tests   |
| `pnpm typecheck:web`     | OK                        |
| `pnpm --filter web lint` | OK                        |
| `pnpm format:check`      | OK                        |
| `pnpm build:web`         | OK                        |
| `pnpm verify:migrations` | OK                        |

La sesion de usabilidad observada no se cierra en T024: queda pendiente para
T026, donde el usuario debe validar el journey administrador y vendedor con
observacion humana.
