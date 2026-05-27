import JSZip from 'jszip'

/**
 * Extrae el contenido KML de un archivo KMZ (ZIP)
 * @param buffer Buffer del archivo KMZ
 * @returns String XML del KML encontrado
 */
export async function extractKmlFromKmz(buffer: Buffer): Promise<string> {
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('El archivo KMZ está dañado o no es un archivo comprimido válido.')
  }

  // Buscar archivo .kml dentro del ZIP
  const kmlFile = Object.keys(zip.files).find((filename) => filename.toLowerCase().endsWith('.kml'))

  if (!kmlFile) {
    throw new Error('El archivo KMZ no contiene ningún archivo geográfico .kml en su interior.')
  }

  try {
    const kmlContent = await zip.files[kmlFile].async('string')
    if (!kmlContent || kmlContent.trim() === '') {
      throw new Error('El archivo KML interno está vacío.')
    }
    return kmlContent
  } catch (readError) {
    throw new Error(
      `No se pudo leer el contenido geográfico del archivo: ${
        readError instanceof Error ? readError.message : 'formato corrupto'
      }`
    )
  }
}
