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

## Resultado E2E Teno - 2026-06-11

Pasada de consolidacion SDD 008 ejecutada sobre fixtures Teno y contratos
generados:

1. **Caso + puente operacional**: cubierto por `pnpm test:api`; las pruebas
   `test_matriz_operational_*` y fixtures Teno validan staging operacional,
   fuentes `system`/`geometry`/`derived`, faltantes y gates.
2. **Snapshot**: cubierto por `test_matriz_endpoints.py`; GET/PUT/generate
   consumen `variable_snapshot`, detectan `snapshot_hash` divergente y no leen
   extraccion viva.
3. **Plantilla**: cubierto por API/UI; template publicado queda inmutable,
   clone/upsert valida catalogo y la ruta vigente es `/documentos/plantillas`.
4. **Builder**: cubierto por `matriz-builder.test.ts` y `pnpm build:web`;
   reordenamiento, anclas, estados y candado de aprobado compilan contra el
   contrato actual.
5. **Vistas**: cubierto por tests web de `matriz-view-switch`/builder;
   template/resuelto/evidencia consumen el mismo `resolution_manifest`.
6. **Blockers**: cubierto por `TestAlertClauseContract`; `clause_added`
   bloquea submit/generate cuando falta la clausula activa y muestra la razon
   de alertas descartadas.
7. **Aprobacion + DOCX**: cubierto por `TestMatrizReviewWorkflow`,
   `TestGenerateMinuta` y `test_matriz_docx.py`; warning sin ack falla 422,
   matriz no aprobada falla, DOCX se genera con bytes ZIP validos y sin tokens
   sin resolver. Queda pendiente solo revision visual humana en Word/LibreOffice
   antes de entrega notarial.
8. **Supersesion**: cubierto por `test_get_supersedes_approved_matrix_when_snapshot_hash_changes`
   y `test_put_and_generate_detect_snapshot_divergence`; la matriz vuelve a
   draft y el historial de generaciones permanece consultable.

Verificaciones de la pasada:

```bash
pnpm test:api          # 493 passed, 2 skipped
pnpm build:web         # OK; rutas MVP generar/bloques/builder legacy ausentes
pnpm contracts:generate
pnpm typecheck:web     # OK
```
