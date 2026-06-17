# UI Contracts: Creador de Matriz y Minuta DOCX

**Date**: 2026-06-10 | **Feature**: `008-creador-matriz`

## Rutas

| Ruta                          | Contenido                            | Reemplaza                      |
| ----------------------------- | ------------------------------------ | ------------------------------ |
| `/documentos/matriz/[caseId]` | Builder de matriz del caso           | `generar/` MVP                 |
| `/documentos/plantillas`      | Biblioteca de plantillas versionadas | `plantillas/` + `bloques/` MVP |
| `/documentos/historial`       | Generaciones de minuta (tabla nueva) | misma ruta, data nueva         |

Las paginas MVP reemplazadas se retiran de la navegacion en la fase final
(research D10). El caso de escritura se alcanza desde el proyecto (lote
vendido) y desde `/documentos`.

## Componentes nuevos (`apps/web/src/components/documents/matriz/`)

- `matriz-builder.tsx`: layout 3 paneles — lista de clausulas (izquierda,
  dnd-kit sortable, `fixed_position` ancladas), editor ProseKit (centro),
  panel de caso (derecha: gates, tokens pendientes, alertas, blockers con
  deep links). Header: estado de la matriz, selector de vista, acciones
  submit/approve/generate segun rol y estado.
- `matriz-clause-editor.tsx`: ProseKit con los 4 nodos custom (research D2).
  `variable_token` renderiza chip con label + estado (colores del sistema
  SDD 007: approved verde, proposed azul, manual_review/missing ambar,
  conflict rojo); `block_token` renderiza el texto aprobado de titulo en
  panel no editable con badge "Aprobado por abogado — se corrige en el panel
  de titulo"; `repeat_section`/`conditional_section` con marco punteado y
  etiqueta del arreglo/condicion.
- `matriz-view-switch.tsx`: vistas `template` (tokens), `resuelto` (valores
  del manifiesto de resolucion), `evidencia` (cada token clickable abre
  `legal-evidence-viewer` reutilizado de SDD 007 con snippet/pagina/
  documento + boton "Corregir en Centro de Control Legal").
- `matriz-approval-bar.tsx`: blockers de FR-007 (mismo patron
  `title-blocking-list` de SDD 009), ack del warning legal (FR-012, dialogo
  con texto ADR-009 y registro), descarga.
- `template-library.tsx` + `template-clause-form.tsx`: CRUD de la
  biblioteca; validacion de claves en linea (`invalid_keys` del API) con
  sugerencia de migracion para claves removidas.
- `generation-history.tsx`: historial inmutable con metadata (quien, cuando,
  template version, snapshot hash) y re-descarga.

## Estados visibles obligatorios

| Estado                             | UI                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `snapshot_stale`                   | Banner ambar "El expediente cambio" + boton recargar; guardado/generacion deshabilitados |
| `version_conflict` (409)           | Toast + recarga de la matriz, draft local preservado en memoria para re-aplicar          |
| Token `missing`                    | Chip ambar + entrada en panel derecho con deep link                                      |
| Alerta `clause_added` sin clausula | Blocker rojo con nombre de clausula requerida (tabla addendum SDD 009)                   |
| Alerta `dismissed_with_reason`     | Razon visible en sidebar de revision                                                     |
| Matriz `approved`                  | Editor solo-lectura + boton generar activo                                               |

## Tests web

`apps/web/tests/matriz-builder.test.ts` (harness estructural tipo
`title-case-panel.test.ts`): exports, switch de vistas, formato de blockers,
labels de estados de token, gating del boton generar por
status+snapshot+warning, validacion de claves en el form de clausulas.
