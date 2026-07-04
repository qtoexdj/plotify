/**
 * Lista blanca única de colores hex literales para capas MapLibre.
 *
 * MapLibre exige valores de color directos en sus `paint` properties — no
 * puede consumir `var(--token)` de CSS — así que estas constantes espejan
 * a mano los tokens de estado de `globals.css` (`--status-available`,
 * `--status-reserved`, `--status-sold`). El fill es intencionalmente más
 * saturado que el token de UI equivalente (pensado para contraste de texto
 * AA) porque necesita leerse sobre imagen satelital, no sobre una superficie
 * plana; el criterio de "espejo" es de significado semántico (mismo estado
 * → misma familia de color), no de valor hex idéntico.
 *
 * Si se recalibra un `--status-*` en `globals.css`, revisar también aquí.
 */
export const LOT_COLORS = {
  disponible: { fill: '#22c55e', stroke: '#15803d' },
  reservado: { fill: '#f59e0b', stroke: '#d97706' },
  // Neutro (no destructive/rojo — una venta cerrada es un éxito), un tono más
  // oscuro que `sin_asignar` para que ambos sigan siendo distinguibles en el mapa
  vendido: { fill: '#64748b', stroke: '#475569' },
  sin_asignar: { fill: '#94a3b8', stroke: '#64748b' },
} as const

export type LotColorKey = keyof typeof LOT_COLORS

export const INFRA_COLORS = {
  road: { stroke: '#f59e0b' },
  common_area: { fill: '#a78bfa', stroke: '#7c3aed' },
} as const

/** Color de selección de lote en el mapa (no es un estado, es interacción) */
export const MAP_SELECTION_COLOR = '#1d4ed8'

/** Color de texto de las etiquetas de lote (numero_lote) sobre el mapa, por tema */
export const MAP_LABEL_TEXT_COLOR = { light: '#1f2937', dark: '#e5e7eb' } as const

/** Color de texto de etiqueta cuando el lote está seleccionado, por tema */
export const MAP_LABEL_SELECTED_TEXT_COLOR = { light: '#1e3a8a', dark: '#93c5fd' } as const
