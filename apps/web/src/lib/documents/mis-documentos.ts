/**
 * SDD 011 T017 — "Mis documentos del vendedor".
 *
 * Helpers puros de presentación de las entregas del vendedor. El aislamiento
 * (un vendedor solo ve SUS ventas) lo garantiza la API; aquí solo se decide
 * qué acciones ofrece cada entrega y con qué frase humana.
 */

import type { EscrituraDeliveryView } from './matriz-types'

export const MIS_DOCUMENTOS_TEXT = {
  title: 'Mis documentos',
  subtitle: 'Los borradores de escritura de tus ventas.',
  empty: 'Aún no tienes borradores de escritura.',
  errorCarga: 'No se pudieron cargar tus documentos. Recarga para intentarlo de nuevo.',
  descargar: 'Descargar',
  compartir: 'Compartir',
  renovar: 'Renovar enlace',
  renovando: 'Renovando',
  enlaceVencido: 'El enlace venció. Renuévalo para descargar.',
  sinDescarga: 'El documento aún no está disponible.',
} as const

/** Descargable solo si fue entregada y conserva una URL vigente. */
export function puedeDescargar(entrega: EscrituraDeliveryView): boolean {
  return entrega.status === 'sent' && Boolean(entrega.download_url)
}

/** Renovable solo cuando el enlace venció (FR-010, sin pedirle nada al admin). */
export function puedeRenovar(entrega: EscrituraDeliveryView): boolean {
  return entrega.status === 'expired'
}

/** Frase humana del estado, redactada por el servidor (diccionario único). */
export function etiquetaEntrega(entrega: EscrituraDeliveryView): string {
  return entrega.status_label ?? 'Entrega'
}
