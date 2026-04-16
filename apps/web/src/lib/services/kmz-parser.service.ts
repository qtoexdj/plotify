import JSZip from 'jszip'

/**
 * Extrae el contenido KML de un archivo KMZ (ZIP)
 * @param buffer Buffer del archivo KMZ
 * @returns String XML del KML encontrado
 */
export async function extractKmlFromKmz(buffer: Buffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer)

    // Buscar archivo .kml dentro del ZIP
    const kmlFile = Object.keys(zip.files).find((filename) =>
      filename.toLowerCase().endsWith('.kml')
    )

    if (!kmlFile) {
      throw new Error('No se encontró archivo KML dentro del KMZ')
    }

    const kmlContent = await zip.files[kmlFile].async('string')
    return kmlContent
  } catch (error) {
    console.error('Error al extraer KML de KMZ:', error)
    throw new Error(`Error al procesar archivo KMZ: ${error}`)
  }
}
