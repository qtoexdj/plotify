/**
 * Plano real que usa la presentación.
 *
 * `plano-demo.json` es un snapshot del proyecto **Teno 2** generado con
 * `scripts/export-presentation-plan.mjs`, que deja pasar solo la geometría y
 * las medidas de lotes y servidumbres. No contiene datos de clientes,
 * vendedores, observaciones ni precios reales: el estado comercial y el precio
 * que se ven en la presentación son sintéticos y deterministas.
 *
 * Se importa como módulo (y no se pide por red) para que la presentación abra
 * instantáneamente y siga funcionando en una reunión sin conexión.
 *
 * Para actualizarlo o cambiar de proyecto:
 *   node scripts/export-presentation-plan.mjs <projectId>
 */

import type { ViewerFeature, ViewerFeatureCollection } from '@/types/viewer.types'
import snapshot from './plano-demo.json'

type OrigenSnapshot = {
  proyecto: string
  comuna: string
  region: string
  exportado: string
  nota: string
}

const crudo = snapshot as unknown as ViewerFeatureCollection & { _origen: OrigenSnapshot }

export const PLANO_DEMO: ViewerFeatureCollection = {
  type: 'FeatureCollection',
  features: crudo.features,
}

export const ORIGEN_PLANO = crudo._origen

export const LOTES_DEMO: ViewerFeature[] = crudo.features.filter(
  (f) => f.properties.geometry_type === 'lot'
)

/** Deslinde tal como lo calcula el motor de geometría del producto. */
export type DeslindeOficial = {
  label: string
  colinda: string
  distance: number
  es_servidumbre?: boolean
}

/**
 * Lote canónico de la presentación.
 *
 * Se elige el 14 porque es uno de los cuatro lotes de Teno 2 cuyos cuatro
 * deslindes oficiales nombran lotes numerados. En el resto del proyecto los
 * colindantes están cargados como "campo de al lado 1" o "vecinos numero 2",
 * texto de relleno que en una minuta real quedaría escrito tal cual.
 */
const NUMERO_LOTE_CANONICO = '14'

const loteCanonico =
  LOTES_DEMO.find((f) => f.properties.numero_lote === NUMERO_LOTE_CANONICO) ?? LOTES_DEMO[0]

if (!loteCanonico) {
  throw new Error('plano-demo.json no contiene lotes: reexporta el snapshot del proyecto.')
}

const props = loteCanonico.properties

export const LOTE_CANONICO = {
  numero: props.numero_lote ?? NUMERO_LOTE_CANONICO,
  superficieTotalM2: props.area_official_m2 ?? props.m2 ?? 0,
  servidumbreM2: props.servidumbre_m2 ?? 0,
  superficieNetaM2: props.superficie_neta_m2 ?? 0,
  servidumbreAnchoM: props.servidumbre_ancho_m ?? 0,
  perimetroM: props.perimeter_official_m ?? 0,
  precioClp: props.precio ?? 0,
  verificado: props.verified_status === 'verified_exact',
  deslindes: ((props.boundaries_official ?? []) as unknown as DeslindeOficial[]).map((d) => ({
    rumbo: d.label,
    metros: d.distance,
    colinda: d.colinda,
    esServidumbre: Boolean(d.es_servidumbre),
  })),
}
