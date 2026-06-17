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
  datoSinValor: 'Sin valor en el expediente',
  categoriaSinNombre: 'Otros datos',
  expedienteVacio: 'El expediente del caso aún no tiene datos.',
  guardar: 'Guardar',
  guardando: 'Guardando',
  noSePudoGuardar: 'No se pudo guardar la escritura. Intenta de nuevo.',
  indiceTitle: 'Cláusulas',
  reordenarClausula: 'Reordenar cláusula',
  noAplicaCorto: 'No aplica',
  clausulaCompleta: 'Completa',
  editarClausula: 'Editar cláusula',
  cerrarEditor: 'Listo',
  cambiosSinGuardar: 'Cambios sin guardar',
  irAlPanelTitulo: 'Ir al panel de título',
  buscarDato: 'Buscar dato',
  sinResultadosDatos: 'Ningún dato coincide con la búsqueda.',
  resumenEnviar: 'La escritura pasará a revisión legal. Mientras se revisa no se podrá editar.',
  resumenAprobar:
    'La escritura quedará aprobada y lista para generar la minuta. Para editarla después habrá que devolverla a borrador.',
  resumenRechazar: 'La escritura volverá a borrador con tu observación registrada para el equipo.',
  tituloDeclaracionLegal: 'Declaración legal',
  warningLegal:
    'Declaro que la escritura fue revisada y aprobada por el flujo legal. La minuta se genera desde el expediente vigente del caso y no reemplaza la revisión notarial final.',
  confirmoYGenero: 'Confirmo y genero',
  enviarBloqueadoTitle: 'Aún no se puede enviar a revisión',
  razonRechazoLabel: 'Cuéntale al equipo qué corregir',
  confirmar: 'Confirmar',
  cancelar: 'Cancelar',
  entendido: 'Entendido',
  noSePudoActualizarRevision: 'No se pudo actualizar la revisión. Intenta de nuevo.',
  noSePudoGenerarMinuta: 'No se pudo generar la minuta. Intenta de nuevo.',
  descargarMinuta: 'Descargar minuta',
  sinMinutas: 'Aún no se han generado minutas.',
  declaracionAceptada: 'Declaración legal aceptada al generar.',
  archivoNoDisponible: 'El archivo ya no está disponible.',
  bibliotecaPlantillas: 'Biblioteca de plantillas',
  nuevoBorrador: 'Nuevo borrador',
  nombrePlantilla: 'Nombre de la plantilla',
  plantillasTitle: 'Plantillas',
  plantillaVacia: 'Este borrador aún no tiene cláusulas.',
  seleccionarPlantilla: 'Selecciona una plantilla para revisar sus cláusulas.',
  clonar: 'Clonar',
  publicar: 'Publicar',
  nuevaClausula: 'Nueva cláusula',
  guardarClausula: 'Guardar cláusula',
  tituloClausula: 'Título de la cláusula',
  clausulaFija: 'Mantener posición fija',
  condicionTitle: 'Aparición de la cláusula',
  condicionSinSeleccion: 'Aparece siempre',
  alertaTitle: 'Alerta legal',
  alertaSinSeleccion: 'Sin alerta',
  condicionesIncompletas: 'Revisa la condición elegida antes de guardar.',
  erroresCatalogoTitle: 'Hay datos por revisar',
  errorCatalogoSugerencia: 'Usa la sugerencia del catálogo',
  datoFueraCatalogo: 'Dato de la cláusula',
  noSePudoGuardarClausula: 'No se pudo guardar la cláusula. Intenta de nuevo.',
  plantillaSoloLectura: 'Las plantillas publicadas no se modifican. Crea una copia en borrador.',
  sinPlantillas: 'No hay plantillas todavía.',
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
  'variable',
  'variables',
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
  'builder',
  'template',
  'templates',
  'payload',
  'schema',
  'endpoint',
  'debug',
  'developer',
  'prosemirror',
  'prosekit',
  'condition_key',
  'condition_mode',
  'alert_tipo',
  'dl_3516',
  'derechos_aguas',
  'fixed_position',
  'content_json',
  'block_token',
  'variable_token',
] as const

export function datoStatusLabel(status: TokenResolutionStatus): string {
  return DATO_STATUS_LABELS[status]
}

export function mesaStatusLabel(status: MatrizStatus): string {
  return MESA_STATUS_LABELS[status]
}
