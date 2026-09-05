'use client'

import * as React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  Alert02Icon,
  AnalyticsUpIcon,
  Calendar01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  EyeIcon,
  FlashIcon,
  LegalDocument01Icon,
  Location01Icon,
  RulerIcon,
  SecurityCheckIcon,
  Share08Icon,
  SignatureIcon,
  SmartPhone01Icon,
  SquareLock01Icon,
  Tick02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'

import { cn } from '@/lib/utils'
import estilos from './deck.module.css'
import {
  CarpetaLegalMockup,
  CentroMandoMockup,
  FichaParcelaMockup,
  MesaEscrituracionMockup,
  MiniAppMockup,
} from './mockups'
import { VisorPresentacion } from './visor-presentacion'
import { LOTE_DEMO, m2 } from './deck-data'

/* ------------------------------------------------------------------ *
 * Piezas compartidas
 * ------------------------------------------------------------------ */

function Bloque({
  orden = 0,
  className,
  children,
}: {
  orden?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(estilos.stagger, className)}
      style={{ '--stagger-index': orden } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

function Antetitulo({
  children,
  tono = 'primary',
}: {
  children: React.ReactNode
  tono?: 'primary' | 'destructive'
}) {
  return (
    <div
      className={cn(
        estilos.eyebrow,
        estilos.stagger,
        'mb-2 flex items-center gap-2',
        tono === 'destructive'
          ? 'text-destructive'
          : 'text-[color:var(--acento-en-lamina,var(--primary))]'
      )}
      style={{ '--stagger-index': 0 } as React.CSSProperties}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </div>
  )
}

function Titulo({ children, compacto }: { children: React.ReactNode; compacto?: boolean }) {
  return (
    <h2
      className={cn(
        compacto ? estilos.headlineSm : estilos.headline,
        estilos.stagger,
        'font-display text-balance'
      )}
      style={{ '--stagger-index': 1 } as React.CSSProperties}
    >
      {children}
    </h2>
  )
}

function Bajada({ children }: { children: React.ReactNode }) {
  return (
    <p
      className={cn(estilos.lead, estilos.stagger, 'mt-3 text-pretty text-muted-foreground')}
      style={{ '--stagger-index': 2 } as React.CSSProperties}
    >
      {children}
    </p>
  )
}

function Tarjeta({
  icono,
  tono = 'neutral',
  sobretitulo,
  titulo,
  children,
  orden = 3,
  destacada,
}: {
  icono?: IconSvgElement
  tono?: 'neutral' | 'destructive' | 'warning' | 'info' | 'success'
  sobretitulo?: string
  titulo: string
  children: React.ReactNode
  orden?: number
  destacada?: boolean
}) {
  const tonoIcono = {
    neutral: 'bg-muted text-foreground',
    destructive: 'bg-destructive/10 text-destructive',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-info/10 text-info',
    success: 'bg-success/10 text-success',
  }[tono]

  return (
    <Bloque
      orden={orden}
      className={cn(
        'flex flex-col rounded-2xl p-5 shadow-sm',
        destacada ? 'bg-primary text-primary-foreground' : 'bg-card'
      )}
    >
      {icono ? (
        <span
          className={cn(
            'mb-3 inline-flex size-10 items-center justify-center rounded-xl',
            destacada ? 'bg-primary-foreground/15 text-primary-foreground' : tonoIcono
          )}
        >
          <HugeiconsIcon icon={icono} className="size-5" aria-hidden />
        </span>
      ) : null}
      {sobretitulo ? (
        <div
          className={cn(
            'mb-1 font-mono text-[11.5px] font-bold uppercase tracking-wide',
            destacada ? 'text-primary-foreground/70' : 'text-primary'
          )}
        >
          {sobretitulo}
        </div>
      ) : null}
      <div className="font-display text-[19px] font-semibold leading-tight text-balance">
        {titulo}
      </div>
      <div
        className={cn(
          estilos.cuerpo,
          'mt-1.5 text-[15px] leading-snug text-pretty',
          destacada ? 'text-primary-foreground' : 'text-muted-foreground'
        )}
      >
        {children}
      </div>
    </Bloque>
  )
}

function Beneficio({
  orden,
  titulo,
  children,
  icono = Tick02Icon,
}: {
  orden: number
  titulo: string
  children: React.ReactNode
  icono?: IconSvgElement
}) {
  return (
    <Bloque orden={orden} className="flex items-start gap-3 rounded-xl bg-card px-4 py-3 shadow-sm">
      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <HugeiconsIcon icon={icono} className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[15.5px] font-semibold leading-tight text-balance">{titulo}</div>
        <div
          className={cn(
            estilos.cuerpo,
            'text-[14px] leading-snug text-pretty text-muted-foreground'
          )}
        >
          {children}
        </div>
      </div>
    </Bloque>
  )
}

/* ------------------------------------------------------------------ *
 * 1 · Portada
 * ------------------------------------------------------------------ */

function Portada() {
  return (
    <>
      <Antetitulo>La Solución Integral de Gestión y Ventas</Antetitulo>
      <h1
        className={cn(estilos.headline, estilos.stagger, 'max-w-[24ch] font-display text-balance')}
        style={{ '--stagger-index': 1 } as React.CSSProperties}
      >
        Vende más rápido, controla tu inventario en tiempo real y{' '}
        <span className="text-primary">automatiza tus contratos legales</span>.
      </h1>
      <Bajada>
        Plotify es la plataforma diseñada exclusivamente para dueños, administradores y
        desarrolladores de parcelaciones en Chile: conecta tus planos KMZ y tu Estudio de Título con
        tus vendedores en terreno, generando promesas y escrituras al instante.
      </Bajada>

      <div className={cn(estilos.grid3, 'mt-6')}>
        <Tarjeta orden={3} icono={Location01Icon} titulo="Masterplan Satelital en Vivo" destacada>
          Tus clientes y vendedores ven qué parcelas están libres o reservadas en tiempo real sobre
          el mapa satelital.
        </Tarjeta>
        <Tarjeta orden={4} icono={SmartPhone01Icon} titulo="Ventas en Terreno (Telegram)">
          Tus ejecutivos reservan parcelas con RUT en 30 segundos directo en su celular con el
          Estudio de Título a mano.
        </Tarjeta>
        <Tarjeta orden={5} icono={LegalDocument01Icon} titulo="Escrituración en 2 Minutos">
          Generación automática de minutas y promesas en Word (.docx) con estudio de título y
          deslindes matemáticos.
        </Tarjeta>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * 2 · El dolor del negocio
 * ------------------------------------------------------------------ */

function Dolor() {
  return (
    <>
      <Antetitulo tono="destructive">La Realidad del Mercado</Antetitulo>
      <Titulo>Las 3 grandes fugas de dinero y tiempo en un loteo</Titulo>
      <Bajada>
        La gestión tradicional con planillas Excel, grupos de WhatsApp y redacción manual de
        contratos frena las ventas y genera costos millonarios.
      </Bajada>

      <div className={cn(estilos.grid3, 'mt-6')}>
        <Tarjeta
          orden={3}
          icono={Alert02Icon}
          tono="destructive"
          titulo="Ventas a Ciegas y Doble Venta"
        >
          Vendedores llamando o enviando WhatsApp: <em>«¿sigue libre el lote 14?»</em> mientras
          están con un cliente interesado. La falta de certeza hace perder cierres o provoca la peor
          pesadilla comercial:{' '}
          <strong className="text-foreground">vender la misma parcela dos veces</strong>.
        </Tarjeta>
        <Tarjeta orden={4} icono={RulerIcon} tono="warning" titulo="Rechazos en Notaría y CBR">
          Los deslindes y medidas se transcriben a mano. Un error en un punto cardinal (Norte vs
          Sur) o una discrepancia de centímetros con el plano del SAG hace rebotar la inscripción en
          el Conservador, congelando los pagos de los compradores.
        </Tarjeta>
        <Tarjeta orden={5} icono={Clock01Icon} tono="info" titulo="Semanas de Espera con Abogados">
          Redactar cada promesa toma semanas de tipeo repetitivo. Para cuando el contrato está
          listo, el comprador se enfrió o surgieron dudas. Cada venta cerrada debería formalizarse
          de inmediato.
        </Tarjeta>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * 3 · Visor KMZ satelital
 * ------------------------------------------------------------------ */

function Masterplan() {
  const [modo, setModo] = React.useState<'vendedor' | 'admin'>('vendedor')

  return (
    <div className={estilos.split}>
      <div>
        <Antetitulo>Visualización y Geometría</Antetitulo>
        <Titulo compacto>El Mapa Interactivo para Vendedores y Administradores</Titulo>
        <Bajada>
          Plotify transforma tu archivo KMZ en un visor interactivo adaptado a cada rol del equipo.
          Certeza total desde el computador o en el terreno.
        </Bajada>

        <Bloque orden={3} className="mt-3 inline-flex gap-1 rounded-xl bg-muted p-1">
          {(
            [
              ['vendedor', 'Vista Vendedor (Terreno)'],
              ['admin', 'Vista Dueño / Admin (Consola)'],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setModo(valor)}
              aria-pressed={modo === valor}
              className={cn(
                'rounded-lg px-3.5 py-2 text-[14px] font-semibold transition-colors',
                modo === valor
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {etiqueta}
            </button>
          ))}
        </Bloque>

        <div className="mt-3 flex flex-col gap-2">
          {modo === 'vendedor' ? (
            <>
              <Beneficio
                orden={4}
                titulo="Para el Vendedor (Terreno / Celular)"
                icono={SmartPhone01Icon}
              >
                Mapa ágil y ligero. Ve disponibilidad en tiempo real (verde/ámbar/gris), medidas,
                servidumbres y reserva con 1 toque.
              </Beneficio>
              <Beneficio
                orden={5}
                titulo="Trazado Exacto de Servidumbres y Caminos"
                icono={Location01Icon}
              >
                Transparencia total para el comprador: reconoce accesos de 3 y 6 metros, áreas
                verdes y geometría real.
              </Beneficio>
              <Beneficio
                orden={6}
                titulo="Disponibilidad Sin Llamadas de Confirmación"
                icono={EyeIcon}
              >
                El estado de cada parcela se actualiza en vivo al segundo para todo el equipo.
              </Beneficio>
            </>
          ) : (
            <>
              <Beneficio
                orden={4}
                titulo="Para el Administrador y Dueño (Oficina / Panel Web)"
                icono={AnalyticsUpIcon}
              >
                Control total: fija precios por etapa, asigna parcelas exclusivas a corredores,
                supervisa quién tiene reservado cada lote y audita ventas.
              </Beneficio>
              <Beneficio orden={5} titulo="Gestión de Corredores Externos" icono={UserGroupIcon}>
                Asigna a tus vendedores o corredores asociados solo a los proyectos que tienen
                autorizados vender, protegiendo tu información.
              </Beneficio>
              <Beneficio
                orden={6}
                titulo="Auditoría y Trazabilidad Notarial"
                icono={SecurityCheckIcon}
              >
                Registro histórico inmutable de quién vendió, a qué hora y qué comprador reservó
                cada parcela.
              </Beneficio>
            </>
          )}
        </div>
      </div>

      <Bloque orden={3}>
        <VisorPresentacion modo={modo} />
      </Bloque>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 4 · Ficha técnica de la parcela
 * ------------------------------------------------------------------ */

function Ficha() {
  return (
    <div className={estilos.splitReverse}>
      <Bloque orden={3}>
        <FichaParcelaMockup />
      </Bloque>

      <div>
        <Antetitulo>Certeza Jurídica y Técnica</Antetitulo>
        <Titulo compacto>La Ficha de la Parcela: Información completa en 1 clic</Titulo>
        <Bajada>
          Cada lote tiene su radiografía legal y física lista para presentar al comprador. No más
          búsquedas en carpetas ni dudas sobre los metros cuadrados reales.
        </Bajada>

        <div className="mt-3 flex flex-col gap-2">
          <Beneficio orden={4} titulo="Deslindes Automáticos Sin Error Humano" icono={RulerIcon}>
            El sistema calcula los linderos exactos midiendo directamente la geometría, evitando
            reclamos vecinales o rechazos notariales.
          </Beneficio>
          <Beneficio
            orden={5}
            titulo="Superficie Útil vs Servidumbre Desglosada"
            icono={Tick02Icon}
          >
            Claridad absoluta para el comprador sobre cuántos metros puede construir y cuánto
            corresponde a caminos: {m2(LOTE_DEMO.superficieTotalM2)} totales menos{' '}
            {m2(LOTE_DEMO.servidumbreM2)} de servidumbre son {m2(LOTE_DEMO.superficieUtilM2)}{' '}
            útiles.
          </Beneficio>
          <Beneficio
            orden={6}
            titulo="Ficha Comercial para Enviar por WhatsApp"
            icono={Share08Icon}
          >
            Tus vendedores pueden compartir la ficha con medidas, deslindes, antecedentes legales y
            precio al prospecto en segundos.
          </Beneficio>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 5 · Estudio de títulos digital
 * ------------------------------------------------------------------ */

function Titulos() {
  return (
    <div className={estilos.split}>
      <div>
        <Antetitulo>Seguridad Jurídica Total</Antetitulo>
        <Titulo compacto>Estudio de Títulos Digital: Tus vendedores cierran con certeza</Titulo>
        <Bajada>
          El comprador de parcelas siempre pregunta: <em>«¿están los papeles al día?»</em>. Con
          Plotify, tus vendedores llevan el Estudio de Título en su celular para exhibirlo o
          compartirlo en el instante.
        </Bajada>

        <div className="mt-3 flex flex-col gap-2">
          <Beneficio
            orden={4}
            titulo="Estudio de Títulos Integrado al Proyecto"
            icono={LegalDocument01Icon}
          >
            Carga la historia de dominio de 10 años, inscripciones del CBR, certificados de
            hipotecas y gravámenes (GP) y resoluciones SAG.
          </Beneficio>
          <Beneficio
            orden={5}
            titulo="Entrega Inmediata al Comprador en Terreno"
            icono={SmartPhone01Icon}
          >
            El vendedor puede enviar el informe de títulos al WhatsApp del cliente mientras recorren
            el predio, disipando cualquier desconfianza al instante.
          </Beneficio>
          <Beneficio
            orden={6}
            titulo="Alimento Directo para la Escritura Notarial"
            icono={SignatureIcon}
          >
            Las fojas, números, años, CBR y personerías del Estudio de Título se transfieren
            automáticamente a la cláusula de títulos de la escritura.
          </Beneficio>
        </div>
      </div>

      <Bloque orden={3}>
        <CarpetaLegalMockup />
      </Bloque>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 6 · Telegram Mini App
 * ------------------------------------------------------------------ */

function MiniApp() {
  return (
    <div className={estilos.split}>
      <div>
        <Antetitulo>Fuerza de Ventas en Terreno</Antetitulo>
        <Titulo compacto>Tu inventario en el celular de cada vendedor</Titulo>
        <Bajada>
          La decisión de compra se toma caminando sobre la parcela. Plotify funciona directo en
          Telegram, sin descargar aplicaciones ni recordar contraseñas.
        </Bajada>

        <div className="mt-3 flex flex-col gap-2">
          <Beneficio orden={4} titulo="Reserva Inmediata con RUT en 30 Segundos" icono={FlashIcon}>
            El vendedor selecciona el lote junto al cliente, ingresa su RUT y solicita la reserva.
            El lote se bloquea al instante para todo el equipo.
          </Beneficio>
          <Beneficio orden={5} titulo="Fin de las Llamadas a la Oficina" icono={SquareLock01Icon}>
            El vendedor ya no necesita preguntar si una parcela está disponible; el mapa se
            actualiza en vivo al segundo. Si dos vendedores reservan a la vez, uno gana y el otro
            recibe aviso inmediato.
          </Beneficio>
          <Beneficio orden={6} titulo="Gestión de Corredores Externos" icono={UserGroupIcon}>
            Asigna a tus vendedores o corredores asociados solo a los proyectos que tienen
            autorizados vender, protegiendo tu información.
          </Beneficio>
        </div>
      </div>

      <Bloque orden={3}>
        <MiniAppMockup />
      </Bloque>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 7 · Centro de mando
 * ------------------------------------------------------------------ */

function CentroMando() {
  return (
    <div className={estilos.splitReverse}>
      <Bloque orden={3}>
        <CentroMandoMockup />
      </Bloque>

      <div>
        <Antetitulo>Control Ejecutivo y Gerencial</Antetitulo>
        <Titulo compacto>Centro de Mando: Tú apruebas, tú tienes el control</Titulo>
        <Bajada>
          Desde tu computador o teléfono puedes supervisar el avance comercial del loteo, validar
          reservas y autorizar contratos con un solo clic.
        </Bajada>

        <div className="mt-3 flex flex-col gap-2">
          <Beneficio orden={4} titulo="Métricas de Venta y Avance en Vivo" icono={AnalyticsUpIcon}>
            Conoce al instante cuántas parcelas quedan, el porcentaje de avance del loteo y los
            ingresos comprometidos.
          </Beneficio>
          <Beneficio
            orden={5}
            titulo="Bandeja de Aprobación en 1 Clic"
            icono={CheckmarkCircle02Icon}
          >
            Cuando un vendedor ingresa una reserva, te llega una alerta inmediata para que apruebes
            el precio y las condiciones de pago.
          </Beneficio>
          <Beneficio orden={6} titulo="Auditoría y Trazabilidad Notarial" icono={SecurityCheckIcon}>
            Registro histórico inmutable de quién vendió, a qué hora, qué comprador reservó y qué
            documento se generó.
          </Beneficio>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 8 · Ciclo completo de venta
 * ------------------------------------------------------------------ */

const PASOS_CICLO = [
  {
    badge: 'PASO 1 • TERRENO',
    titulo: 'Venta en Celular',
    texto:
      'El vendedor abre Telegram, muestra el mapa y el Estudio de Títulos al cliente, y solicita la reserva con su RUT.',
    icono: SmartPhone01Icon,
  },
  {
    badge: 'PASO 2 • ALERTA',
    titulo: 'Notificación Admin',
    texto:
      'El administrador recibe aviso inmediato en su panel y teléfono con los datos del comprador y la parcela.',
    icono: Alert02Icon,
  },
  {
    badge: 'PASO 3 • CONTROL',
    titulo: 'Aprobación & Caja',
    texto:
      'El dueño o gerente aprueba en 1 clic. La venta queda contabilizada automáticamente en los KPIs financieros.',
    icono: CheckmarkCircle02Icon,
  },
  {
    badge: 'PASO 4 • MOTOR LEGAL',
    titulo: 'Minuta Generada',
    texto:
      'El sistema fusiona Estudio de Título + Deslindes KMZ + Comprador y genera la promesa en Word (.docx) en 2 minutos.',
    icono: LegalDocument01Icon,
  },
  {
    badge: 'PASO 5 • CIERRE',
    titulo: 'Comprador al Instante',
    texto:
      'El comprador recibe el contrato oficial en su WhatsApp o correo listo para firma. Cero días de espera ni arrepentimiento.',
    icono: SignatureIcon,
  },
] as const

function Ciclo() {
  return (
    <>
      <Antetitulo>El Circuito Operativo en Acción</Antetitulo>
      <Titulo>De la venta en terreno al contrato en mano: Flujo instantáneo</Titulo>
      <Bajada>
        Cómo interactúan el vendedor, el administrador y el comprador en un proceso 100% digital,
        trazable y sin demoras.
      </Bajada>

      <Bloque orden={3} className="relative mt-6 h-1 w-full overflow-hidden rounded-full bg-muted">
        <span
          className={cn(estilos.beam, 'absolute top-0 h-full w-[26%] rounded-full bg-primary')}
        />
      </Bloque>

      <div className={cn(estilos.grid5, 'mt-4')}>
        {PASOS_CICLO.map((paso, i) => (
          <Bloque key={paso.titulo} orden={4 + i} className="rounded-2xl bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HugeiconsIcon icon={paso.icono} className="size-4" aria-hidden />
              </span>
            </div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-wide text-primary">
              {paso.badge}
            </div>
            <div className="mt-1 font-display text-[16px] font-semibold leading-tight text-balance">
              {paso.titulo}
            </div>
            <p className="mt-1.5 text-[13px] leading-snug text-pretty text-muted-foreground">
              {paso.texto}
            </p>
          </Bloque>
        ))}
      </div>

      <div className={cn(estilos.grid3, 'mt-5')}>
        {[
          {
            titulo: 'Cero Fricción en el Cierre',
            texto: 'El cliente firma el contrato mientras tiene el entusiasmo de compra.',
          },
          {
            titulo: 'Bloqueo Atómico Inmediato',
            texto: 'El lote queda marcado como reservado para todo el equipo al instante.',
          },
          {
            titulo: 'Contabilidad al Segundo',
            texto: 'La gerencia ve la recaudación y el stock actualizado sin pedir reportes.',
          },
        ].map((item, i) => (
          <Bloque
            key={item.titulo}
            orden={9 + i}
            className="rounded-2xl bg-card px-5 py-3.5 shadow-sm"
          >
            <div className="text-[14px] font-bold">{item.titulo}</div>
            <div className="mt-0.5 text-[13px] text-pretty text-muted-foreground">{item.texto}</div>
          </Bloque>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * 9 · Motor de escrituración
 * ------------------------------------------------------------------ */

function Escrituracion() {
  return (
    <div className={estilos.split}>
      <div>
        <Antetitulo>El Motor Notarial en Acción</Antetitulo>
        <Titulo compacto>¿Cómo se crea la escritura en Plotify?</Titulo>
        <Bajada>
          Plotify integra una{' '}
          <strong className="text-foreground">
            plantilla genérica especializada para escrituras de loteos
          </strong>
          . Tu abogado{' '}
          <strong className="text-foreground">no debe cargar ningún documento previamente</strong>:
          el sistema fusiona todos los antecedentes legales y técnicos, entregando una minuta lista
          para revisar y editar.
        </Bajada>

        <div className="mt-3 flex flex-col gap-2">
          <Beneficio
            orden={4}
            titulo="Plantilla Canónica Especializada (De Fábrica)"
            icono={LegalDocument01Icon}
          >
            Estructura legal estándar para parcelaciones chilenas ya incorporada. Cero trabajo
            previo de configuración o carga para el abogado.
          </Beneficio>
          <Beneficio orden={5} titulo="Fusión Inteligente de Documentos" icono={FlashIcon}>
            Extrae y cruza los antecedentes del Estudio de Títulos, resolución SAG, rol SII matriz,
            certificados CBR, deslindes KMZ y datos del comprador.
          </Beneficio>
          <Beneficio
            orden={6}
            titulo="Minuta Pre-Rellenada al 95% en Word (.docx)"
            icono={SignatureIcon}
          >
            Genera el contrato notarial completo en 2 minutos, con el precio expresado en palabras,
            las servidumbres y los deslindes oficiales.
          </Beneficio>
          <Beneficio orden={7} titulo="Criterio y Edición Libre del Abogado" icono={Tick02Icon}>
            El abogado conserva el 100% del control: abre el archivo Word (.docx) y puede editar,
            agregar o quitar cláusulas según su criterio antes de firmar.
          </Beneficio>
        </div>
      </div>

      <Bloque orden={3}>
        <MesaEscrituracionMockup />
      </Bloque>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * 10 · Resguardo de la información
 * ------------------------------------------------------------------ */

function Seguridad() {
  return (
    <>
      <Antetitulo>Resguardo de tu Información</Antetitulo>
      <Titulo>Tus títulos y tu cartera de compradores están protegidos</Titulo>
      <Bajada>
        Antes de cargar el Estudio de Títulos de tu proyecto es justo saber dónde queda esa
        información, quién puede verla y cómo la recuperas.
      </Bajada>

      <div className={cn(estilos.grid2, 'mt-5')}>
        <Tarjeta
          orden={3}
          icono={SquareLock01Icon}
          tono="success"
          titulo="Sin Almacenamiento de Cédulas de Identidad"
        >
          Plotify nunca guarda fotografías ni archivos PDF del carnet de tus compradores: solo los
          datos tipeados que la escritura requiere (nombre, RUT y domicilio).
        </Tarjeta>
        <Tarjeta
          orden={4}
          icono={UserGroupIcon}
          tono="info"
          titulo="Aislamiento Estricto por Organización"
        >
          Tus proyectos no son visibles para otras empresas ni para corredores que no hayas
          autorizado. La separación se aplica en la base de datos, no solo en la pantalla.
        </Tarjeta>
        <Tarjeta orden={5} icono={SecurityCheckIcon} titulo="Registro Histórico Inmutable">
          Quién reservó, quién aprobó y quién generó cada minuta, con fecha y hora. El respaldo que
          necesitas para reconstruir cualquier operación o discutir una comisión.
        </Tarjeta>
        <Tarjeta orden={6} icono={Share08Icon} titulo="Exportación Libre de tu Información">
          Puedes exportar el inventario, las reservas y los documentos generados cuando lo estimes
          conveniente. Sin contrato de permanencia ni datos retenidos.
        </Tarjeta>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * 11 · Tabla comparativa
 * ------------------------------------------------------------------ */

const FILAS_COMPARATIVA = [
  [
    'Visor Satelital de Lotes',
    'Planos en PDF desfasados',
    'No incluye mapas GIS',
    'Masterplan satelital en vivo',
  ],
  [
    'Estudio de Títulos en Celular',
    'En carpetas de oficina',
    'No gestiona títulos legales',
    'A la mano para mostrar al cliente',
  ],
  [
    'Venta en Terreno (Celular)',
    'Preguntar por chat grupal',
    'App compleja con login',
    'Telegram Mini App en 30 seg',
  ],
  [
    'Cálculo de Deslindes Notariales',
    'Redacción manual propensa a error',
    'No calcula geometría',
    '100% automático desde el plano',
  ],
  [
    'Emisión de Promesas en Word',
    '1 a 3 semanas con abogado',
    'Plantillas básicas en PDF',
    'Minuta Word (.docx) en 2 min',
  ],
  [
    'Seguridad Anti-Doble Venta',
    'Riesgo constante',
    'Bloqueos manuales tardíos',
    'Bloqueo atómico inmediato',
  ],
] as const

function Comparativa() {
  return (
    <>
      <Antetitulo>Por Qué Plotify</Antetitulo>
      <Titulo>La diferencia entre operar a ciegas o con control total</Titulo>
      <Bajada>
        Plotify no es un CRM genérico importado del extranjero; está diseñado para las leyes, los
        planos y la forma de vender parcelas en Chile.
      </Bajada>

      <Bloque orden={3} className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 overflow-hidden rounded-2xl bg-card text-left shadow-sm">
          <thead>
            <tr className="text-[14px] text-muted-foreground">
              <th className="px-5 py-3.5 font-display font-semibold">Aspecto Clave</th>
              <th className="px-5 py-3.5 font-display font-semibold">
                Forma Tradicional (Excel / WhatsApp)
              </th>
              <th className="px-5 py-3.5 font-display font-semibold">
                CRMs Genéricos (HubSpot, etc.)
              </th>
              <th className="bg-primary/10 px-5 py-3.5 font-display font-semibold text-primary">
                Plotify (Especializado en Loteos)
              </th>
            </tr>
          </thead>
          <tbody>
            {FILAS_COMPARATIVA.map(([aspecto, excel, crm, plotify]) => (
              <tr key={aspecto} className="text-[14px]">
                <td className="border-t border-border/60 px-5 py-3 font-semibold">{aspecto}</td>
                <td className="border-t border-border/60 px-5 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3 shrink-0" aria-hidden />
                    {excel}
                  </span>
                </td>
                <td className="border-t border-border/60 px-5 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3 shrink-0" aria-hidden />
                    {crm}
                  </span>
                </td>
                <td className="border-t border-border/60 bg-primary/5 px-5 py-3 font-medium">
                  <span className="flex items-center gap-1.5">
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      className="size-3 shrink-0 text-primary"
                      aria-hidden
                    />
                    {plotify}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bloque>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * 12 · Cierre y piloto comercial
 * ------------------------------------------------------------------ */

function Cierre() {
  return (
    <>
      <Antetitulo>Próximos Pasos</Antetitulo>
      <Titulo>Pon a prueba Plotify con uno de tus proyectos</Titulo>
      <Bajada>
        La forma más rápida de comprobar el valor es verlo en tu propio loteo. Sin compromiso y sin
        alterar tu operación actual.
      </Bajada>

      <div className={cn(estilos.grid3, 'mt-5')}>
        {[
          {
            paso: 'Paso 1',
            titulo: 'Envíanos tu KMZ y Títulos',
            texto:
              'Cargamos tu plano de parcelación y antecedentes de títulos (CBR y SAG) en menos de 24 a 48 horas.',
            icono: Share08Icon,
          },
          {
            paso: 'Paso 2',
            titulo: 'Demostración en tu Celular',
            texto:
              'Te abrimos la Mini App en Telegram para que camines tu proyecto en terreno y veas cómo tus vendedores reservan parcelas en vivo.',
            icono: Calendar01Icon,
          },
          {
            paso: 'Paso 3',
            titulo: 'Emisión de tu Primera Minuta',
            texto:
              'Simulamos una venta y descargamos la promesa de compraventa en Word generada con tus cláusulas notariales.',
            icono: LegalDocument01Icon,
          },
        ].map((item, i) => (
          <Tarjeta
            key={item.paso}
            orden={3 + i}
            icono={item.icono}
            sobretitulo={item.paso}
            titulo={item.titulo}
          >
            {item.texto}
          </Tarjeta>
        ))}
      </div>

      <Bloque
        orden={6}
        className="mt-6 rounded-2xl bg-primary px-7 py-7 text-center text-primary-foreground shadow-sm"
      >
        <h3 className="font-display text-3xl font-semibold text-balance">
          ¿Agendamos una demostración con tu plano real?
        </h3>
        <p className="mx-auto mt-2 max-w-[62ch] text-[16px] text-pretty text-primary-foreground">
          Conversemos 20 minutos. Te mostraremos tu loteo funcionando en vivo en Plotify y cómo
          puedes acelerar tus cierres desde este fin de semana.
        </p>
      </Bloque>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Registro de diapositivas
 * ------------------------------------------------------------------ */

export type Diapositiva = {
  id: string
  titulo: string
  Componente: () => React.JSX.Element
}

export const DIAPOSITIVAS: Diapositiva[] = [
  { id: 'portada', titulo: 'Portada', Componente: Portada },
  { id: 'dolor', titulo: 'El Dolor del Negocio', Componente: Dolor },
  { id: 'masterplan', titulo: 'Visor KMZ Satelital', Componente: Masterplan },
  { id: 'ficha', titulo: 'Ficha Técnica de la Parcela', Componente: Ficha },
  { id: 'titulos', titulo: 'Estudio de Títulos Digital', Componente: Titulos },
  { id: 'miniapp', titulo: 'Telegram Mini App', Componente: MiniApp },
  { id: 'mando', titulo: 'Centro de Mando', Componente: CentroMando },
  { id: 'ciclo', titulo: 'Ciclo Completo de Venta', Componente: Ciclo },
  { id: 'escrituracion', titulo: 'Motor de Escrituración', Componente: Escrituracion },
  { id: 'seguridad', titulo: 'Resguardo de tu Información', Componente: Seguridad },
  { id: 'comparativa', titulo: 'Tabla Comparativa', Componente: Comparativa },
  { id: 'cierre', titulo: 'Cierre y Piloto Comercial', Componente: Cierre },
]
