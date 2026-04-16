/**
 * Convierte un número a su representación en palabras en español (mayúsculas).
 * Ej: 5133.3 → "CINCO MIL CIENTO TREINTA Y TRES COMA TRES"
 */

const UNIDADES = [
    '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO',
    'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
    'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
    'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
    'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO',
    'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
]

const DECENAS = [
    '', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA',
    'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA',
]

const CENTENAS = [
    '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
]

function convertirGrupo(n: number): string {
    if (n === 0) return ''
    if (n === 100) return 'CIEN'

    const centena = Math.floor(n / 100)
    const resto = n % 100

    let resultado = ''

    if (centena > 0) {
        resultado = CENTENAS[centena]
        if (resto === 0) return resultado
        resultado += ' '
    }

    if (resto <= 29) {
        resultado += UNIDADES[resto]
    } else {
        const decena = Math.floor(resto / 10)
        const unidad = resto % 10
        resultado += DECENAS[decena]
        if (unidad > 0) {
            resultado += ' Y ' + UNIDADES[unidad]
        }
    }

    return resultado
}

function enteroAPalabras(n: number): string {
    if (n === 0) return 'CERO'

    const partes: string[] = []

    // Millones
    const millones = Math.floor(n / 1_000_000)
    if (millones > 0) {
        if (millones === 1) {
            partes.push('UN MILLON')
        } else {
            partes.push(convertirGrupo(millones) + ' MILLONES')
        }
    }

    // Miles
    const miles = Math.floor((n % 1_000_000) / 1000)
    if (miles > 0) {
        if (miles === 1) {
            partes.push('MIL')
        } else {
            partes.push(convertirGrupo(miles) + ' MIL')
        }
    }

    // Unidades
    const unidades = n % 1000
    if (unidades > 0) {
        partes.push(convertirGrupo(unidades))
    }

    return partes.join(' ').trim()
}

/**
 * Convierte un número decimal a palabras en español, separando
 * la parte entera y la decimal con "COMA".
 * 
 * @param value - El número a convertir
 * @returns El número en palabras mayúsculas
 * 
 * @example
 * numberToWords(5133.3) // "CINCO MIL CIENTO TREINTA Y TRES COMA TRES"
 * numberToWords(17.7)   // "DIECISIETE COMA SIETE"
 * numberToWords(1000)   // "MIL"
 */
export function numberToWords(value: number): string {
    const entero = Math.floor(Math.abs(value))
    const parteEntera = enteroAPalabras(entero)

    // Parte decimal: usamos 1 dígito (redondeado)
    const decimalStr = Math.abs(value).toFixed(1)
    const parteDecimalDigito = parseInt(decimalStr.split('.')[1], 10)

    if (parteDecimalDigito === 0) {
        return parteEntera
    }

    const parteDecimal = enteroAPalabras(parteDecimalDigito)
    return `${parteEntera} COMA ${parteDecimal}`
}

/**
 * Convierte un número decimal a palabras en minúsculas.
 * 
 * @example
 * numberToWordsLower(64.2) // "sesenta y cuatro coma dos"
 */
export function numberToWordsLower(value: number): string {
    return numberToWords(value).toLowerCase()
}
