/**
 * Exporta el plano de un proyecto real a un snapshot estático para la
 * presentación comercial (`/presentacion`).
 *
 * La ruta de la presentación es pública: no puede consultar la API autenticada
 * del visor, y tampoco corresponde que exponga la cartera comercial de un
 * proyecto real. Por eso este script deja pasar SOLO la geometría y las
 * medidas —lo que el dueño autorizó— y descarta el resto:
 *
 *   se conserva  →  geometría, número de lote, m², servidumbre (m², ancho,
 *                   geometría), superficie neta, superficie oficial, perímetro
 *                   y deslindes oficiales.
 *   se descarta  →  vendedor, observaciones, quién verificó, precio, valor de
 *                   reserva, estado comercial real y todo id interno.
 *
 * El estado y el precio que ve la presentación son sintéticos y deterministas
 * (ver `estadoSintetico`), así que el plano es real pero la disponibilidad no
 * revela qué lotes están efectivamente vendidos.
 *
 * Uso:
 *   node scripts/export-presentation-plan.mjs <projectId>
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const SALIDA = path.join('src', 'components', 'presentacion', 'plano-demo.json')

const SELECT_LOTES = `
  id, geometry, geometry_type, source_type, name, lot_id,
  lots!geometries_lot_id_fkey (
    id, numero_lote, m2, servidumbre_m2, servidumbre_ancho_m,
    servidumbre_widths_m, servidumbre_ancho_label, servidumbre_geometry,
    servidumbre_calculation_status, superficie_neta_m2, area_official_m2,
    perimeter_official_m, boundaries_official, verified_status
  )
`

function leerEnv() {
  return Object.fromEntries(
    fs
      .readFileSync('.env', 'utf-8')
      .split('\n')
      .filter((linea) => linea.includes('=') && !linea.trim().startsWith('#'))
      .map((linea) => {
        const i = linea.indexOf('=')
        return [linea.slice(0, i).trim(), linea.slice(i + 1).trim()]
      })
  )
}

/** Hash entero estable: mismo lote → mismo estado en cada exportación. */
function hash(texto) {
  let h = 2166136261
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 100
}

function estadoSintetico(numeroLote) {
  const n = hash(`estado:${numeroLote}`)
  if (n < 60) return 'disponible'
  if (n < 76) return 'reservado'
  return 'vendido'
}

function precioSintetico(numeroLote) {
  // Pesos, en millones redondos: el visor los formatea con "$" y la minuta los
  // escribe en palabras, así que un millón exacto se lee bien en ambos. Es una
  // demostración, no la lista de precios real del proyecto.
  return (45 + (hash(`precio:${numeroLote}`) % 26)) * 1_000_000
}

function extraerGeometria(servidumbre) {
  if (!servidumbre) return null
  return servidumbre.type === 'Feature' ? servidumbre.geometry : servidumbre
}

/** Recorta coordenadas a 6 decimales (~11 cm): el archivo pesa la mitad. */
function redondearCoordenadas(nodo) {
  if (Array.isArray(nodo)) {
    return nodo.every((v) => typeof v === 'number')
      ? nodo.map((v) => Math.round(v * 1e6) / 1e6)
      : nodo.map(redondearCoordenadas)
  }
  return nodo
}

function limpiarGeometria(geometria) {
  if (!geometria) return null
  return { type: geometria.type, coordinates: redondearCoordenadas(geometria.coordinates) }
}

async function main() {
  const projectId = process.argv[2]
  if (!projectId) {
    console.error('Falta el projectId. Uso: node scripts/export-presentation-plan.mjs <projectId>')
    process.exit(1)
  }

  const env = leerEnv()
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: proyecto, error: errorProyecto } = await db
    .from('projects')
    .select('id, name, comuna, region, total_lotes, road_width_m')
    .eq('id', projectId)
    .single()
  if (errorProyecto) throw new Error(`No se pudo leer el proyecto: ${errorProyecto.message}`)

  const { data: geometriasLote, error: errorLotes } = await db
    .from('geometries')
    .select(SELECT_LOTES)
    .eq('project_id', projectId)
    .not('lot_id', 'is', null)
  if (errorLotes) throw new Error(`No se pudieron leer los lotes: ${errorLotes.message}`)

  const { data: infra, error: errorInfra } = await db
    .from('geometries')
    .select('id, geometry, geometry_type, source_type, name')
    .eq('project_id', projectId)
    .is('lot_id', null)
    .in('geometry_type', ['common_area', 'road'])
    .eq('is_assigned', true)
  if (errorInfra) throw new Error(`No se pudo leer la infraestructura: ${errorInfra.message}`)

  const features = []

  for (const geometria of geometriasLote) {
    const lote = geometria.lots
    if (!lote?.numero_lote) continue
    const numero = String(lote.numero_lote)

    features.push({
      type: 'Feature',
      geometry: limpiarGeometria(geometria.geometry),
      properties: {
        geometry_id: `lote-${numero}`,
        lot_id: `lote-${numero}`,
        geometry_type: geometria.geometry_type,
        source_type: geometria.source_type,
        numero_lote: numero,
        estado: estadoSintetico(numero),
        precio: precioSintetico(numero),
        m2: lote.m2 ?? undefined,
        servidumbre_m2: lote.servidumbre_m2 ?? undefined,
        servidumbre_ancho_m: lote.servidumbre_ancho_m ?? undefined,
        servidumbre_widths_m: lote.servidumbre_widths_m ?? undefined,
        servidumbre_ancho_label: lote.servidumbre_ancho_label ?? undefined,
        servidumbre_calculation_status: lote.servidumbre_calculation_status ?? undefined,
        superficie_neta_m2: lote.superficie_neta_m2 ?? undefined,
        area_official_m2: lote.area_official_m2 ?? undefined,
        perimeter_official_m: lote.perimeter_official_m ?? undefined,
        boundaries_official: lote.boundaries_official ?? undefined,
        verified_status: lote.verified_status ?? undefined,
      },
    })

    const servidumbre = extraerGeometria(lote.servidumbre_geometry)
    if (servidumbre) {
      features.push({
        type: 'Feature',
        geometry: limpiarGeometria(servidumbre),
        properties: {
          geometry_id: `serv-${numero}`,
          lot_id: `lote-${numero}`,
          geometry_type: 'servitude',
          source_type: geometria.source_type,
          name: `Servidumbre Lote ${numero}`,
          numero_lote: numero,
          estado: estadoSintetico(numero),
          servidumbre_m2: lote.servidumbre_m2 ?? undefined,
          servidumbre_ancho_m: lote.servidumbre_ancho_m ?? undefined,
          servidumbre_ancho_label: lote.servidumbre_ancho_label ?? undefined,
          superficie_neta_m2: lote.superficie_neta_m2 ?? undefined,
        },
      })
    }
  }

  infra.forEach((geometria, i) => {
    features.push({
      type: 'Feature',
      geometry: limpiarGeometria(geometria.geometry),
      properties: {
        geometry_id: `infra-${i + 1}`,
        geometry_type: geometria.geometry_type,
        source_type: geometria.source_type,
        name: geometria.name ?? undefined,
        estado: 'sin_asignar',
      },
    })
  })

  const snapshot = {
    _origen: {
      proyecto: proyecto.name,
      comuna: proyecto.comuna,
      region: proyecto.region,
      exportado: new Date().toISOString().slice(0, 10),
      nota: 'Solo geometría y medidas. Estado y precio son sintéticos; no hay datos de clientes, vendedores ni precios reales.',
    },
    type: 'FeatureCollection',
    features,
  }

  fs.writeFileSync(SALIDA, JSON.stringify(snapshot))

  const lotes = features.filter((f) => f.properties.geometry_type === 'lot')
  const servidumbres = features.filter((f) => f.properties.geometry_type === 'servitude')
  const conDeslindes = lotes.filter((f) => f.properties.boundaries_official)
  console.log(`Proyecto: ${proyecto.name} (${proyecto.comuna}, ${proyecto.region})`)
  console.log(`  lotes: ${lotes.length}`)
  console.log(`  servidumbres: ${servidumbres.length}`)
  console.log(`  infraestructura: ${infra.length}`)
  console.log(`  lotes con deslindes oficiales: ${conDeslindes.length}`)
  console.log(`  archivo: ${SALIDA} (${Math.round(fs.statSync(SALIDA).size / 1024)} KB)`)
}

await main()
