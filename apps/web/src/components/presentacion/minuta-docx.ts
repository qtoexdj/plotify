/**
 * Genera un .docx real para la demostración de la mesa de escrituración.
 *
 * La versión HTML anterior descargaba un archivo de texto plano con extensión
 * .docx: Word lo abría con el diálogo de conversión o con caracteres rotos,
 * justo en el momento más importante de la reunión. Aquí se arma un paquete
 * OOXML mínimo pero válido (Content_Types + rels + document + styles) con
 * JSZip, que ya es dependencia del proyecto.
 */

import JSZip from 'jszip'
import {
  CBR_INSCRIPCION,
  COMPRADOR_DEMO,
  LOTE_DEMO,
  PROYECTO_DEMO,
  m2,
  clp,
  montoEnPalabras,
} from './deck-data'

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type Parrafo = {
  texto: string
  estilo?: 'titulo' | 'subtitulo' | 'clausula' | 'nota'
}

function parrafoXml({ texto, estilo }: Parrafo): string {
  const alineacion = estilo === 'titulo' ? '<w:jc w:val="center"/>' : '<w:jc w:val="both"/>'
  const espaciado =
    estilo === 'titulo'
      ? '<w:spacing w:before="0" w:after="360"/>'
      : '<w:spacing w:before="0" w:after="180" w:line="276" w:lineRule="auto"/>'

  const runProps: string[] = []
  if (estilo === 'titulo') runProps.push('<w:b/>', '<w:sz w:val="28"/>')
  if (estilo === 'subtitulo') runProps.push('<w:b/>', '<w:sz w:val="24"/>')
  if (estilo === 'nota') runProps.push('<w:i/>', '<w:sz w:val="18"/>', '<w:color w:val="666666"/>')

  const rPr = runProps.length ? `<w:rPr>${runProps.join('')}</w:rPr>` : ''

  return (
    `<w:p><w:pPr>${espaciado}${alineacion}</w:pPr>` +
    `<w:r>${rPr}<w:t xml:space="preserve">${escaparXml(texto)}</w:t></w:r></w:p>`
  )
}

function construirParrafos(): Parrafo[] {
  const deslindes = LOTE_DEMO.deslindes
    .map(
      (d) =>
        `${d.rumbo}, en ${d.metros.toLocaleString('es-CL', { minimumFractionDigits: 2 })} metros, con ${d.colinda}`
    )
    .join('; ')

  return [
    { texto: 'PROMESA DE COMPRAVENTA', estilo: 'titulo' },
    {
      texto:
        'Minuta generada automáticamente por Plotify a partir del estudio de títulos del proyecto, la geometría del plano aprobado y los datos del comprador. Documento de demostración: revisar y ajustar antes de cualquier uso real.',
      estilo: 'nota',
    },
    { texto: 'PRIMERO: De la comparecencia', estilo: 'subtitulo' },
    {
      texto: `En la ciudad de ${PROYECTO_DEMO.comuna}, comparecen, por una parte, el propietario del inmueble que más adelante se individualiza, en adelante «el promitente vendedor»; y por la otra, doña ${COMPRADOR_DEMO.nombre}, cédula nacional de identidad N° ${COMPRADOR_DEMO.rut}, en adelante «la promitente compradora»; ambos mayores de edad, quienes exponen que han convenido el siguiente contrato de promesa de compraventa.`,
    },
    { texto: 'SEGUNDO: Del inmueble y sus deslindes', estilo: 'subtitulo' },
    {
      texto: `El promitente vendedor es dueño del ${LOTE_DEMO.etiqueta} del proyecto de parcelación «${PROYECTO_DEMO.nombre}», ubicado en la comuna de ${PROYECTO_DEMO.comuna}, ${PROYECTO_DEMO.region}, de una superficie total de ${m2(LOTE_DEMO.superficieTotalM2)}, de los cuales ${m2(LOTE_DEMO.servidumbreM2)} corresponden a servidumbre de tránsito, resultando una superficie útil de ${m2(LOTE_DEMO.superficieUtilM2)}.`,
    },
    {
      texto: `El referido lote deslinda de la siguiente manera: ${deslindes}. Los deslindes precedentes se encuentran calculados sobre la geometría del plano de subdivisión aprobado.`,
    },
    { texto: 'TERCERO: De los títulos', estilo: 'subtitulo' },
    {
      texto: `El inmueble matriz se encuentra inscrito a nombre del promitente vendedor a ${CBR_INSCRIPCION} del Registro de Propiedad del ${PROYECTO_DEMO.cbrConservador}. La subdivisión fue autorizada por Resolución del Servicio Agrícola y Ganadero N° ${PROYECTO_DEMO.resolucionSag}, y el predio matriz registra el rol de avalúo N° ${PROYECTO_DEMO.rolMatriz} del Servicio de Impuestos Internos, encontrándose en trámite la asignación de roles individuales.`,
    },
    { texto: 'CUARTO: Del precio', estilo: 'subtitulo' },
    {
      texto: `El precio de la compraventa prometida es la suma de ${clp(LOTE_DEMO.precioClp)}, esto es, ${montoEnPalabras(LOTE_DEMO.precioClp)}, que la promitente compradora pagará en la forma y plazos que las partes acuerden en la escritura definitiva.`,
    },
    { texto: 'QUINTO: De la escritura definitiva', estilo: 'subtitulo' },
    {
      texto:
        'La escritura definitiva de compraventa se otorgará una vez cumplidas las condiciones que las partes convengan, oportunidad en la cual se hará entrega material del inmueble prometido, libre de todo gravamen, prohibición, litigio y derecho de terceros.',
    },
    {
      texto:
        'Cláusulas restantes, personerías y forma de pago: a completar por el abogado según el criterio de la operación.',
      estilo: 'nota',
    },
  ]
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-CL"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`

function documentoXml(): string {
  const cuerpo = construirParrafos().map(parrafoXml).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${cuerpo}<w:sectPr>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>
</w:sectPr></w:body></w:document>`
}

export const NOMBRE_ARCHIVO_MINUTA = `Minuta_Promesa_Lote_${LOTE_DEMO.numero}_${PROYECTO_DEMO.nombre.replace(/\s+/g, '_')}.docx`

/** Arma el paquete .docx y devuelve el Blob listo para descargar. */
export async function generarMinutaDocx(): Promise<Blob> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.folder('_rels')?.file('.rels', ROOT_RELS)
  const word = zip.folder('word')
  word?.file('document.xml', documentoXml())
  word?.file('styles.xml', STYLES)
  word?.folder('_rels')?.file('document.xml.rels', DOCUMENT_RELS)

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}
