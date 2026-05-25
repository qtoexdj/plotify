/**
 * Generador Legal de Texto de Servidumbre de Tránsito.
 *
 * Opera sobre el "Mini-Polígono de Servidumbre" (intersección Lote × Camino)
 * y genera la redacción legal de deslindes de servidumbre, incluyendo:
 * - Frontera Interna: "con la misma propiedad, esto es, lote [N]"
 * - Frontera Vecino: "con servidumbre que grava al lote [N] de la misma subdivisión"
 * - Frontera Externa: "con lote N [X] de anterior subdivisión"
 * - Multi-tramo: "la que tiene [N] tramos que corren por el deslinde [Dir1] y [Dir2]"
 *
 * Compatible con el formato legal oficial de escrituras chilenas.
 */

import { numberToWords, numberToWordsLower } from './number-to-words'
import type { ServidumbreAnalysis, ServidumbreEdge, OfficialBoundary } from '@/types/database.types'

const BLANK = '___________'

// ─── Helpers de Formato ─────────────────────────────────────────────────────

/**
 * Convierte el número de lote a palabras en español mayúsculas.
 */
function lotNumberToWords(numero: string): string {
  const parsed = parseInt(numero, 10)
  if (!isNaN(parsed) && parsed.toString() === numero.trim()) {
    return numberToWords(parsed).replace('UN', 'UNO')
  }
  return numero.toUpperCase()
}

/**
 * Convierte patrones "lote N" a su forma en palabras.
 * Ej: "lote 31" → "lote treinta y uno"
 */
function convertLotNumbersInText(text: string): string {
  return text.replace(/(?:[Ll]otes?\s+)?\b(\d+)\b/g, (_match, digitStr) => {
    const n = parseInt(digitStr, 10)
    const words = numberToWordsLower(n)
    return `lote ${words.replace(/\bun\b/g, 'uno')}`
  })
}

/**
 * Número ordinal en español (para "Tramo uno", "Tramo dos", etc.)
 */
function ordinalToWords(n: number): string {
  return numberToWordsLower(n).replace(/\bun\b/g, 'uno')
}

// ─── Formateo de Aristas Individuales ──────────────────────────────────────

/**
 * Genera el string de colindancia para una arista de servidumbre.
 */
function formatEdgeColindancia(edge: ServidumbreEdge): string {
  switch (edge.frontierType) {
    case 'internal': {
      const lotName = edge.selfLotNumber
        ? convertLotNumbersInText(`lote ${edge.selfLotNumber}`)
        : BLANK
      return `con la misma propiedad, esto es, ${lotName}`
    }
    case 'neighbor': {
      if (edge.neighbors.length === 0) return BLANK

      const names = edge.neighbors.map((n) => {
        const prefix = n.is_partial ? 'parte del ' : ''
        return convertLotNumbersInText(prefix + n.name)
      })

      let colindaStr: string
      if (names.length === 1) {
        colindaStr = names[0]
      } else if (names.length === 2) {
        colindaStr = `${names[0]} y ${names[1]}`
      } else {
        colindaStr = `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
      }

      // Gramática: "grava al lote X" pero "grava parte del lote X" (sin "al")
      const connector = colindaStr.startsWith('parte') ? 'grava ' : 'grava al '

      // Sufijo: singular vs plural (ambos / todos)
      let suffix: string
      if (names.length === 1) {
        suffix = 'de la misma subdivisión'
      } else if (names.length === 2) {
        suffix = 'ambos de la misma subdivisión'
      } else {
        suffix = 'todos de la misma subdivisión'
      }

      return names.length === 1
        ? `con servidumbre que ${connector}${colindaStr} ${suffix}`
        : `con servidumbre que ${connector}${colindaStr}, ${suffix}`
    }
    case 'external': {
      if (edge.externalName) {
        return `con ${edge.externalName}`
      }
      return BLANK
    }
    default:
      return BLANK
  }
}

// ─── Consolidación de Fragmentos de Buffer ─────────────────────────────────

/**
 * Consolida aristas que comparten la misma dirección cardinal + misma colindancia.
 * Resuelve el problema de "esquinas redondeadas" del buffer de Turf.js,
 * que genera micro-segmentos (0.1m, 0.4m, 1.3m) en las esquinas del polígono.
 *
 * 1. Agrupa aristas por (direction + frontierType + identidad de vecino)
 * 2. Suma distancias dentro de cada grupo
 * 3. Descarta grupos con distancia total < 1.0m (ruido geométrico)
 */
function consolidateEdges(edges: ServidumbreEdge[]): ServidumbreEdge[] {
  const getKey = (edge: ServidumbreEdge): string => {
    let identity: string
    switch (edge.frontierType) {
      case 'internal':
        identity = 'self'
        break
      case 'neighbor':
        identity = edge.neighbors
          .map((n) => `${n.is_partial ? 'p:' : ''}${n.name}`)
          .sort()
          .join('+')
        break
      case 'external':
        identity = edge.externalName || 'ext'
        break
      default:
        identity = 'unknown'
    }
    return `${edge.direction}|${edge.frontierType}|${identity}`
  }

  // Preservar orden de primera aparición
  const groupOrder: string[] = []
  const groupMap = new Map<string, ServidumbreEdge[]>()

  for (const edge of edges) {
    const key = getKey(edge)
    if (!groupMap.has(key)) {
      groupOrder.push(key)
      groupMap.set(key, [])
    }
    groupMap.get(key)!.push(edge)
  }

  const result: ServidumbreEdge[] = []
  for (const key of groupOrder) {
    const group = groupMap.get(key)!
    const totalDistance = group.reduce((sum, e) => sum + e.distance, 0)

    // Descartar micro-fragmentos (ruido del buffer de Turf)
    if (totalDistance < 1.0) continue

    // Usar la primera arista como plantilla con la distancia acumulada
    result.push({
      ...group[0],
      distance: parseFloat(totalDistance.toFixed(1)),
    })
  }

  return result
}

// ─── Ocultamiento de "Cabezas" del Polígono ────────────────────────────────

/**
 * Oculta las distancias de las "cabezas" del polígono de servidumbre.
 * En la redacción notarial chilena, los lados cortos (equivalentes al ancho
 * de la calle) NO llevan distancia — solo se menciona el colindante.
 *
 * Regla: si distance ≤ widthRoadMeters + 2 → es una "cabeza" → distance = 0
 */
function applyHeadOcclusion(edges: ServidumbreEdge[], widthRoadMeters: number): ServidumbreEdge[] {
  const threshold = widthRoadMeters + 2
  return edges.map((edge) =>
    edge.distance > 0 && edge.distance <= threshold ? { ...edge, distance: 0 } : edge
  )
}

// ─── Agrupación y Consolidación de Deslindes ───────────────────────────────

interface GroupedBoundary {
  label: string // Cardinal en mayúsculas: "NORTE", "SURORIENTE"
  segments: {
    distance: number
    colinda: string
  }[]
}

/**
 * Agrupa aristas consecutivas por dirección cardinal y genera los deslindes consolidados.
 * Sigue la misma lógica de agrupación que `deslinde-generator.ts`.
 */
function groupAndFormatEdges(edges: ServidumbreEdge[]): GroupedBoundary[] {
  if (edges.length === 0) return []

  const groups: GroupedBoundary[] = []

  for (const edge of edges) {
    const label = edge.direction.toUpperCase()
    const colinda = formatEdgeColindancia(edge)

    if (groups.length > 0 && groups[groups.length - 1].label === label) {
      groups[groups.length - 1].segments.push({
        distance: edge.distance,
        colinda,
      })
    } else {
      groups.push({
        label,
        segments: [{ distance: edge.distance, colinda }],
      })
    }
  }

  // Wrap-around: si el primer y último grupo tienen la misma etiqueta, unir
  if (groups.length > 1 && groups[0].label === groups[groups.length - 1].label) {
    const lastGroup = groups.pop()!
    groups[0].segments.unshift(...lastGroup.segments)
  }

  return groups
}

/**
 * Convierte un GroupedBoundary[] en un string de deslindes legal.
 * Ej: "NORTE, en sesenta y siete coma siete metros con servidumbre que grava al lote doce..."
 */
function renderGroupedBoundaries(groups: GroupedBoundary[]): string {
  const parts = groups.map((g) => {
    if (g.segments.length === 1) {
      const seg = g.segments[0]
      if (seg.distance > 0) {
        const distText = numberToWordsLower(seg.distance) + ' metros'
        return `${g.label}, en ${distText} ${seg.colinda}`
      }
      return `${g.label}, ${seg.colinda}`
    }

    // Detectar si colindancias son iguales → comprimir distancias
    const uniqueColindas = new Set(g.segments.map((s) => s.colinda))
    if (uniqueColindas.size === 1) {
      // Todas las distancias apuntan al mismo colindante
      const distTexts = g.segments.map((s) =>
        s.distance > 0 ? numberToWordsLower(s.distance) + ' metros' : BLANK
      )
      const combinedDist =
        distTexts.length === 2 ? `${distTexts[0]}, y en ${distTexts[1]}` : distTexts.join(', y en ')
      return `${g.label}, en  ${combinedDist}, ${g.segments[0].colinda}`
    }

    // Diferentes colindantes bajo misma dirección
    const segStrs = g.segments.map((seg) => {
      const distText = seg.distance > 0 ? numberToWordsLower(seg.distance) + ' metros' : BLANK
      return `en ${distText} ${seg.colinda}`
    })
    const allButLast = segStrs.slice(0, -1).join(', y ')
    const last = segStrs[segStrs.length - 1]
    return `${g.label}, ${allButLast}, y ${last}`
  })

  if (parts.length === 1) return parts[0]

  const allButLast = parts.slice(0, -1).join('; ')
  const last = parts[parts.length - 1]
  return `${allButLast}; ${last}`
}

// ─── Generador Principal ────────────────────────────────────────────────────

/**
 * Genera el texto legal de servidumbre a partir de un ServidumbreAnalysis.
 *
 * Formato simple (1 tramo):
 *   LOTE [N]. Tiene una servidumbre de [AREA] metros cuadrados y deslinda:
 *   NORTE, con...; SUR, con...; ...
 *
 * Formato multi-tramo:
 *   LOTE [N]. Tiene una servidumbre de [AREA] metros cuadrados, la que tiene
 *   [N] tramos que corren por el deslinde [dir1] y [dir2]. Tramo uno, que corre
 *   por el deslinde [dir1], tiene los siguientes deslindes: NORTE, con...; ...
 *   Tramo dos, que corre por el deslinde [dir2], tiene los siguientes deslindes: ...
 *
 * @param analysis Resultado de analyzeServidumbreBoundaries()
 * @returns Texto legal formateado
 */
export function generateServidumbreText(
  analysis: ServidumbreAnalysis,
  widthRoadMeters: number = 6
): string {
  const lotName = lotNumberToWords(analysis.lotNumber)
  const areaText = analysis.areaM2 > 0 ? numberToWordsLower(analysis.areaM2) : BLANK

  if (analysis.tramos.length === 0) {
    return `LOTE ${lotName}. Tiene una servidumbre de ${areaText} metros cuadrados y deslinda: ${BLANK}.`
  }

  // ─── Formato Simple (1 tramo) ─────────────────────────────────────────
  if (!analysis.isMultiTramo) {
    const tramo = analysis.tramos[0]
    const consolidated = consolidateEdges(tramo.edges)
    const withHeads = applyHeadOcclusion(consolidated, widthRoadMeters)
    const groups = groupAndFormatEdges(withHeads)
    const deslindesStr = renderGroupedBoundaries(groups)

    return (
      `LOTE ${lotName}. Tiene una servidumbre de ${areaText} metros cuadrados` +
      ` y deslinda: ${deslindesStr}.`
    )
  }

  // ─── Formato Multi-Tramo ──────────────────────────────────────────────
  const tramoCount = numberToWordsLower(analysis.tramos.length)
  const tramoDirections = analysis.tramos.map((t) => t.direction.toLowerCase())

  // Unir direcciones: "norte y norponiente" o "oriente, sur y norponiente"
  let directionsStr: string
  if (tramoDirections.length === 2) {
    directionsStr = `${tramoDirections[0]} y ${tramoDirections[1]}`
  } else {
    const allButLast = tramoDirections.slice(0, -1).join(', ')
    directionsStr = `${allButLast} y ${tramoDirections[tramoDirections.length - 1]}`
  }

  const header =
    `LOTE ${lotName}. Tiene una servidumbre de ${areaText} metros cuadrados, ` +
    `la que tiene ${tramoCount} tramos que corren por el deslinde ${directionsStr}.`

  // Generar cada tramo
  const tramoParts: string[] = []
  for (let i = 0; i < analysis.tramos.length; i++) {
    const tramo = analysis.tramos[i]
    const tramoOrdinal = ordinalToWords(i + 1)
    const tramoDir = tramo.direction.toLowerCase()

    const consolidated = consolidateEdges(tramo.edges)
    const withHeads = applyHeadOcclusion(consolidated, widthRoadMeters)
    const groups = groupAndFormatEdges(withHeads)
    const deslindesStr = renderGroupedBoundaries(groups)

    tramoParts.push(
      `Tramo ${tramoOrdinal}, que corre por el deslinde ${tramoDir}, tiene los siguientes deslindes: ${deslindesStr}.`
    )
  }

  return `${header} ${tramoParts.join(' ')}`
}

// ─── Compatibilidad Retroactiva ─────────────────────────────────────────────

/**
 * Genera texto de servidumbre desde los datos legacy (boundaries_official del lote).
 * Se mantiene para compatibilidad con lotes que aún no tienen ServidumbreAnalysis.
 *
 * @deprecated Usar generateServidumbreText(analysis) cuando se disponga de ServidumbreAnalysis
 */
export function generateServidumbreTextLegacy(lot: {
  numero_lote: string
  servidumbre_m2: number | null
  boundaries_official: OfficialBoundary[] | null
}): string {
  const lotName = lotNumberToWords(lot.numero_lote)
  const servidumbreText =
    lot.servidumbre_m2 != null && lot.servidumbre_m2 > 0
      ? numberToWordsLower(lot.servidumbre_m2)
      : BLANK

  const boundaries = lot.boundaries_official
  if (!boundaries || boundaries.length === 0) {
    return (
      `LOTE ${lotName}. Tiene una servidumbre de ${servidumbreText} metros cuadrados ` +
      `y deslinda: ${BLANK}.`
    )
  }

  const formattedBoundaries = boundaries.map((b) => {
    const label = b.label?.toUpperCase() || BLANK
    let colinda: string
    if (b.colinda?.trim()) {
      const colindaText = convertLotNumbersInText(b.colinda.trim())
      colinda = `con servidumbre que grava al ${colindaText} de la misma subdivisión`
    } else {
      colinda = BLANK
    }

    if (b.distance != null && b.distance > 0) {
      const distText = numberToWordsLower(b.distance) + ' metros'
      return `${label}, en ${distText} ${colinda}`
    }
    return `${label}, ${colinda}`
  })

  let deslindesStr: string
  if (formattedBoundaries.length === 1) {
    deslindesStr = formattedBoundaries[0]
  } else {
    const allButLast = formattedBoundaries.slice(0, -1).join('; ')
    const last = formattedBoundaries[formattedBoundaries.length - 1]
    deslindesStr = `${allButLast}; y ${last}`
  }

  return (
    `LOTE ${lotName}. Tiene una servidumbre de ${servidumbreText} metros cuadrados ` +
    `y deslinda: ${deslindesStr}.`
  )
}
