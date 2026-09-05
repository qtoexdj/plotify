'use client'

/**
 * Visor de lotes de la presentación.
 *
 * No es una imitación del visor: monta las mismas piezas que usa el producto
 * (`MapPanel`, `MapLotLayers`, `LotHoverCard`), así que el mapa se ve y se
 * comporta igual —pitch inicial de 55°, colores de `lib/map/lot-colors.ts`,
 * hover y selección— y el dueño puede navegar el plano en vivo durante la
 * reunión: girar, acercar, tocar un lote.
 *
 * Las diferencias con el visor del dashboard son deliberadas:
 *   · los datos vienen de un snapshot estático (`plano-demo.ts`), no de la API
 *     autenticada, porque `/presentacion` es una ruta pública;
 *   · no hay edición, acciones masivas ni consulta a Supabase: es solo lectura.
 */

import * as React from 'react'
import bbox from '@turf/bbox'
import { HugeiconsIcon } from '@hugeicons/react'
import { Location01Icon } from '@hugeicons/core-free-icons'

import { useMap } from '@/components/ui/map'
import { MapPanel } from '@/components/projects/geometry-viewer/MapPanel'
import { MapLotLayers } from '@/components/projects/geometry-viewer/MapLotLayers'
import { LotHoverCard } from '@/components/projects/geometry-viewer/LotHoverCard'
import type { ViewerFeature } from '@/types/viewer.types'
import { cn } from '@/lib/utils'
import { PLANO_DEMO, LOTES_DEMO } from './plano-demo'
import { PROYECTO_DEMO, clp } from './deck-data'

/* ------------------------------------------------------------------ *
 * Cámara de presentación
 * ------------------------------------------------------------------ */

/** Cuánto se aleja la cámara antes de entrar. En zoom logarítmico, 0.85 ≈ 1,8× más ancho. */
const ZOOM_ENTRADA = 0.85
/** Duración del acercamiento inicial. */
const DURACION_ENTRADA_MS = 2800
/** Grados que se aparta el encuadre de su orientación, hacia cada lado. */
const AMPLITUD_GRADOS = 14
/** Duración de una oscilación completa (ida y vuelta). */
const PERIODO_MS = 48_000

const suavizado = (t: number) => 1 - Math.pow(1 - t, 3)

/** Mismo pitch con el que abre el visor del producto (MapPanel). */
const PITCH = 55
const RELLENO_ENCUADRE = 26
/**
 * Al encuadrar con inclinación, MapLibre ajusta el terreno visible —que en
 * perspectiva es mucho más profundo— y el loteo queda ocupando poco más de la
 * mitad del ancho. Este acercamiento extra lo devuelve a ~85%.
 */
const COMPENSACION_PITCH = 0.06

// Se encuadra sobre los lotes, no sobre toda la colección: las servidumbres y
// la infraestructura se extienden más allá del loteo y descentraban el plano.
const [oeste, sur, este, norte] = bbox({
  type: 'FeatureCollection',
  features: LOTES_DEMO,
} as unknown as GeoJSON.FeatureCollection)
const ESQUINAS: [number, number][] = [
  [oeste, sur],
  [este, sur],
  [este, norte],
  [oeste, norte],
]

/**
 * Da movimiento al plano mientras nadie lo toca, en dos tiempos:
 *
 *   1. Entrada: la cámara parte alejada y se acerca al encuadre del proyecto.
 *   2. Órbita: queda oscilando suavemente alrededor de su orientación.
 *
 * Oscila en vez de girar sin fin a propósito. Una rotación completa terminaría
 * mostrando el loteo con el norte hacia abajo, que en un plano de parcelación
 * desorienta; ±14° se lee como movimiento sin perder la referencia.
 *
 * Se detiene apenas el usuario toca el mapa —en una reunión, quien arrastra el
 * plano quiere control, no pelear con la animación— y la secuencia completa se
 * rearma al salir de la diapositiva, así que volver a ella la vuelve a mostrar.
 * No corre si la diapositiva no está visible ni si el sistema pide movimiento
 * reducido.
 */
function CamaraDePresentacion() {
  const { map, isLoaded } = useMap()

  React.useEffect(() => {
    if (!map || !isLoaded) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Las diapositivas inactivas siguen montadas (marcadas con `inert`), así que
    // sin esto la cámara se movería en segundo plano durante toda la charla.
    const seccion = map.getContainer().closest('section[id^="diapositiva-"]')
    const visible = () => !seccion?.hasAttribute('inert')

    let cuadro = 0
    let detenido = false
    let fase: 'preparada' | 'entrando' | 'orbitando' = 'preparada'
    let marca = 0
    // Centro de la oscilación y destino del acercamiento. Se vuelven a tomar al
    // rearmar, así la secuencia reanuda desde donde el usuario dejó el plano.
    let centro = map.getBearing()
    let zoomObjetivo = map.getZoom()

    /**
     * Aleja la cámara para que la entrada tenga desde dónde acercarse.
     *
     * Se ejecuta dentro del efecto, que React despacha en el mismo flush que el
     * encuadre inicial de `MapAutoFit` (se renderiza antes que los hijos): no
     * hay pintado entremedio, así que no se ve el salto hacia atrás. Y cuando la
     * diapositiva está oculta, tampoco hay nada que ver.
     */
    const prepararEntrada = () => {
      // Reencuadra contando la inclinación. `MapPanel` calcula el encuadre en
      // plano y recién después aplica el pitch, así que el loteo terminaba
      // corrido y más chico que su marco; con el pitch dentro del cálculo queda
      // centrado y llena la tarjeta.
      map.fitBounds(
        [
          [oeste, sur],
          [este, norte],
        ],
        { padding: RELLENO_ENCUADRE, pitch: PITCH, bearing: 0, duration: 0 }
      )
      map.setZoom(map.getZoom() + COMPENSACION_PITCH)

      // La inclinación deja el loteo bajo el centro óptico. Se corrige midiendo
      // dónde cae realmente en pantalla, así funciona con cualquier alto de
      // tarjeta en vez de depender de un desplazamiento fijo.
      const proyectadas = ESQUINAS.map((esquina) => map.project(esquina))
      const xs = proyectadas.map((punto) => punto.x)
      const ys = proyectadas.map((punto) => punto.y)
      const lienzo = map.getContainer().getBoundingClientRect()
      map.panBy(
        [
          (Math.min(...xs) + Math.max(...xs)) / 2 - lienzo.width / 2,
          (Math.min(...ys) + Math.max(...ys)) / 2 - lienzo.height / 2,
        ],
        { duration: 0 }
      )

      zoomObjetivo = map.getZoom()
      centro = map.getBearing()
      map.jumpTo({ zoom: zoomObjetivo - ZOOM_ENTRADA, bearing: centro })
      fase = 'preparada'
    }

    const detener = () => {
      detenido = true
    }
    const eventosUsuario = ['mousedown', 'touchstart', 'wheel', 'dragstart', 'boxzoomstart']
    eventosUsuario.forEach((evento) => map.on(evento, detener))

    prepararEntrada()

    const paso = (ahora: number) => {
      cuadro = requestAnimationFrame(paso)

      if (!visible()) {
        // Salir de la diapositiva rearma la secuencia completa: al volver, el
        // plano se acerca y se mueve de nuevo aunque antes se hubiera arrastrado.
        if (fase !== 'preparada' || detenido) {
          detenido = false
          prepararEntrada()
        }
        return
      }

      if (detenido) return

      if (fase === 'preparada') {
        map.easeTo({
          zoom: zoomObjetivo,
          duration: DURACION_ENTRADA_MS,
          easing: suavizado,
        })
        fase = 'entrando'
        marca = ahora
        return
      }

      if (fase === 'entrando') {
        if (ahora - marca < DURACION_ENTRADA_MS) return
        fase = 'orbitando'
        marca = ahora
        centro = map.getBearing()
        return
      }

      const transcurrido = ahora - marca
      map.setBearing(centro + Math.sin((transcurrido / PERIODO_MS) * Math.PI * 2) * AMPLITUD_GRADOS)
    }

    cuadro = requestAnimationFrame(paso)

    return () => {
      cancelAnimationFrame(cuadro)
      eventosUsuario.forEach((evento) => map.off(evento, detener))
    }
  }, [map, isLoaded])

  return null
}

const CONTEO = {
  disponible: LOTES_DEMO.filter((f) => f.properties.estado === 'disponible').length,
  reservado: LOTES_DEMO.filter((f) => f.properties.estado === 'reservado').length,
  vendido: LOTES_DEMO.filter((f) => f.properties.estado === 'vendido').length,
}

export function VisorPresentacion({
  modo,
  className,
}: {
  modo: 'vendedor' | 'admin'
  className?: string
}) {
  const [seleccionado, setSeleccionado] = React.useState<string | null>(null)
  const [hover, setHover] = React.useState<string | null>(null)

  const seleccionados = React.useMemo(
    () => new Set(seleccionado ? [seleccionado] : []),
    [seleccionado]
  )

  const featureHover: ViewerFeature | null = React.useMemo(
    () => PLANO_DEMO.features.find((f) => f.properties.geometry_id === hover) ?? null,
    [hover]
  )

  const featureSeleccionada: ViewerFeature | null = React.useMemo(
    () => PLANO_DEMO.features.find((f) => f.properties.geometry_id === seleccionado) ?? null,
    [seleccionado]
  )

  const detalle = featureSeleccionada?.properties

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-border/60',
        className
      )}
    >
      {/* Barra superior: misma composición que el visor del dashboard */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Location01Icon} className="size-4 text-muted-foreground" />
            <span className="text-[13.5px] font-medium">Visor de Lotes</span>
            <span className="hidden text-[12px] text-muted-foreground sm:inline">
              · {PROYECTO_DEMO.nombre}, {PROYECTO_DEMO.comuna}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Leyenda:
            </span>
            <span className="size-2.5 rounded-sm bg-status-available" />
            <span className="size-2.5 rounded-sm bg-status-reserved" />
            <span className="size-2.5 rounded-sm bg-status-sold" />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            {CONTEO.disponible} disp.
          </span>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
            {CONTEO.reservado} res.
          </span>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            {CONTEO.vendido} vend.
          </span>
        </div>
      </div>

      {/* Mapa interactivo */}
      <div className="relative h-[424px]">
        <MapPanel featureCollection={PLANO_DEMO} className="h-full w-full">
          <MapLotLayers
            featureCollection={PLANO_DEMO}
            selectedIds={seleccionados}
            hoveredFeatureId={hover}
            onFeatureClick={(featureId) =>
              setSeleccionado((actual) => (actual === featureId ? null : featureId))
            }
            onFeatureHover={setHover}
          />
          <LotHoverCard feature={featureHover} />
          <CamaraDePresentacion />
        </MapPanel>
      </div>

      {/* Pie: lote seleccionado, o invitación a tocar el plano */}
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-3 py-2">
        {detalle?.numero_lote ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-display text-[14px] font-semibold">
                Lote {detalle.numero_lote}
              </span>
              {detalle.area_official_m2 ? (
                <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  {detalle.area_official_m2.toLocaleString('es-CL')} m²
                </span>
              ) : null}
              {detalle.servidumbre_m2 ? (
                <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                  servidumbre {detalle.servidumbre_m2.toLocaleString('es-CL')} m²
                </span>
              ) : null}
              {detalle.superficie_neta_m2 ? (
                <span className="font-mono text-[11.5px] font-semibold tabular-nums">
                  neta {detalle.superficie_neta_m2.toLocaleString('es-CL')} m²
                </span>
              ) : null}
            </div>
            {modo === 'admin' && detalle.precio ? (
              <span className="font-mono text-[12px] font-semibold text-primary">
                {clp(detalle.precio)}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">
            Plano real de {PROYECTO_DEMO.nombre}: gira, acerca y toca una parcela para ver sus
            medidas.
          </span>
        )}
      </div>
    </div>
  )
}
