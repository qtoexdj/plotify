/**
 * SDD 010 (research D5): vocabulario estático de UI del flujo de escrituras.
 *
 * Fuente única de los textos de pantalla que NO dependen de datos del caso.
 * Todo texto compuesto (pendientes, causas, orígenes, alertas) llega ya
 * redactado desde el API (`legal_microcopy.py`) y la web jamás traduce
 * códigos compuestos. Tabla de referencia: specs/010-mesa-escritura/
 * contracts/ui-contracts.md §3.
 */

import type { MatrizStatus, TemplateStatus, TokenResolutionStatus } from './matriz-types'

/** token resolved/blocked/missing → estado del dato en español (FR-002). */
export const DATO_STATUS_LABELS = {
  resolved: 'Verificado',
  blocked: 'Por revisar',
  missing: 'Falta',
} as const satisfies Record<TokenResolutionStatus, string>

export const MESA_STATUS_LABELS = {
  draft: 'Borrador',
  legal_review_pending: 'En revisión legal',
  approved: 'Aprobada',
  superseded: 'Reemplazada',
} as const satisfies Record<MatrizStatus, string>

export const PLANTILLA_STATUS_LABELS = {
  draft: 'Borrador',
  published: 'Publicada',
  retired: 'Retirada',
} as const satisfies Record<TemplateStatus, string>

/** Textos estáticos de la mesa (ui-contracts §3). */
export const MESA_TEXT = {
  pendientesTitle: 'Para aprobar falta',
  datosTitle: 'Datos de la escritura',
  insertarDato: 'Insertar dato',
  mostrarEstructura: 'Mostrar estructura',
  generarMinuta: 'Generar minuta',
  enviarRevision: 'Enviar a revisión',
  aprobar: 'Aprobar',
  rechazar: 'Rechazar',
  recargar: 'Recargar',
  corregirEnControlLegal: 'Corregir en Centro de Control Legal',
  expedienteCambio: 'El expediente cambió. Recarga para ver la versión vigente.',
  conflictoGuardado: 'Otra persona guardó cambios. Recarga antes de seguir.',
  bloqueTitulo: 'Texto aprobado en el estudio de título',
  bloqueTituloAyuda: 'Este texto se corrige en el panel de título del proyecto.',
  bloqueTituloPendiente: 'Este texto aún no está aprobado en el estudio de título.',
  datoSinNombre: 'Dato del expediente',
  posicionFija: 'Esta cláusula tiene posición fija',
  clausulaNoAplica: 'Esta cláusula no aplica en este caso',
  plantillaPublicadaInmutable:
    'Las plantillas publicadas no se modifican. Crea una copia en borrador.',
  soloLectura: 'Solo lectura',
  preparacionTitle: 'Tu escritura se está preparando',
  preparacionSubtitle:
    'Faltan datos o verificaciones del caso. Resuélvelos y la mesa se abrirá lista para leer.',
  preparacionEstado: 'Preparación',
  pendienteGenerico: 'Pendiente del caso',
  sinPendientes: 'No hay pendientes. La escritura está lista para revisión.',
  abrirMesa: 'Abrir mesa de escritura',
  noSePudoCargar: 'No se pudo cargar la escritura. Recarga para intentarlo de nuevo.',
} as const

/**
 * Términos vetados en pantalla (FR-006/SC-002). El test permanente
 * `mesa-vocabulario.test.ts` los busca en los textos visibles de
 * `components/documents/mesa/` y en los valores de este módulo.
 * T021 completa la lista final en la auditoría de cierre.
 */
export const TERMINOS_PROHIBIDOS = [
  'token',
  'tokens',
  'blocker',
  'blockers',
  'snapshot',
  'gate',
  'gates',
  'resolved',
  'missing',
  'blocked',
  'json',
  'manifest',
  'readiness',
] as const

export function datoStatusLabel(status: TokenResolutionStatus): string {
  return DATO_STATUS_LABELS[status]
}

export function mesaStatusLabel(status: MatrizStatus): string {
  return MESA_STATUS_LABELS[status]
}
