'use client'

/**
 * Mockups de interfaz para la presentación.
 *
 * La versión anterior del deck ilustraba el producto con tres JPG generados por
 * IA que mostraban otros productos ("TERRA Chile", "TierraValor Desarrollo",
 * "legaltechform.com"), en inglés y con texto ilegible. Aquí la interfaz se
 * dibuja con el design system real de Plotify: queda nítida en cualquier
 * proyector, es responsiva, se imprime bien y dice lo que el producto dice.
 */

import * as React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Download01Icon,
  FlashIcon,
  Location01Icon,
  SquareLock01Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import {
  CBR_INSCRIPCION,
  COMPRADOR_DEMO,
  LOTE_DEMO,
  PROYECTO_DEMO,
  metros,
  fichaParaWhatsApp,
  m2,
  clp,
} from './deck-data'
import { NOMBRE_ARCHIVO_MINUTA, generarMinutaDocx } from './minuta-docx'

/* ------------------------------------------------------------------ *
 * Panel de Detalles del lote
 *
 * Espeja `components/projects/viewer/LotInfoView`: encabezado, hero con el
 * número de lote y su estado, pestañas General/Legal, tarjetas de Superficie
 * (con el desglose Ancho / Servidumbre / Sup. Neta útil) y Precio, y el botón
 * de reserva. Se agrega el bloque de deslindes porque es el argumento de esta
 * diapositiva; en el producto vive en la pestaña Legal.
 * ------------------------------------------------------------------ */

export function FichaParcelaMockup() {
  async function copiar() {
    const texto = fichaParaWhatsApp()
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Ficha copiada', {
        description: 'Pégala en WhatsApp: llega con deslindes y antecedentes legales.',
        position: 'top-center',
      })
    } catch {
      toast.error('No se pudo copiar', {
        description: 'El navegador bloqueó el portapapeles. Prueba con permisos de sitio.',
        position: 'top-center',
      })
    }
  }

  return (
    <div className="rounded-2xl bg-card p-4 shadow-lg ring-1 ring-border/60">
      {/* Encabezado del panel */}
      <div className="flex items-center gap-2.5 pb-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <HugeiconsIcon icon={Location01Icon} className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[15px] font-semibold leading-tight">Detalles</div>
          <div className="truncate text-[11px] text-muted-foreground">Información del lote</div>
        </div>
      </div>

      {/* Hero: número de lote + estado */}
      <div className="rounded-xl bg-primary/8 py-3.5 text-center ring-1 ring-primary/15">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Lote
        </div>
        <div className="font-display text-[34px] font-semibold leading-none text-primary">
          {LOTE_DEMO.numero}
        </div>
        <StatusBadge variant="available" className="mt-2">
          Disponible
        </StatusBadge>
      </div>

      {/* Pestañas */}
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        <span className="rounded-lg bg-card py-1.5 text-center text-[12px] font-medium shadow-xs">
          General
        </span>
        <span className="rounded-lg py-1.5 text-center text-[12px] font-medium text-muted-foreground">
          Legal
        </span>
      </div>

      {/* Superficie + Precio */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-muted/60 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Superficie
          </div>
          <div className="font-display text-[19px] font-bold tabular-nums">
            {m2(LOTE_DEMO.superficieTotalM2)}
          </div>
          <p className="text-[10px] text-success">Oficial verificado</p>

          <dl className="mt-2 space-y-0.5 border-t border-border/60 pt-2 text-[10.5px]">
            <div className="flex justify-between text-muted-foreground">
              <dt>Ancho:</dt>
              <dd className="tabular-nums">{metros(LOTE_DEMO.servidumbreAnchoM)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Servidumbre:</dt>
              <dd className="tabular-nums">−{m2(LOTE_DEMO.servidumbreM2)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>Sup. Neta útil:</dt>
              <dd className="tabular-nums">{m2(LOTE_DEMO.superficieUtilM2)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col rounded-xl bg-muted/60 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Precio
          </div>
          <div className="font-display text-[19px] font-bold tabular-nums">
            {clp(LOTE_DEMO.precioClp)}
          </div>
          <p className="text-[10px] text-muted-foreground">
            <span className="text-primary">Reserva:</span> {clp(LOTE_DEMO.reservaClp)}
          </p>

          <div className="mt-auto space-y-0.5 border-t border-border/60 pt-2 text-[10.5px] text-muted-foreground">
            <div className="flex justify-between">
              <span>Rol SII:</span>
              <span className="font-mono">{PROYECTO_DEMO.rolMatriz}</span>
            </div>
            <div className="flex justify-between">
              <span>SAG:</span>
              <span className="font-mono">N° {PROYECTO_DEMO.resolucionSag}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Deslindes (pestaña Legal en el producto) */}
      <div className="mt-2.5 rounded-xl bg-muted/60 p-3">
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Deslindes Oficiales Matemáticos
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          {LOTE_DEMO.deslindes.map((d) => (
            <div key={d.rumbo} className="flex items-baseline gap-1.5 text-[11px] leading-snug">
              <dt className="shrink-0 font-semibold">{d.rumbo}</dt>
              <dd className="min-w-0 text-muted-foreground">
                <span className="font-mono tabular-nums text-foreground">
                  {d.metros.toLocaleString('es-CL', { minimumFractionDigits: 2 })} m
                </span>{' '}
                con {d.colinda}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={copiar}>
          <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" />
          Copiar Ficha
        </Button>
        <Button size="sm">Solicitar Reserva</Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Carpeta legal del proyecto
 * ------------------------------------------------------------------ */

const DOCUMENTOS_LEGALES = [
  {
    titulo: 'Inscripción de Dominio CBR',
    detalle: `${CBR_INSCRIPCION} · ${PROYECTO_DEMO.cbrConservador}`,
    estado: 'Vigente',
  },
  {
    titulo: 'Resolución SAG de Subdivisión',
    detalle: `Certificado N° ${PROYECTO_DEMO.resolucionSag} · ${PROYECTO_DEMO.totalLotes} lotes aprobados`,
    estado: 'Aprobada',
  },
  {
    titulo: 'Certificado de Hipotecas y Gravámenes',
    detalle: 'Sin gravámenes, prohibiciones ni litigios pendientes',
    estado: 'Limpio',
  },
  {
    titulo: 'Historia de Dominio de 10 Años',
    detalle: 'Cadena de títulos completa, revisada por el abogado del proyecto',
    estado: 'Revisada',
  },
  {
    titulo: 'Rol Matriz de Avalúo SII',
    detalle: `Rol matriz ${PROYECTO_DEMO.rolMatriz} · roles individuales en trámite`,
    estado: 'En trámite',
  },
] as const

export function CarpetaLegalMockup() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-lg ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="font-display text-xl font-semibold">Carpeta Legal del Proyecto</div>
        <StatusBadge variant="available">Títulos Vigentes</StatusBadge>
      </div>

      <ul className="flex flex-col gap-2">
        {DOCUMENTOS_LEGALES.map((doc) => (
          <li
            key={doc.titulo}
            className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3.5 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-medium">{doc.titulo}</div>
              <div className="truncate text-[12.5px] text-muted-foreground">{doc.detalle}</div>
            </div>
            <StatusBadge
              variant={doc.estado === 'En trámite' ? 'warning' : 'success'}
              className="shrink-0"
            >
              {doc.estado}
            </StatusBadge>
          </li>
        ))}
      </ul>

      <p className="mt-3.5 text-[13.5px] text-muted-foreground">
        Disponible en 1 toque en la app móvil de cada vendedor, para las {PROYECTO_DEMO.totalLotes}{' '}
        parcelas del proyecto.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Mini App de Telegram — demostración interactiva
 * ------------------------------------------------------------------ */

export function MiniAppMockup() {
  const [estado, setEstado] = React.useState<'inicial' | 'cargando' | 'reservado'>('inicial')
  const temporizador = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current)
    }
  }, [])

  function reservar() {
    if (estado !== 'inicial') return
    setEstado('cargando')
    temporizador.current = setTimeout(() => {
      setEstado('reservado')
      toast.success(`${LOTE_DEMO.etiqueta} bloqueado`, {
        description: 'Nadie más del equipo puede reservarlo. Aviso enviado a aprobación.',
        position: 'top-center',
      })
    }, 850)
  }

  return (
    <div className="flex justify-center">
      <div className="relative flex h-[548px] w-[306px] shrink-0 flex-col overflow-hidden rounded-[34px] bg-[#0f1117] p-1 shadow-2xl ring-4 ring-[#282c37]">
        {/* Barra de Telegram */}
        <div className="flex shrink-0 items-center justify-between rounded-t-[30px] bg-[#17212b] px-3 pb-2 pt-3">
          <span className="text-[11px] font-medium text-[#64b5f6]">‹ Cerrar</span>
          <div className="text-center">
            <div className="text-[12px] font-semibold leading-tight text-white">Plotify</div>
            <div className="text-[9px] text-[#708499]">bot · mini app</div>
          </div>
          <span className="text-[13px] leading-none text-[#708499]">•••</span>
        </div>

        {/* Pantalla */}
        <div className="relative flex flex-1 flex-col gap-2 overflow-hidden bg-[#0d0f14] p-2.5">
          <div className="flex items-center justify-between">
            <span className="truncate text-[11.5px] font-semibold text-white">
              {PROYECTO_DEMO.nombre}
            </span>
            <span className="shrink-0 rounded-md bg-[#22c55e]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#4ade80]">
              EN VIVO
            </span>
          </div>

          <div className="rounded-xl bg-[#151821] p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-display text-[15px] font-bold text-white">
                  {LOTE_DEMO.etiqueta.toUpperCase()}
                </div>
                <div className="truncate text-[10px] text-[#94a3b8]">
                  {m2(LOTE_DEMO.superficieTotalM2)} totales · {m2(LOTE_DEMO.superficieUtilM2)}{' '}
                  útiles
                </div>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold transition-colors',
                  estado === 'reservado'
                    ? 'bg-[#f59e0b]/20 text-[#fcd34d]'
                    : 'bg-[#22c55e]/20 text-[#6ee7a8]'
                )}
              >
                {estado === 'reservado' ? 'RESERVADO' : 'DISPONIBLE'}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-lg bg-black/30 p-1.5">
              {[
                ['Rol SII', PROYECTO_DEMO.rolMatriz],
                ['SAG', `N° ${PROYECTO_DEMO.resolucionSag}`],
                ['Precio', clp(LOTE_DEMO.precioClp)],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta} className="min-w-0">
                  <div className="text-[8px] font-semibold uppercase text-[#708499]">
                    {etiqueta}
                  </div>
                  <div className="truncate font-mono text-[10px] font-bold text-[#e2e8f0]">
                    {valor}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-[#151821] p-2.5">
            <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-[#708499]">
              Datos de Reserva en Terreno
            </div>
            {[
              ['RUT', COMPRADOR_DEMO.rut],
              ['Cliente', COMPRADOR_DEMO.nombre],
            ].map(([etiqueta, valor]) => (
              <div
                key={etiqueta}
                className="mb-1 flex items-center gap-2 rounded-md bg-black/35 px-2 py-1.5 last:mb-0"
              >
                <span className="w-11 shrink-0 font-mono text-[8.5px] font-bold uppercase text-[#708499]">
                  {etiqueta}
                </span>
                <span className="truncate text-[10.5px] font-semibold text-white">{valor}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto">
            <button
              type="button"
              onClick={reservar}
              disabled={estado !== 'inicial'}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-b from-[#2ea6ff] to-[#1c7cd6] px-3 py-2.5 text-[12px] font-bold text-white shadow-lg transition hover:brightness-110 disabled:cursor-default"
            >
              {estado === 'cargando' ? (
                <>
                  <Spinner className="size-3.5" />
                  Bloqueando…
                </>
              ) : estado === 'reservado' ? (
                <>
                  <HugeiconsIcon icon={SquareLock01Icon} className="size-3.5" />
                  {LOTE_DEMO.etiqueta} reservado
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={FlashIcon} className="size-3.5" />
                  Bloquear y Reservar {LOTE_DEMO.etiqueta}
                </>
              )}
            </button>
            <div className="mt-1.5 text-center text-[9px] text-[#708499]">
              {estado === 'inicial'
                ? 'Haz clic: simula 1 toque en terreno con bloqueo atómico'
                : 'Demostración · ningún dato real fue modificado'}
            </div>
          </div>

          {/* Confirmación */}
          <div
            className={cn(
              'absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0b0e14]/96 p-4 text-center backdrop-blur-sm transition-all duration-300',
              estado === 'reservado'
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-4 opacity-0'
            )}
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              className="size-11 text-[#4ade80]"
              aria-hidden
            />
            <div className="font-display text-[15px] font-bold text-white">
              ¡Reserva Atómica Exitosa!
            </div>
            <p className="text-[10.5px] leading-snug text-[#94a3b8]">
              <span className="font-semibold text-[#4ade80]">
                {LOTE_DEMO.etiqueta.toUpperCase()} BLOQUEADO
              </span>{' '}
              para todo el equipo en tiempo real. Notificación enviada al Administrador para
              aprobación y minuta.
            </p>
            <div className="rounded-md bg-white/5 px-2 py-1 font-mono text-[9px] text-[#94a3b8]">
              Tiempo: 0,8 s · Cero Doble Venta
            </div>
            <button
              type="button"
              onClick={() => setEstado('inicial')}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/20"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
              Probar de nuevo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Centro de mando del dueño
 * ------------------------------------------------------------------ */

const BANDEJA_APROBACION = [
  {
    lote: 'Lote 14',
    comprador: 'V. Edwards M.',
    vendedor: 'C. Fuentes',
    clp: 50000000,
    minutos: 2,
  },
  {
    lote: 'Lote 19',
    comprador: 'J. Contreras P.',
    vendedor: 'M. Salas',
    clp: 51000000,
    minutos: 24,
  },
  {
    lote: 'Lote 23',
    comprador: 'A. Riquelme O.',
    vendedor: 'C. Fuentes',
    clp: 47800000,
    minutos: 71,
  },
] as const

export function CentroMandoMockup() {
  const avance = Math.round((PROYECTO_DEMO.lotesVendidos / PROYECTO_DEMO.totalLotes) * 100)

  return (
    <div className="rounded-2xl bg-card p-4 shadow-lg ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-semibold">
            Panel de Control Ejecutivo
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {PROYECTO_DEMO.nombre} · {PROYECTO_DEMO.comuna}
          </div>
        </div>
        <StatusBadge variant="info">En vivo</StatusBadge>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { etiqueta: 'Total Parcelas', valor: String(PROYECTO_DEMO.totalLotes) },
          { etiqueta: 'Vendidas', valor: `${avance}%`, destacado: true },
          { etiqueta: 'Reservas Activas', valor: String(PROYECTO_DEMO.reservasActivas) },
          { etiqueta: 'Minutas Emitidas', valor: String(PROYECTO_DEMO.minutasEmitidas) },
        ].map((kpi) => (
          <div
            key={kpi.etiqueta}
            className={cn(
              'rounded-xl px-3.5 py-3',
              kpi.destacado ? 'bg-primary text-primary-foreground' : 'bg-muted/60'
            )}
          >
            <div
              className={cn(
                'text-[10px] uppercase tracking-wide',
                kpi.destacado ? 'text-primary-foreground/75' : 'text-muted-foreground'
              )}
            >
              {kpi.etiqueta}
            </div>
            <div className="font-display text-[30px] font-semibold tabular-nums">{kpi.valor}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="text-[14px] font-semibold">Bandeja de Aprobación</div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {BANDEJA_APROBACION.length} pendientes
        </span>
      </div>

      <div className="mt-1.5 flex flex-col gap-1.5">
        {BANDEJA_APROBACION.map((fila) => (
          <div
            key={fila.lote}
            className="flex items-center gap-3 rounded-xl bg-muted/60 px-3.5 py-2.5"
          >
            <span className="w-[70px] shrink-0 font-mono text-[13px] font-semibold">
              {fila.lote}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium">{fila.comprador}</div>
              <div className="truncate text-[11.5px] text-muted-foreground">
                Vendedor: {fila.vendedor} · hace {fila.minutos} min
              </div>
            </div>
            <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums">
              {clp(fila.clp)}
            </span>
            <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[10.5px] font-semibold text-primary-foreground">
              Aprobar
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Mesa de escrituración
 * ------------------------------------------------------------------ */

const VARIABLES_INYECTADAS = [
  { campo: 'Comprador', valor: `${COMPRADOR_DEMO.nombre} · ${COMPRADOR_DEMO.rut}` },
  { campo: 'Inmueble', valor: `${LOTE_DEMO.etiqueta} · ${m2(LOTE_DEMO.superficieTotalM2)}` },
  { campo: 'Superficie útil', valor: m2(LOTE_DEMO.superficieUtilM2) },
  { campo: 'Deslindes', valor: 'Los 4 rumbos, calculados del plano' },
  { campo: 'Títulos', valor: CBR_INSCRIPCION },
  { campo: 'Subdivisión', valor: `Resolución SAG N° ${PROYECTO_DEMO.resolucionSag}` },
  { campo: 'Precio', valor: `${clp(LOTE_DEMO.precioClp)}, expresado en palabras` },
] as const

export function MesaEscrituracionMockup() {
  const [generando, setGenerando] = React.useState(false)

  async function descargar() {
    if (generando) return
    setGenerando(true)
    try {
      const blob = await generarMinutaDocx()
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = NOMBRE_ARCHIVO_MINUTA
      document.body.appendChild(enlace)
      enlace.click()
      document.body.removeChild(enlace)
      URL.revokeObjectURL(url)
      toast.success('Minuta descargada', {
        description: `${NOMBRE_ARCHIVO_MINUTA} — ábrela en Word, es un .docx real y editable.`,
        position: 'top-center',
      })
    } catch {
      toast.error('No se pudo generar la minuta', { position: 'top-center' })
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="rounded-2xl bg-card p-4 shadow-lg ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="font-display text-lg font-semibold">Mesa de Escrituración</div>
        <StatusBadge variant="success">Antecedentes Completos</StatusBadge>
      </div>

      <div className="grid grid-cols-[1fr_1.1fr] gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Variables Inyectadas
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {VARIABLES_INYECTADAS.map((v) => (
              <li key={v.campo} className="rounded-lg bg-muted/60 px-3 py-2">
                <div className="text-[9.5px] uppercase tracking-wide text-muted-foreground">
                  {v.campo}
                </div>
                <div className="truncate text-[12.5px] font-medium">{v.valor}</div>
              </li>
            ))}
          </ul>
        </div>

        {/* Vista previa del documento: la única serif del producto, igual que en la mesa real */}
        <div className="overflow-hidden rounded-lg bg-white px-4 py-3 text-[#1a1a1a] shadow-inner ring-1 ring-black/10">
          <div className="text-center font-serif text-[12px] font-bold uppercase tracking-wide">
            Promesa de compraventa
          </div>
          <div className="mt-2.5 space-y-2 font-serif text-[9.5px] leading-[1.55] text-justify">
            <p>
              <span className="font-bold">PRIMERO: De la comparecencia.</span> Comparecen, por una
              parte, el promitente vendedor, y por la otra doña{' '}
              <span className="font-bold">{COMPRADOR_DEMO.nombre}</span>, cédula nacional de
              identidad N° {COMPRADOR_DEMO.rut}, en adelante la promitente compradora.
            </p>
            <p>
              <span className="font-bold">SEGUNDO: Del inmueble y sus deslindes.</span> El{' '}
              {LOTE_DEMO.etiqueta} del proyecto «{PROYECTO_DEMO.nombre}», comuna de{' '}
              {PROYECTO_DEMO.comuna}, de una superficie total de {m2(LOTE_DEMO.superficieTotalM2)},
              de los cuales {m2(LOTE_DEMO.servidumbreM2)} corresponden a servidumbre de tránsito,
              resultando una superficie útil de{' '}
              <span className="font-bold">{m2(LOTE_DEMO.superficieUtilM2)}</span>. Deslinda:{' '}
              {LOTE_DEMO.deslindes
                .slice(0, 2)
                .map(
                  (d) =>
                    `${d.rumbo}, en ${d.metros.toLocaleString('es-CL', { minimumFractionDigits: 2 })} metros con ${d.colinda}`
                )
                .join('; ')}
              …
            </p>
            <p>
              <span className="font-bold">TERCERO: De los títulos.</span> Inscrito a{' '}
              {CBR_INSCRIPCION} del Registro de Propiedad del {PROYECTO_DEMO.cbrConservador}.
            </p>
          </div>
        </div>
      </div>

      <Button onClick={descargar} disabled={generando} className="mt-3 w-full" size="sm">
        {generando ? (
          <Spinner className="size-4" data-icon="inline-start" />
        ) : (
          <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
        )}
        {generando ? 'Generando…' : 'Descargar Minuta Word (.docx) Lista para Notaría'}
      </Button>
    </div>
  )
}
