/**
 * Genera el texto legal de deslindes para un lote, replicando la estructura
 * del formato oficial de escritura.
 *
 * Estructura:
 * LOTE [N], de una superficie aproximada de [AREA] METROS CUADRADOS,
 * de los cuales [SERVIDUMBRE] METROS CUADRADOS quedan afectas a servidumbre
 * de tránsito, y deslinda: [DESLINDES...]
 */

import { numberToWords, numberToWordsLower } from './number-to-words'
import type { OfficialBoundary } from '@/types/database.types'

const BLANK = '___________'

interface DeslindeInput {
  numero_lote: string
  area_official_m2: number | null
  m2: number | null
  servidumbre_m2: number | null
  boundaries_official: OfficialBoundary[] | null
}

/**
 * Convierte el número de lote a palabras en español mayúsculas.
 * Si es un número puro (ej. "1"), lo convierte. Si contiene letras, lo deja tal cual.
 */
function lotNumberToWords(numero: string): string {
  const parsed = parseInt(numero, 10)
  if (!isNaN(parsed) && parsed.toString() === numero.trim()) {
    return numberToWords(parsed).replace('UN', 'UNO')
  }
  return numero.toUpperCase()
}

/**
 * Convierte patrones "[Ll]ote N", "N" o variaciones en texto a su forma en palabras.
 * Ej: "Lote 31" → "lote treinta y uno"
 *     "Lote 5 y 6" → "lote cinco y lote seis"
 *     "Lote 5, parte servidumbre, y parte del Lote 6" → "lote cinco, parte servidumbre, y parte del lote seis"
 */
function convertLotNumbersInText(text: string): string {
  // Busca opcionalmente la palabra Lote(s) seguida de espacios, luego un número exacto.
  // Lo reemplaza todo por "lote [número en palabras]".
  return text.replace(/(?:[Ll]otes?\s+)?\b(\d+)\b/g, (match, digitStr) => {
    const n = parseInt(digitStr, 10)
    const words = numberToWordsLower(n)
    // Reemplazar "un" suelto por "uno" al final
    return `lote ${words.replace(/\bun\b/g, 'uno')}`
  })
}

/**
 * Agrupa los tramos oficiales secuencialmente por cardinalidad
 * y consolida la redacción uniendo los tramos repetidos con "y en".
 */
function formatGroupedBoundaries(boundaries: OfficialBoundary[]): string[] {
  console.log(
    '[DEBUG-GENERATOR] Iniciando formatGroupedBoundaries con:',
    JSON.stringify(boundaries, null, 2)
  )
  if (boundaries.length === 0) return []

  const groups: { label: string; items: OfficialBoundary[] }[] = []

  for (const b of boundaries) {
    const label = b.label?.toUpperCase().trim() || BLANK
    if (groups.length > 0 && groups[groups.length - 1].label === label) {
      groups[groups.length - 1].items.push(b)
    } else {
      groups.push({ label, items: [b] })
    }
  }

  // Wrap-around: Si el primer y último grupo tienen la misma etiqueta, unirlos
  if (groups.length > 1 && groups[0].label === groups[groups.length - 1].label) {
    const lastGroup = groups.pop()!
    groups[0].items.unshift(...lastGroup.items)
  }

  return groups.map((g) => {
    const tramosStrs = g.items.map((b) => {
      const distance =
        b.distance != null && b.distance > 0 ? numberToWordsLower(b.distance) + ' metros' : BLANK

      let colinda: string
      // Priorizar metadata estructurada para el prefijo "parte del"
      if (b.neighbors_metadata && b.neighbors_metadata.length > 0) {
        const names = b.neighbors_metadata.map((n) => {
          const prefix = n.is_partial ? 'parte del ' : ''
          return convertLotNumbersInText(prefix + n.name)
        })

        colinda =
          names.length === 2
            ? `${names[0]} y ${names[1]}`
            : names.length > 2
              ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
              : names[0]
      } else {
        // Fallback a compatibilidad legacy si no hay metadata
        colinda = b.colinda?.trim() ? convertLotNumbersInText(b.colinda.trim()) : BLANK
      }

      return `en ${distance} con ${colinda}`
    })

    let tramosUnidos: string
    if (tramosStrs.length === 1) {
      tramosUnidos = tramosStrs[0]
    } else {
      // Unir múltiples aristas en la misma cardinalidad
      const allButLast = tramosStrs.slice(0, -1).join(', y ')
      const last = tramosStrs[tramosStrs.length - 1]
      tramosUnidos = `${allButLast}, y ${last}`
    }

    const hasNeighbors = g.items.some((b) => b.colinda?.trim())

    // Agrupar sufijos legales al final
    let sufijos = ''
    if (hasNeighbors) {
      // Verificar si hay múltiples lotes para pluralizar
      const totalCols = g.items.map((b) => b.colinda || '').join(' ')
      const isPlural = totalCols.includes(' y ') || totalCols.includes(',') || g.items.length > 1
      sufijos += isPlural ? ' todos de la misma subdivisión' : ' de la misma subdivisión'
    }

    const hasServidumbre = g.items.some((b) => b.es_servidumbre)
    if (hasServidumbre) {
      sufijos += ', servidumbre de por medio'
    }

    return `${g.label}, ${tramosUnidos}${sufijos}`
  })
}

/**
 * Genera el texto completo de deslinde para un lote.
 *
 * @param lot - Datos del lote con boundaries_official y métricas
 * @returns Texto legal formateado
 *
 * @example
 * generateDeslindeText({
 *   numero_lote: '1',
 *   area_official_m2: 5133.3,
 *   m2: 5133.3,
 *   servidumbre_m2: 17.7,
 *   boundaries_official: [
 *     { label: 'NORORIENTE', distance: 64.2, colinda: 'lote dos de la misma subdivisión, parte servidumbre' },
 *   ]
 * })
 */
export function generateDeslindeText(lot: DeslindeInput): string {
  // Nombre del lote
  const lotName = lotNumberToWords(lot.numero_lote)

  // Superficie: prioridad a area_official_m2 (si > 0), luego m2
  const area = lot.area_official_m2 && lot.area_official_m2 > 0 ? lot.area_official_m2 : lot.m2
  const areaText = area != null && area > 0 ? numberToWords(area) : BLANK

  // Servidumbre
  const servidumbreText =
    lot.servidumbre_m2 != null && lot.servidumbre_m2 > 0 ? numberToWords(lot.servidumbre_m2) : BLANK

  // Deslindes
  const boundaries = lot.boundaries_official
  if (!boundaries || boundaries.length === 0) {
    return (
      `LOTE ${lotName}, de una superficie aproximada de ${areaText} METROS CUADRADOS, ` +
      `de los cuales ${servidumbreText} METROS CUADRADOS quedan afectas a servidumbre de tránsito, ` +
      `y deslinda: ${BLANK}.`
    )
  }

  // Formatear deslindes consolidados (separados por punto y coma, el último con "y")
  const formattedBoundaries = formatGroupedBoundaries(boundaries)
  let deslindesStr: string

  if (formattedBoundaries.length === 1) {
    deslindesStr = formattedBoundaries[0]
  } else {
    const allButLast = formattedBoundaries.slice(0, -1).join('; ')
    const last = formattedBoundaries[formattedBoundaries.length - 1]
    deslindesStr = `${allButLast}; y ${last}`
  }

  return (
    `LOTE ${lotName}, de una superficie aproximada de ${areaText} METROS CUADRADOS, ` +
    `de los cuales ${servidumbreText} METROS CUADRADOS quedan afectas a servidumbre de tránsito, ` +
    `y deslinda: ${deslindesStr}.`
  )
}
