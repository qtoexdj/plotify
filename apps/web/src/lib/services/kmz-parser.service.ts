import JSZip from 'jszip'

export type GeometryLimitCode =
  | 'FEATURE_DISABLED'
  | 'ARCHIVE_ENTRY_LIMIT'
  | 'ARCHIVE_EXPANDED_LIMIT'
  | 'ARCHIVE_RATIO_LIMIT'
  | 'XML_DEPTH_LIMIT'
  | 'XML_NODE_LIMIT'
  | 'XML_TEXT_LIMIT'
  | 'FEATURE_LIMIT'
  | 'COORDINATE_LIMIT'
  | 'PARSE_DEADLINE'

export class GeometryLimitError extends Error {
  constructor(public readonly code: GeometryLimitCode) {
    super(code)
    this.name = 'GeometryLimitError'
  }
}

export const GEOMETRY_LIMITS = {
  compressedBytes: 20 * 1024 * 1024,
  expandedBytes: 64 * 1024 * 1024,
  entries: 32,
  compressionRatio: 100,
  xmlDepth: 32,
  xmlNodes: 100_000,
  xmlTextBytes: 32 * 1024 * 1024,
  features: 10_000,
  coordinates: 200_000,
  deadlineMs: 15_000,
} as const

export function inspectKmlLimits(xml: string, startedAt = Date.now()): void {
  if (Date.now() - startedAt > GEOMETRY_LIMITS.deadlineMs)
    throw new GeometryLimitError('PARSE_DEADLINE')
  if (Buffer.byteLength(xml) > GEOMETRY_LIMITS.xmlTextBytes)
    throw new GeometryLimitError('XML_TEXT_LIMIT')
  const tags = xml.match(/<\/?[A-Za-z_][^>]*>/g) ?? []
  if (tags.length > GEOMETRY_LIMITS.xmlNodes) throw new GeometryLimitError('XML_NODE_LIMIT')
  let depth = 0
  for (const tag of tags) {
    if (/^<\//.test(tag)) depth = Math.max(0, depth - 1)
    else if (!/\/>$/.test(tag) && !/^<\?/.test(tag) && !/^<!/.test(tag)) {
      depth += 1
      if (depth > GEOMETRY_LIMITS.xmlDepth) throw new GeometryLimitError('XML_DEPTH_LIMIT')
    }
  }
  if ((xml.match(/<Placemark\b/gi) ?? []).length > GEOMETRY_LIMITS.features)
    throw new GeometryLimitError('FEATURE_LIMIT')
  let coordinateCount = 0
  for (const match of xml.matchAll(/<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/gi)) {
    coordinateCount += match[1].trim().split(/\s+/).filter(Boolean).length
    if (coordinateCount > GEOMETRY_LIMITS.coordinates)
      throw new GeometryLimitError('COORDINATE_LIMIT')
  }
}

/**
 * Extrae el contenido KML de un archivo KMZ (ZIP)
 * @param buffer Buffer del archivo KMZ
 * @returns String XML del KML encontrado
 */
export async function extractKmlFromKmz(buffer: Buffer): Promise<string> {
  const startedAt = Date.now()
  if (buffer.byteLength > GEOMETRY_LIMITS.compressedBytes)
    throw new GeometryLimitError('ARCHIVE_EXPANDED_LIMIT')
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('El archivo KMZ está dañado o no es un archivo comprimido válido.')
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (entries.length > GEOMETRY_LIMITS.entries) throw new GeometryLimitError('ARCHIVE_ENTRY_LIMIT')
  const expanded = entries.reduce((total, entry) => {
    const size =
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
    return total + size
  }, 0)
  if (expanded > GEOMETRY_LIMITS.expandedBytes)
    throw new GeometryLimitError('ARCHIVE_EXPANDED_LIMIT')
  if (buffer.byteLength > 0 && expanded / buffer.byteLength > GEOMETRY_LIMITS.compressionRatio)
    throw new GeometryLimitError('ARCHIVE_RATIO_LIMIT')

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
    inspectKmlLimits(kmlContent, startedAt)
    return kmlContent
  } catch (readError) {
    throw new Error(
      `No se pudo leer el contenido geográfico del archivo: ${
        readError instanceof Error ? readError.message : 'formato corrupto'
      }`
    )
  }
}
