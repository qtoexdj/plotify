/**
 * Tipos del dominio de documentos legales.
 * Mapea la arquitectura atómica de escrituras (arquitectura-atomica-de-escrituras.md).
 */

// ─── Payload completo de variables para escritura de compraventa ──────────────

export interface ComparecientePersona {
  tipo: 'natural' | 'juridica'
  nombre: string
  rut: string
  rut_letras?: string
  nacionalidad?: string
  estado_civil?: string
  profesion_giro?: string
  domicilio?: string
  representantes?: ComparecientePersona[]
}

export interface EscrituraVariables {
  // Comparecientes
  vendedor: ComparecientePersona
  comprador: ComparecientePersona

  // Predio original (datos más reutilizados del proyecto)
  matriz: {
    nombre_predio: string
    ubicacion: string
    superficie_total: string
    deslindes: {
      norte?: string
      sur?: string
      oriente?: string
      poniente?: string
      nororiente?: string
      norponiente?: string
      suroriente?: string
      surponiente?: string
      [key: string]: string | undefined
    }
    adquisicion_modo?: string
    adquisicion_notaria?: string
    adquisicion_fecha?: string
    adquisicion_repertorio?: string
    inscripcion_fojas?: string
    inscripcion_numero?: string
    inscripcion_anio?: string
    inscripcion_cbr?: string
    rol_avaluo?: string
  }

  // Subdivisión SAG
  sag: {
    certificado_numero?: string
    certificado_fecha?: string
    plano_cbr_numero?: string
    plano_cbr_anio?: string
  }

  // Lote a vender (auto-generado desde lot + deslinde-generator)
  lote: {
    numero_nombre: string // ej. "LOTE N CIENTO SESENTA Y TRES"
    superficie_total: string // ej. "DOSCIENTOS CINCUENTA METROS CUADRADOS"
    deslindes: string // Output de deslindeGenerator()
    rol_tramite?: string
  }

  // Servidumbre (auto-generado desde servidumbre-generator si aplica)
  servidumbre: {
    aplica: boolean
    superficie?: string
    deslindes_tramo?: string // Output de servidumbreGenerator()
  }

  // Transacción
  transaccion: {
    precio_numeros: string
    precio_letras: string
    forma_pago: string
  }

  // Mandato de rectificación
  mandato: {
    nombre_representante?: string
    rut_representante?: string
  }

  // Personería (solo si hay persona jurídica)
  personeria: {
    aplica: boolean
    tipo_documento?: string
    notaria?: string
    fecha?: string
    inscripcion_fojas?: string
    inscripcion_numero?: string
    inscripcion_anio?: string
    inscripcion_cbr?: string
  }
}

// ─── Metadata de artículos atómicos ──────────────────────────────────────────

export type ArticleType =
  | 'comparecencia'
  | 'ART-01'
  | 'ART-02'
  | 'ART-03'
  | 'ART-04'
  | 'ART-05'
  | 'ART-06'
  | 'ART-07'
  | 'ART-08'
  | 'ART-09'
  | 'ART-10'
  | 'ART-11'
  | 'ART-12'
  | 'ART-13'
  | 'ART-14'
  | 'ART-15'
  | 'ART-16'
  | 'personeria'
  | 'cierre'

export type ArticleCondition = 'fixed' | 'optional' | 'conditional'

export interface ArticleMetadata {
  id: ArticleType
  titulo: string
  descripcion: string
  condition: ArticleCondition
  /** Si condition == 'conditional', este campo de EscrituraVariables lo activa */
  condition_field?: keyof EscrituraVariables | string
  /** Conjunto de keys de EscrituraVariables que este artículo consume */
  variables_required: string[]
  /** Generadores que producen variables automáticamente */
  auto_generators?: Array<'deslindes' | 'servidumbre'>
}

/** Catálogo completo de artículos — fuente de verdad para seed SQL */
export const ESCRITURA_ARTICLES: ArticleMetadata[] = [
  {
    id: 'comparecencia',
    titulo: 'Comparecencia',
    descripcion:
      'Identifica a vendedor y comprador (personas naturales o jurídicas con representantes)',
    condition: 'fixed',
    variables_required: [
      'vendedor.tipo',
      'vendedor.nombre',
      'vendedor.rut',
      'vendedor.domicilio',
      'comprador.tipo',
      'comprador.nombre',
      'comprador.rut',
      'comprador.estado_civil',
      'comprador.profesion_giro',
      'comprador.domicilio',
    ],
  },
  {
    id: 'ART-01',
    titulo: 'PRIMERO — Antecedentes',
    descripcion: 'Propiedad del predio matriz, deslindes, historia de títulos y rol',
    condition: 'fixed',
    variables_required: [
      'matriz.nombre_predio',
      'matriz.ubicacion',
      'matriz.deslindes',
      'matriz.adquisicion_modo',
      'matriz.adquisicion_notaria',
      'matriz.adquisicion_fecha',
      'matriz.inscripcion_fojas',
      'matriz.inscripcion_cbr',
      'matriz.rol_avaluo',
    ],
  },
  {
    id: 'ART-02',
    titulo: 'SEGUNDO — Subdivisión y Lote',
    descripcion: 'Certificado SAG y descripción del lote con sus deslindes específicos',
    condition: 'fixed',
    variables_required: [
      'sag.certificado_numero',
      'sag.plano_cbr_numero',
      'lote.numero_nombre',
      'lote.superficie_total',
      'lote.deslindes',
      'lote.rol_tramite',
    ],
    auto_generators: ['deslindes'],
  },
  {
    id: 'ART-03',
    titulo: 'TERCERO — Objeto de Venta',
    descripcion: 'Vende, cede y transfiere el lote individualizado',
    condition: 'fixed',
    variables_required: ['lote.numero_nombre'],
  },
  {
    id: 'ART-04',
    titulo: 'CUARTO — Precio y Pago',
    descripcion: 'Monto de la compraventa y renuncia a acciones resolutorias',
    condition: 'fixed',
    variables_required: [
      'transaccion.precio_numeros',
      'transaccion.precio_letras',
      'transaccion.forma_pago',
    ],
  },
  {
    id: 'ART-05',
    titulo: 'QUINTO — Venta Ad-Corpus',
    descripcion: 'Aceptación del estado de la propiedad, usos y costumbres',
    condition: 'fixed',
    variables_required: [],
  },
  {
    id: 'ART-06',
    titulo: 'SEXTO — Servidumbre de Tránsito',
    descripcion: 'Constitución de servidumbre con descripción de predio sirviente/dominante',
    condition: 'conditional',
    condition_field: 'servidumbre.aplica',
    variables_required: ['servidumbre.superficie', 'servidumbre.deslindes_tramo'],
    auto_generators: ['servidumbre'],
  },
  {
    id: 'ART-07',
    titulo: 'SÉPTIMO — Entrega Material',
    descripcion: 'Fecha de entrega de la propiedad',
    condition: 'fixed',
    variables_required: [],
  },
  {
    id: 'ART-08',
    titulo: 'OCTAVO — Gastos',
    descripcion: 'Quién asume los costos de inscripción en el CBR',
    condition: 'fixed',
    variables_required: [],
  },
  {
    id: 'ART-09',
    titulo: 'NOVENO — Domicilio Judicial',
    descripcion: 'Fijación de competencia de tribunales',
    condition: 'fixed',
    variables_required: ['comprador.domicilio'],
  },
  {
    id: 'ART-10',
    titulo: 'DÉCIMO — Finiquito',
    descripcion: 'Anula promesas o acuerdos previos entre las partes',
    condition: 'fixed',
    variables_required: [],
  },
  {
    id: 'ART-11',
    titulo: 'UNDÉCIMO — Exoneraciones Especiales',
    descripcion: 'Exime al vendedor de responsabilidades sobre agua, luz y CONAF (art. a, b, c)',
    condition: 'optional',
    variables_required: [],
  },
  {
    id: 'ART-12',
    titulo: 'DUODÉCIMO — IVA y Exención',
    descripcion: 'Declaración de no afecto a IVA (predio rural, Ley 825)',
    condition: 'fixed',
    variables_required: [],
  },
  {
    id: 'ART-13',
    titulo: 'DECIMOTERCERO — Mandato de Rectificación',
    descripcion: 'Faculta a representante específico para corregir la escritura en CBR',
    condition: 'fixed',
    variables_required: ['mandato.nombre_representante', 'mandato.rut_representante'],
  },
  {
    id: 'ART-14',
    titulo: 'DECIMOCUARTO — Deudores de Alimentos',
    descripcion: 'Declaración de no adeudar pensiones alimenticias (Ley 21.389)',
    condition: 'fixed',
    variables_required: ['comprador.rut', 'vendedor.rut'],
  },
  {
    id: 'ART-15',
    titulo: 'DECIMOQUINTO — Uso de Suelo',
    descripcion: 'Prohibición de cambiar el destino agrícola del predio (LGUC)',
    condition: 'fixed',
    variables_required: [],
  },
  {
    id: 'ART-16',
    titulo: 'DECIMOSEXTO — Facultad de Copia',
    descripcion: 'Autoriza al portador de copia para realizar trámites',
    condition: 'fixed',
    variables_required: [],
  },
  {
    id: 'personeria',
    titulo: 'Personería y Poderes',
    descripcion: 'Datos de escrituras de constitución y poderes de representantes',
    condition: 'conditional',
    condition_field: 'personeria.aplica',
    variables_required: [
      'personeria.tipo_documento',
      'personeria.notaria',
      'personeria.fecha',
      'personeria.inscripcion_cbr',
    ],
  },
  {
    id: 'cierre',
    titulo: 'Cierre y Firmas',
    descripcion: 'Párrafo notarial de cierre y líneas de firma con RUT',
    condition: 'fixed',
    variables_required: ['vendedor.nombre', 'vendedor.rut', 'comprador.nombre', 'comprador.rut'],
  },
]
