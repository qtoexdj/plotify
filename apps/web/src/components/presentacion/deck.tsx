'use client'

import * as React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  GridViewIcon,
  Maximize01Icon,
  Moon01Icon,
  Note01Icon,
  PresentationBarChart01Icon,
  Sun01Icon,
} from '@hugeicons/core-free-icons'

import { useTheme } from 'next-themes'

import { AnimatedGridPattern } from '@/components/ui/animated-grid-pattern'
import { BrandMark } from '@/components/brand/brand-mark'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import estilos from './deck.module.css'
import { DIAPOSITIVAS } from './slides'
import { SPEAKER_NOTES } from './deck-data'

/**
 * Controles del deck: 44×44 en móvil —el mínimo táctil de Apple HIG y WCAG 2.5.5—
 * y compactos desde `sm`, donde se apunta con mouse.
 */
const BOTON_ICONO = 'size-11 sm:size-8'
const BOTON_BARRA = 'h-11 sm:h-8'

const ANCHO_ESCENARIO = 1280
const ALTO_ESCENARIO = 720

/** Bajo estas medidas la diapositiva deja de ser lienzo fijo y vuelve a fluir. */
const MIN_ANCHO_ESCENARIO = 1000
const MIN_ALTO_ESCENARIO = 520

function esCampoDeTexto(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof HTMLElement)) return false
  return objetivo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(objetivo.tagName)
}

/** Alterna claro/oscuro con un área táctil suficiente, a diferencia del Switch. */
function BotonTema({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [montado, setMontado] = React.useState(false)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMontado(true)
  }, [])

  // El tema resuelto no existe en el servidor, así que hasta montar se asume
  // claro: el primer render del cliente coincide con el del servidor y no hay
  // desajuste de hidratación en el icono ni en la etiqueta accesible.
  const oscuro = montado && resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={() => setTheme(oscuro ? 'light' : 'dark')}
      aria-label={oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title="Cambiar tema"
    >
      <HugeiconsIcon icon={oscuro ? Moon01Icon : Sun01Icon} />
    </Button>
  )
}

export function Deck() {
  const [indice, setIndice] = React.useState(0)
  const [notasAbiertas, setNotasAbiertas] = React.useState(false)
  const [grillaAbierta, setGrillaAbierta] = React.useState(false)
  const [medidas, setMedidas] = React.useState({ ancho: 0, alto: 0 })

  const contenedor = React.useRef<HTMLDivElement>(null)
  const total = DIAPOSITIVAS.length

  /* ---------- Escalado del escenario ---------- */

  React.useLayoutEffect(() => {
    const el = contenedor.current
    if (!el) return
    const observador = new ResizeObserver((entradas) => {
      const caja = entradas[0]?.contentRect
      if (caja) setMedidas({ ancho: caja.width, alto: caja.height })
    })
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  const modo =
    medidas.ancho >= MIN_ANCHO_ESCENARIO && medidas.alto >= MIN_ALTO_ESCENARIO
      ? 'escenario'
      : 'flujo'

  const escala =
    modo === 'escenario'
      ? Math.min(medidas.ancho / ANCHO_ESCENARIO, medidas.alto / ALTO_ESCENARIO)
      : 1

  /* ---------- Navegación ---------- */

  const irA = React.useCallback(
    (destino: number) => {
      setIndice((actual) => {
        const siguiente = Math.max(0, Math.min(total - 1, destino))
        if (siguiente !== actual) setGrillaAbierta(false)
        return siguiente
      })
    },
    [total]
  )

  const siguiente = React.useCallback(() => irA(indice + 1), [indice, irA])
  const anterior = React.useCallback(() => irA(indice - 1), [indice, irA])

  /* Sincroniza el hash para poder compartir el link en una diapositiva concreta. */
  React.useEffect(() => {
    const desdeHash = () => {
      const id = window.location.hash.replace('#', '')
      const encontrado = DIAPOSITIVAS.findIndex((d) => d.id === id)
      if (encontrado >= 0) setIndice(encontrado)
    }
    desdeHash()
    window.addEventListener('hashchange', desdeHash)
    return () => window.removeEventListener('hashchange', desdeHash)
  }, [])

  React.useEffect(() => {
    const id = DIAPOSITIVAS[indice]?.id
    if (id && window.location.hash !== `#${id}`) {
      window.history.replaceState(null, '', `#${id}`)
    }
  }, [indice])

  /* ---------- Teclado ---------- */

  React.useEffect(() => {
    function alPresionar(evento: KeyboardEvent) {
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return
      if (esCampoDeTexto(evento.target)) return

      switch (evento.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          evento.preventDefault()
          siguiente()
          break
        case 'ArrowLeft':
        case 'PageUp':
          evento.preventDefault()
          anterior()
          break
        case 'Home':
          evento.preventDefault()
          irA(0)
          break
        case 'End':
          evento.preventDefault()
          irA(total - 1)
          break
        case 'g':
        case 'G':
          setGrillaAbierta((v) => !v)
          break
        case 'n':
        case 'N':
        case 'p':
        case 'P':
          setNotasAbiertas((v) => !v)
          break
        case 'f':
        case 'F':
          alternarPantallaCompleta()
          break
        case 'Escape':
          setGrillaAbierta(false)
          setNotasAbiertas(false)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [siguiente, anterior, irA, total])

  /* ---------- Gesto táctil ---------- */

  const tactil = React.useRef({ x: 0, y: 0 })

  function alTocar(evento: React.TouchEvent) {
    const t = evento.changedTouches[0]
    tactil.current = { x: t.clientX, y: t.clientY }
  }

  function alSoltar(evento: React.TouchEvent) {
    const t = evento.changedTouches[0]
    const dx = tactil.current.x - t.clientX
    const dy = tactil.current.y - t.clientY
    // Solo cuenta como cambio de diapositiva si el gesto es claramente horizontal:
    // así el scroll de lectura dentro de una diapositiva no salta de pantalla.
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.8) {
      if (dx > 0) siguiente()
      else anterior()
    }
  }

  function alternarPantallaCompleta() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        /* algunos navegadores lo bloquean sin gesto directo; no es crítico */
      })
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  const nota = SPEAKER_NOTES[indice]
  const progreso = ((indice + 1) / total) * 100

  return (
    <div className={cn(estilos.root, 'flex h-[100dvh] flex-col overflow-hidden bg-background')}>
      {/* ---------- Encabezado ---------- */}
      <header
        className={cn(
          estilos.chrome,
          'relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 sm:px-6'
        )}
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progreso}%` }}
          />
        </div>

        <button
          type="button"
          onClick={() => irA(0)}
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg sm:min-h-0"
          aria-label="Ir a la portada"
        >
          <BrandMark className="size-6 shrink-0 text-brand" />
          <span className="font-display text-[17px] font-semibold">Plotify</span>
          <span className="hidden truncate text-[12px] text-muted-foreground md:inline">
            · {DIAPOSITIVAS[indice].titulo}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="mr-1 hidden items-center gap-1 text-[11px] text-muted-foreground lg:flex">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              G
            </kbd>
            grilla
            <kbd className="ml-1.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              N
            </kbd>
            notas
          </span>

          <BotonTema className={BOTON_ICONO} />

          <Button
            variant={grillaAbierta ? 'secondary' : 'ghost'}
            size="icon-sm"
            className={BOTON_ICONO}
            onClick={() => setGrillaAbierta((v) => !v)}
            aria-label="Ver todas las diapositivas"
            title="Todas las diapositivas (G)"
          >
            <HugeiconsIcon icon={GridViewIcon} />
          </Button>

          <Button
            variant={notasAbiertas ? 'secondary' : 'ghost'}
            size="icon-sm"
            className={BOTON_ICONO}
            onClick={() => setNotasAbiertas((v) => !v)}
            aria-label="Notas del presentador"
            title="Notas del presentador (N)"
          >
            <HugeiconsIcon icon={Note01Icon} />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => window.print()}
            aria-label="Exportar a PDF"
            title="Exportar a PDF"
            className={cn(BOTON_ICONO, 'hidden sm:inline-flex')}
          >
            <HugeiconsIcon icon={PresentationBarChart01Icon} />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={alternarPantallaCompleta}
            aria-label="Pantalla completa"
            title="Pantalla completa (F)"
            className={cn(BOTON_ICONO, 'hidden sm:inline-flex')}
          >
            <HugeiconsIcon icon={Maximize01Icon} />
          </Button>
        </div>
      </header>

      {/* ---------- Diapositivas ---------- */}
      <main ref={contenedor} className={estilos.deck} onTouchStart={alTocar} onTouchEnd={alSoltar}>
        <AnimatedGridPattern
          numSquares={30}
          maxOpacity={0.08}
          duration={3}
          className={cn(
            estilos.chrome,
            'pointer-events-none absolute inset-0 h-full w-full skew-y-12 fill-foreground/8 stroke-foreground/8'
          )}
        />
        <div
          className={cn(
            modo === 'escenario' ? estilos.stageViewport : estilos.flowViewport,
            'transition-opacity duration-200'
          )}
          style={{ opacity: medidas.ancho === 0 ? 0 : 1 }}
        >
          <div
            className={cn(modo === 'escenario' ? estilos.stage : estilos.flow, 'relative')}
            style={modo === 'escenario' ? { transform: `scale(${escala})` } : undefined}
          >
            {DIAPOSITIVAS.map(({ id, Componente }, i) => (
              <section
                key={id}
                id={`diapositiva-${id}`}
                className={cn(estilos.slide, i === indice && estilos.slideActive)}
                aria-hidden={i !== indice}
                inert={i !== indice}
              >
                <Componente />
              </section>
            ))}
          </div>
        </div>
      </main>

      {/* ---------- Pie ---------- */}
      <footer
        className={cn(
          estilos.chrome,
          'relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] pt-2.5 sm:px-6'
        )}
      >
        <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{indice + 1}</span> / {total}
        </span>

        <div className="hidden min-w-0 items-center gap-1.5 md:flex">
          {DIAPOSITIVAS.map(({ id, titulo }, i) => (
            <button
              key={id}
              type="button"
              onClick={() => irA(i)}
              aria-label={`Ir a ${titulo}`}
              aria-current={i === indice}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === indice
                  ? 'w-6 bg-primary'
                  : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60'
              )}
            />
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className={BOTON_BARRA}
            onClick={anterior}
            disabled={indice === 0}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" />
            Anterior
          </Button>
          <Button
            size="sm"
            className={BOTON_BARRA}
            onClick={siguiente}
            disabled={indice === total - 1}
          >
            Siguiente
            <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
          </Button>
        </div>
      </footer>

      {/* ---------- Notas del presentador ---------- */}
      <aside
        aria-label="Notas del presentador"
        aria-hidden={!notasAbiertas}
        className={cn(
          estilos.chrome,
          'fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-3xl rounded-t-2xl bg-card shadow-2xl ring-1 ring-border transition-transform duration-300',
          notasAbiertas ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold">Notas del presentador</div>
            <div className="truncate text-[11.5px] text-muted-foreground">
              {indice + 1} de {total} · {DIAPOSITIVAS[indice].titulo}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className={BOTON_ICONO}
            onClick={() => setNotasAbiertas(false)}
            aria-label="Cerrar notas"
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </div>

        {nota ? (
          // En móvil el texto sube a 16px: son las notas que el presentador lee
          // de reojo mientras habla, no texto de lectura pausada.
          <div className="max-h-[46vh] space-y-3 overflow-y-auto px-5 py-4 text-[16px] leading-relaxed sm:text-[13px]">
            <section>
              <h3 className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                Objetivo
              </h3>
              <p className="mt-0.5 font-medium">{nota.objetivo}</p>
            </section>

            <section>
              <h3 className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                Qué decir
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {nota.puntos.map((punto) => (
                  <li key={punto}>{punto}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl bg-muted/60 px-3.5 py-2.5">
              <h3 className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                Si preguntan
              </h3>
              <p className="mt-0.5 font-semibold">{nota.objecion.pregunta}</p>
              <p className="mt-0.5 text-muted-foreground">{nota.objecion.respuesta}</p>
            </section>
          </div>
        ) : null}
      </aside>

      {/* ---------- Grilla de diapositivas ---------- */}
      {grillaAbierta ? (
        <div
          className={cn(
            estilos.chrome,
            'fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm'
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Todas las diapositivas"
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <span className="font-display text-lg font-semibold">Todas las diapositivas</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className={BOTON_ICONO}
              onClick={() => setGrillaAbierta(false)}
              aria-label="Cerrar"
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </div>

          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto px-5 pb-6 sm:grid-cols-3 lg:grid-cols-4">
            {DIAPOSITIVAS.map(({ id, titulo }, i) => (
              <button
                key={id}
                type="button"
                onClick={() => irA(i)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl px-3.5 py-3 text-left transition-colors',
                  i === indice ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
                )}
              >
                <span
                  className={cn(
                    'font-mono text-[11px] font-bold',
                    i === indice ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  )}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-display text-[14px] font-semibold text-balance">
                  {titulo}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
