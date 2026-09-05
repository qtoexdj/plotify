/**
 * Fuente única de verdad de la presentación comercial.
 *
 * La geometría y las medidas salen del plano real de Teno 2 (ver `plano-demo.ts`),
 * no de números escritos a mano: superficie, servidumbre, superficie neta,
 * perímetro y los cuatro deslindes oficiales son los que calculó el motor del
 * producto. Así la ficha, la Mini App y la minuta no pueden contradecirse, que
 * es lo que pasaba en la versión HTML anterior.
 *
 * Los antecedentes legales (CBR, SAG, rol SII) y el comprador SÍ son de
 * demostración: son datos que el snapshot no incluye a propósito.
 */

import { LOTE_CANONICO, LOTES_DEMO, ORIGEN_PLANO } from './plano-demo'

export const PROYECTO_DEMO = {
  nombre: ORIGEN_PLANO.proyecto,
  comuna: ORIGEN_PLANO.comuna,
  region: ORIGEN_PLANO.region,
  totalLotes: LOTES_DEMO.length,
  lotesVendidos: LOTES_DEMO.filter((f) => f.properties.estado === 'vendido').length,
  reservasActivas: LOTES_DEMO.filter((f) => f.properties.estado === 'reservado').length,
  minutasEmitidas: 48,
  // Antecedentes legales de demostración: no vienen del plano exportado.
  rolMatriz: '544-595',
  resolucionSag: '1.945',
  cbrFojas: '1.723',
  cbrNumero: '671',
  cbrAno: '2019',
  cbrConservador: 'Conservador de Bienes Raíces de Curicó',
} as const

export const LOTE_DEMO = {
  numero: LOTE_CANONICO.numero,
  etiqueta: `Lote ${LOTE_CANONICO.numero}`,
  estado: 'disponible' as const,
  superficieTotalM2: LOTE_CANONICO.superficieTotalM2,
  servidumbreM2: LOTE_CANONICO.servidumbreM2,
  /** Superficie neta calculada por el producto, no una resta hecha a mano aquí. */
  superficieUtilM2: LOTE_CANONICO.superficieNetaM2,
  servidumbreAnchoM: LOTE_CANONICO.servidumbreAnchoM,
  perimetroM: LOTE_CANONICO.perimetroM,
  verificado: LOTE_CANONICO.verificado,
  precioClp: LOTE_CANONICO.precioClp,
  /** Pie de reserva que bloquea el lote mientras se firma la promesa. */
  reservaClp: 600_000,
  deslindes: LOTE_CANONICO.deslindes,
}

/**
 * Comprador de demostración. Se usa a propósito el RUT de prueba canónico
 * 11.111.111-1 en vez de un RUT con pinta de real: la ruta es pública y no
 * corresponde exhibir el documento de identidad de nadie, ni siquiera inventado.
 */
export const COMPRADOR_DEMO = {
  nombre: 'Valentina Edwards Mardones',
  rut: '11.111.111-1',
} as const

const NUMERO_CL = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const ENTERO_CL = new Intl.NumberFormat('es-CL')

export function m2(valor: number): string {
  return `${NUMERO_CL.format(valor)} m²`
}

export function entero(valor: number): string {
  return ENTERO_CL.format(valor)
}

export function metros(valor: number): string {
  return `${valor.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`
}

export function clp(valor: number): string {
  return `$${ENTERO_CL.format(valor)}`
}

const UNIDADES = [
  '',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
]
const DECENAS = [
  '',
  '',
  '',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
]

/** Escribe en palabras un entero de 1 a 99: la minuta exige el monto en letras. */
function decenasEnPalabras(valor: number): string {
  if (valor < 30) return UNIDADES[valor]
  const d = Math.floor(valor / 10)
  const u = valor % 10
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`
}

/**
 * El precio de demostración siempre es un número redondo de millones (lo
 * garantiza `precioSintetico` en el script de exportación), así que basta con
 * escribir los millones en palabras.
 */
export function montoEnPalabras(valor: number): string {
  const millones = Math.round(valor / 1_000_000)
  if (millones < 1 || millones > 99 || millones * 1_000_000 !== valor) {
    return ENTERO_CL.format(valor)
  }
  return millones === 1 ? 'un millón de pesos' : `${decenasEnPalabras(millones)} millones de pesos`
}

export const CBR_INSCRIPCION = `Fs. ${PROYECTO_DEMO.cbrFojas} N° ${PROYECTO_DEMO.cbrNumero} año ${PROYECTO_DEMO.cbrAno}`

export function deslindesEnTexto(): string {
  return LOTE_DEMO.deslindes
    .map((d) => `${d.rumbo}: en ${NUMERO_CL.format(d.metros)} metros con ${d.colinda}`)
    .join('; ')
}

/** Texto que copia el vendedor para pegar en WhatsApp. */
export function fichaParaWhatsApp(): string {
  return [
    `*${LOTE_DEMO.etiqueta.toUpperCase()} — PROYECTO ${PROYECTO_DEMO.nombre.toUpperCase()}*`,
    `${PROYECTO_DEMO.comuna}, ${PROYECTO_DEMO.region}`,
    '',
    `• Superficie total: ${m2(LOTE_DEMO.superficieTotalM2)}`,
    `• Servidumbre de tránsito: ${m2(LOTE_DEMO.servidumbreM2)}`,
    `• Superficie útil: ${m2(LOTE_DEMO.superficieUtilM2)}`,
    `• Precio: ${clp(LOTE_DEMO.precioClp)}`,
    `• Estado: DISPONIBLE (reserva inmediata)`,
    '',
    '*Deslindes Oficiales Matemáticos:*',
    ...LOTE_DEMO.deslindes.map(
      (d) => `  – ${d.rumbo}: ${NUMERO_CL.format(d.metros)} m con ${d.colinda}`
    ),
    '',
    '*Antecedentes Legales:*',
    `  – Resolución SAG N° ${PROYECTO_DEMO.resolucionSag}`,
    `  – Rol matriz SII ${PROYECTO_DEMO.rolMatriz}`,
    `  – Inscripción ${CBR_INSCRIPCION}, ${PROYECTO_DEMO.cbrConservador}`,
    '',
    'Consulta disponibilidad en vivo y reserva con RUT en Plotify.',
    'Datos de demostración.',
  ].join('\n')
}

export type SpeakerNote = {
  titulo: string
  objetivo: string
  puntos: string[]
  objecion: { pregunta: string; respuesta: string }
}

export const SPEAKER_NOTES: SpeakerNote[] = [
  {
    titulo: 'Portada — Plotify',
    objetivo:
      'Posicionar a Plotify como el sistema operativo integral para loteos en Chile, no como un simple software.',
    puntos: [
      'Saludar y agradecer el tiempo. Abrir con una pregunta: «¿cuánto tiempo pasa hoy desde que un cliente dice sí en el cerro hasta que tiene la promesa firmada?».',
      'Destacar que Plotify conecta el plano técnico (KMZ), la venta en terreno (celular) y la redacción legal (Word) en un solo flujo continuo.',
      'Subrayar que está 100% adaptado a la normativa chilena: SAG, SII, Conservador de Bienes Raíces y notarías.',
    ],
    objecion: {
      pregunta: '¿Es un CRM como HubSpot?',
      respuesta:
        'Aclarar que un CRM genérico no entiende de roles matrices, deslindes matemáticos ni resoluciones SAG; Plotify es una solución de nicho inmobiliario rural.',
    },
  },
  {
    titulo: 'El Dolor del Negocio',
    objetivo: 'Validar las frustraciones diarias del dueño o gerente de loteo.',
    puntos: [
      'Las ventas se pierden por lentitud e incertidumbre: el cliente se enfría camino a su casa.',
      'El caos de las reservas por WhatsApp genera el peor error comercial: la doble venta o reservas pisadas entre corredores.',
      'Las semanas de espera con abogados redactando promesas desde cero generan fricción y cancelaciones.',
    ],
    objecion: {
      pregunta: '«Mi equipo se maneja bien con Excel».',
      respuesta:
        'Preguntar cuántas veces han tenido que llamar a la oficina un domingo para confirmar si una parcela sigue disponible o a qué precio.',
    },
  },
  {
    titulo: 'Visor KMZ Satelital',
    objetivo: 'Demostrar que el KMZ que ya tienen se convierte en una herramienta viva de ventas.',
    puntos: [
      'Usar el selector de vistas para mostrar la diferencia: el vendedor ve un mapa liviano en su celular con colores verde/ámbar/gris.',
      'El dueño o administrador tiene la consola de mando: control de etapas, fijación de precios en UF y asignación de permisos exclusivos.',
      'Muestra accesos reales de 3 y 6 metros, servidumbres y caminos sin confusiones.',
    ],
    objecion: {
      pregunta: '¿Qué pasa si no tengo KMZ?',
      respuesta:
        'Cualquier topógrafo o proyectista entrega el KMZ/KML del loteo y Plotify lo procesa en minutos.',
    },
  },
  {
    titulo: 'Ficha Técnica de la Parcela',
    objetivo: 'Mostrar la precisión matemática y la comodidad para el vendedor.',
    puntos: [
      'Demostrar el botón «Copiar Ficha para WhatsApp»: en terreno el vendedor copia y pega la ficha completa al prospecto en 3 segundos.',
      'Deslindes calculados automáticamente por geometría; cero error de tipeo en notaría.',
      'Desglose exacto entre superficie útil y servidumbre: transparencia que genera confianza inmediata en el comprador.',
    ],
    objecion: {
      pregunta: '¿La notaría acepta estos deslindes?',
      respuesta:
        'Están calculados según las coordenadas y rumbos oficiales del plano aprobado, y el abogado los revisa antes de firmar igual que hoy.',
    },
  },
  {
    titulo: 'Estudio de Títulos Digital',
    objetivo: 'Eliminar el mayor freno de compra: el miedo a problemas legales.',
    puntos: [
      'El comprador rural siempre duda de los papeles. Con Plotify, el vendedor lleva la historia de dominio, el SAG y el certificado de hipotecas en su teléfono.',
      'Entregar los títulos en el mismo recorrido físico transforma una conversación defensiva en una demostración de solvencia y seriedad.',
      'Toda esta data alimenta directamente la futura promesa notarial.',
    ],
    objecion: {
      pregunta: '¿Quién sube el estudio de títulos?',
      respuesta:
        'Se carga una sola vez al inicio del proyecto (fojas, año, CBR, SAG) y queda activo para todas las parcelas.',
    },
  },
  {
    titulo: 'Telegram Mini App (Vendedor en Terreno)',
    objetivo: 'Hacer una demostración interactiva en vivo con el botón de reserva.',
    puntos: [
      'Invitar a hacer clic en «Bloquear y Reservar»: mostrar la animación de bloqueo en 0,8 segundos.',
      'Cero fricción de adopción: funciona directo en Telegram. No hay que descargar apps pesadas ni lidiar con contraseñas olvidadas.',
      'Bloqueo atómico: si dos vendedores intentan reservar el mismo lote con milisegundos de diferencia, el sistema otorga la reserva a uno y notifica al otro.',
    ],
    objecion: {
      pregunta: '¿Y si no hay señal 4G en el loteo?',
      respuesta:
        'La app mantiene el plano en caché para exhibirlo sin señal. La reserva requiere conexión para bloquear de verdad: se sincroniza apenas hay línea y, mientras tanto, el vendedor ve que quedó pendiente.',
    },
  },
  {
    titulo: 'Centro de Mando para Dueños',
    objetivo: 'Vender la tranquilidad y el control ejecutivo total.',
    puntos: [
      'El dueño o administrador no tiene que llamar a nadie: la bandeja de entrada muestra reservas pendientes con 1 clic de aprobación.',
      'Control financiero en tiempo real: recaudación proyectada, porcentaje de venta del loteo y auditoría de qué corredor vendió cada lote.',
      'Posibilidad de activar o pausar etapas comerciales para maximizar plusvalía.',
    ],
    objecion: {
      pregunta: '¿Pueden los corredores ver los datos de los otros proyectos?',
      respuesta: 'No, el sistema aísla por permisos estrictos a cada corredor o empresa externa.',
    },
  },
  {
    titulo: 'Ciclo Completo de Venta',
    objetivo: 'Recorrer el circuito de 5 pasos para evidenciar la reducción drástica de tiempos.',
    puntos: [
      'Guiar el ojo por los pasos 1 al 5 con la línea conectora animada.',
      'Paso 1 (Terreno) → Paso 2 (Alerta) → Paso 3 (Aprobación) → Paso 4 (Motor Notarial) → Paso 5 (Contrato en mano).',
      'Pasamos de un proceso artesanal de 2 a 3 semanas a un circuito digital de minutos.',
    ],
    objecion: {
      pregunta: '¿Se puede integrar con firma electrónica avanzada?',
      respuesta:
        'Sí, el documento Word o PDF resultante puede enviarse a plataformas de firma digital o imprimirse para notaría.',
    },
  },
  {
    titulo: '¿Cómo se crea la escritura?',
    objetivo: 'Aclarar de forma contundente cómo funciona la plantilla legal de Plotify.',
    puntos: [
      'Énfasis clave: la plantilla es CANÓNICA y ESPECIALIZADA, viene de fábrica en Plotify.',
      'Tu abogado NO debe cargar ningún documento antes: el sistema fusiona títulos + plano + comprador automáticamente.',
      'El resultado es un Word (.docx) estándar: el abogado lo abre, revisa y puede agregar, quitar o afinar lo que estime conveniente con total libertad.',
    ],
    objecion: {
      pregunta: 'Si el abogado dice «yo uso mi propio formato».',
      respuesta:
        'Explicar que la plantilla canónica sigue la estructura notarial estándar chilena; el abogado ahorra el 95% del tipeo y solo aplica su criterio.',
    },
  },
  {
    titulo: 'Resguardo de tu Información',
    objetivo:
      'Responder por adelantado la objeción que siempre aparece al pedir títulos y datos de compradores.',
    puntos: [
      'Decirlo antes de que lo pregunten: los títulos y la cartera son del dueño y se exportan cuando quiera.',
      'Nunca se almacenan fotografías ni PDF de cédulas de identidad: solo los datos tipeados que la escritura requiere.',
      'Cada acción queda registrada con autor y hora. Ese respaldo protege al dueño en una discusión de comisiones o de doble venta.',
    ],
    objecion: {
      pregunta: '¿Quién más ve la información de mi loteo?',
      respuesta:
        'Nadie fuera de su organización. Los corredores externos solo ven los proyectos que usted les asigna, y el aislamiento está aplicado en la base de datos, no solo en la pantalla.',
    },
  },
  {
    titulo: 'Tabla Comparativa',
    objetivo: 'Consolidar el valor único frente a alternativas precarias o genéricas.',
    puntos: [
      'Contrapunto: WhatsApp/Excel es gratis pero cuesta millones en ventas caídas y descontrol.',
      'Contrapunto: los CRM extranjeros (HubSpot, Salesforce) cuestan miles de dólares y no saben qué es un conservador ni un deslinde.',
      'Plotify es la única herramienta diseñada desde cero para la venta de loteos y parcelaciones en Chile.',
    ],
    objecion: {
      pregunta: 'Si mencionan el costo.',
      respuesta:
        'Destacar que evitar una sola doble venta o acelerar dos promesas paga el costo de la plataforma por años.',
    },
  },
  {
    titulo: 'Cierre y Piloto Comercial',
    objetivo: 'Cerrar la reunión agendando un piloto de 48 horas sin riesgo.',
    puntos: [
      'Proponer un plan de acción concreto: «mándenos el KMZ de su proyecto y los antecedentes del SAG/CBR hoy mismo».',
      'En 24 a 48 horas lo montamos en Plotify y le habilitamos la Mini App a su equipo para que lo prueben en terreno.',
      'Sin compromiso de permanencia: el valor se demuestra operando con su plano real.',
    ],
    objecion: {
      pregunta: '¿Qué pasa si mis vendedores no se adaptan?',
      respuesta:
        'Telegram es una herramienta que ya usan; la curva de aprendizaje es de menos de 10 minutos.',
    },
  },
]
