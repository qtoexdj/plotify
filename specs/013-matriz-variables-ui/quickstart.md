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
8. **Borrador de venta** — en un lote vendido y validado, su borrador muestra los huecos de venta **rellenos** ("desde la venta") y el resto heredado del molde, todo por productor.
9. **Override SII preservado** — el detalle por lote permite el ajuste manual de un rol con su razón (FR-013).

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
- El motor (resolutor, gates, snapshot, puente operacional, hook de venta, renderer DOCX) no se modifica; confirmar que aprobar el molde de Teno y generar un borrador siguen funcionando igual que antes del feature.
