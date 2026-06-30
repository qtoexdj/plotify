# Quickstart: validar la Matriz de Variables por Productor

**Feature**: 013-matriz-variables-ui · **Date**: 2026-06-30

Validación contra el proyecto real **Teno** (`aad0fbf2-ceda-47bc-954a-b3f5f2ac8797`, Supabase remoto). Verificar contra Supabase real, no el FakeStore (los tests de API pueden ocultar bugs de PostgREST).

## Criterios de aceptación verificables

1. **Agrupación por productor** — abrir la sección legal de Teno; las variables aparecen agrupadas en Extraída / Manual / Autoría / Se completa en la venta (no por estado).
2. **Conteo honesto** — el contador "por revisar" muestra **13**, no 117 (SC-001: reducción >85%). Las 106 filas SII aparecen como una entrada "Roles SII · 53 lotes".
3. **Vendedor visible** — los 4 datos del vendedor (`nombre/rut/profesion_giro/domicilio`) son visibles y aprobables (hoy no aparecen).
4. **Evidencia al lado** — al seleccionar `vendedor.nombre`, el inspector muestra el fragmento transcrito del dominio vigente con el nombre resaltado.
5. **Aprobación en bloque** — "Aprobar 4 del vendedor" / "Aprobar roles SII" resuelven el grupo sin clic por clic.
6. **Huecos de venta** — comprador/precio/lote/servidumbre aparecen como "se completa en la venta", sin acciones de edición, y **no** cuentan en "por revisar".
7. **Molde aprobable** — tras resolver las 13, "Aprobar molde" se habilita.
8. **Venta automática** — en un lote vendido y validado, comprador/precio/lote/servidumbre se rellenan desde la venta comercial al generar la escritura. No aparece una nueva tarea legal normal por lote; cualquier vista posterior es solo trazabilidad en lectura.
9. **Override SII preservado** — el detalle por lote permite el ajuste manual de un rol con su razón (FR-013).

## Validación T031 — Teno live

Comando read-only:

```bash
cd apps/api
./.venv/bin/python scripts/verify_matriz_variables_ui_teno.py
```

Resultado del 2026-06-30: **OK**. El escenario base del quickstart valida `13 por revisar / 21 listas / 34 total`; la base live de Teno ya estaba parcialmente revisada y reportó `2 por revisar / 32 listas / 34 total`. Roles SII valida como una entrada visual `sii.roles_por_lote` con 53 lotes, 106 filas y 2 decisiones reales (`sii.pre_rol_lote`, `sii.unidad_nombre`).

## Gates del pipeline (constitución VI) a correr antes de cerrar

```bash
pnpm typecheck:web
pnpm test:web
pnpm build:web
pnpm test:api
pnpm contracts:generate   # tras agregar `producer` al schema
# pnpm verify:migrations   # N/A — este feature no agrega migraciones
```

## No-regresión (FR-011)

- Suites existentes de matriz/escritura/variables en verde (web vitest + api pytest).
- El motor (resolutor, gates, snapshot, puente operacional, hook de venta, renderer DOCX) no se modifica; confirmar que aprobar el molde de Teno y generar la escritura del lote desde una venta siguen funcionando igual que antes del feature.

Resultado T033 del 2026-06-30:

- `pnpm --filter web lint` OK.
- `pnpm format:check` OK.
- `pnpm typecheck:web` OK.
- `pnpm test:web` OK: 64 archivos, 739 tests.
- `pnpm build:web` OK.
- `pnpm test:api` OK: 630 passed, 2 skipped.
- `./.venv/bin/python scripts/verify_venta_escritura_supabase.py --allow-remote` OK contra Supabase dev/staging remoto: matriz de proyecto aprobada, hook venta→escritura crea borrador de lote, mesa abre en scope `lot`, y snapshot verifica `comprador.nombre`, `comprador.rut`, `transaccion.precio_numeros`, `lote.deslindes`.
