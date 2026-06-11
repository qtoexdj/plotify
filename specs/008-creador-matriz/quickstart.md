# Quickstart: Creador de Matriz y Minuta DOCX

**Feature**: `008-creador-matriz` | verificacion E2E con el corpus Teno.

## Prerrequisitos

1. Stack local arriba (`pnpm dev` segun AGENTS.md; Supabase local migrado:
   `pnpm verify:migrations`).
2. Proyecto con el corpus Teno cargado y **caso de titulo aprobado** (SDD
   009: dominios ingestados → agente corre → abogado aprueba en el panel de
   titulo). Sin titulo aprobado no existe el dominio `titulo.*` en el
   snapshot y la matriz mostrara el blocker con deep link — eso tambien es
   un caso de prueba valido.
3. Lote vendido con `lot_records` completo (cliente, valor/abono/saldo) y
   `lots.boundaries_official` + superficies oficiales.

## Flujo E2E

1. **Caso + puente operacional**: crear el caso de escritura del lote
   vendido. Verificar en el Centro de Control Legal que `comprador.*`,
   `transaccion.*` (con `precio_letras` en palabras), `lote.*` y
   `servidumbre.*` aparecen `proposed` con fuente operacional. Aprobar las
   propuestas revisadas → gates `party/price/geometry_verified` verdes.
2. **Snapshot**: crear/refrescar el snapshot del caso; confirmar que incluye
   el grupo `titulo` (bloques aprobados + inscripciones) y las variables
   operacionales aprobadas.
3. **Plantilla**: en `/documentos/plantillas`, confirmar el template
   "Compraventa predio rustico" v1 publicado (seed del golden). Editarlo
   debe exigir clonar a nueva version draft.
4. **Builder**: abrir `/documentos/matriz/[caseId]`. Verificar: clausula de
   comparecencia con bloque de titulo no editable; tokens con estado;
   reordenar una clausula movible (persiste tras recargar); intentar mover
   comparecencia (anclada).
5. **Vistas**: alternar template/resuelto/evidencia; en evidencia, click en
   un token documental abre snippet+pagina; el boton "Corregir en CCL"
   navega al inventario.
6. **Blockers**: con una alerta `clause_added` (p. ej. derechos_aguas Teno)
   y la clausula deshabilitada, submit debe bloquear nombrando la clausula.
   Rehabilitarla → submit pasa a `legal_review_pending`.
7. **Aprobacion + DOCX**: aprobar como revisor autorizado; generar con el
   warning legal (sin ack debe fallar 422). Descargar el DOCX y verificar:
   abre en Word/LibreOffice sin reparacion, PRIMERO contiene el texto
   aprobado verbatim, referencias registrales en palabras correctas
   (fojas 1.338 → "mil trescientos treinta y ocho"), precio en letras calza
   con el numerico.
8. **Supersesion**: corregir una variable en CCL → nuevo snapshot → el
   builder muestra `snapshot_stale`, la matriz vuelve a draft y la
   generacion antigua sigue en el historial.

## Comandos de verificacion

```bash
pnpm verify:migrations
pnpm test:api          # incluye test_matriz_*.py
pnpm test:web          # incluye matriz-builder.test.ts
pnpm typecheck:web && pnpm format:check && pnpm build:web
```
