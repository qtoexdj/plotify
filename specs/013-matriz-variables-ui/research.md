# Research: Matriz de Variables por Productor

**Feature**: 013-matriz-variables-ui · **Date**: 2026-06-30

Phase 0 — decisiones de diseño y su justificación, verificadas contra el código y el Supabase real (proyecto Teno `aad0fbf2-ceda-47bc-954a-b3f5f2ac8797`).

## El pipeline que la UI debe reflejar

Tres fases, verificadas en el código:

1. **Creación del proyecto** → se suben docs (dominio vigente, cert SAG, cert SII, plano); ingesta + extracción (agente de título por visión, SII, SAG) producen variables **extraídas**. Quedan **manuales** (plano CBR, oficina sectorial) y de **autoría** (cláusulas, mandato, personería) que toman default.
2. **Validación y aprobación** → el operador revisa/aprueba en el CCL; la matriz del **proyecto** se valida **sin** los huecos de venta (`NON_BLOCKING_PROJECT_MATRIZ_KEYS`). Aprobada → "esperando ventas" = molde de toda la parcelación.
3. **Venta de un lote** → el vendedor registra la venta comercial (`LotReservationForm`: cliente + valor); el admin la aprueba; el hook `handle_sale_validated_for_escritura` crea el caso + snapshot y el **puente operacional** (`escritura_operational_bridge.py`) mapea lo comercial → `comprador.*`/`transaccion.*`/`lote.*`/`servidumbre.*`, copiando el molde aprobado a un **borrador del lote** con los huecos ya rellenos.

## Decisiones

### D1 — Organizar por productor, no por estado
El backend ya clasifica cada variable por **quién la llena y cuándo** (`legal_variable_catalog.variable_producer()`: `extracted/authored/manual/sale_gap/signing`). Es el modelo mental real del negocio.
- **Alternativa rechazada**: agrupar por los 9 estados (UI actual) → no responde "¿qué me toca hacer?" y mezcla ruido.
- **Alternativa parcial**: agrupar por grupo canónico (14) → útil como sub-eje, pero no separa lo accionable de lo automático.

### D2 — Colapsar las repeticiones por lote en el cliente
Las claves `sii.unidad_nombre` y `sii.pre_rol_lote` se repiten una vez por lote (Teno: 53 c/u = 106 filas). Se colapsan a una entrada "Roles SII · N lotes" con detalle por lote.
- **Decisión**: colapso en **cliente** (cero backend; el inventario ya devuelve las filas).
- **Alternativa rechazada**: colapsar en el servidor → tocaría `get_project_variable_inventory` y su contrato más allá del campo `producer`.

### D3 — Exponer `producer` en el inventario (único cambio de backend)
`variable_producer()` ya existe pero no viaja en `VariableResolutionResponse`. Se agrega como campo derivado de lectura. Sin migración. Ver `data-model.md` y `contracts/inventory-producer.md`.

### D4 — Reemplazar los paneles a medida por completo (decisión del usuario)
Se eliminan SAG, Plano, Roles SII y Título como paneles; todo pasa al modelo genérico fila + inspector por grupo.
- **Riesgo**: dos paneles tienen capacidad fina — (a) **override manual de roles SII** por lote, (b) **Título** (cadena de adquisición, alertas, narrativa). Mitigación: (a) se preserva en `sii-lot-group.tsx` reutilizando `legal-roles/[lotId]` (FR-013); (b) el grupo `titulo` usa un inspector de texto largo/estructurado para narrativa + alertas.

### D5 — Alcance a dos niveles (molde + borrador de venta)
La misma matriz por productor sirve para el molde (scope proyecto) y para el borrador de venta (scope lote), donde los huecos de venta aparecen **rellenos** y marcados "desde la venta". Un solo componente con dos modos.

### D6 — Dirección visual: V3 portada + V2 al entrar
Tablero bento por productor como portada (escaneable, estado del molde en 2s) y, al entrar a un grupo, lista + inspector de evidencia (revisión rápida con la fuente al lado). Wireframes de alta fidelidad ya producidos y validados con datos de Teno.

## Caso concreto — las 13 decisiones reales de Teno

138 filas activas = 21 aprobadas + 117 "por revisar"; las 117 son **13 decisiones distintas** (106 son 53 lotes × 2 campos SII):

| Productor | Variable | Valor | Conf. | Fuente |
|---|---|---|---|---|
| extraída | `vendedor.nombre` | JUAN DE DIOS GALAZ ABARCA | 98% | dominio |
| extraída | `vendedor.rut` | 4.606.965-2 | 99% | dominio |
| extraída | `vendedor.profesion_giro` | rentista | 99% | dominio |
| extraída | `vendedor.domicilio` | Camino a Melipilla Km 27, Peñaflor | 99% | dominio |
| extraída | `sii.unidad_nombre` + `sii.pre_rol_lote` | 53 lotes (colapsado) | 88% | cert SII |
| extraída | `sii.rol_matriz` | 00067-00023 | 88% | cert SII |
| extraída | `sii.rol_avaluo_en_tramite_texto` | Rol de avalúo en trámite número 08179-00001 … | 88% | cert SII |
| extraída | `sii.certificado_asignacion_roles_numero` | 972575 | 86% | cert SII |
| extraída | `sii.certificado_fecha_emision` | 12/08/2024 | — | cert SII |
| extraída | `sii.solicitud_numero` | F2118 | 84% | cert SII |
| manual | `sag.oficina_sectorial` | Curicó | — | plano/CBR |
| manual | `sag.plano_cbr_numero` | 1394 | — | plano/CBR |

(Autoría y huecos de venta no cuentan como "por revisar".)

## Riesgos / pendientes para clarify o plan

- **Contrato generado vs mirror manual**: ✅ resuelto. El inventario legal SÍ viaja por el cliente generado (`plotify-chat.generated.ts` vía `pnpm contracts:generate`). `producer` se agregó como `computed_field` y ya está en el generado. Pendiente de tasks: que el frontend consuma el tipo generado en vez del mirror `variable-resolution-types.ts`.
- **Riqueza del grupo Título**: validar que el inspector genérico cubre cadena de adquisición + alertas sin perder lo del `TitleCasePanel`.
- **Override SII**: el detalle por lote debe exponer el ajuste manual con su razón (hoy 6 campos) sin reintroducir un panel a medida.
- **Fuente de datos del borrador de venta**: la vista lote es de lectura sobre el snapshot/puente; no edita comprador/precio (eso vive en la venta comercial).
