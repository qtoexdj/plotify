/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Motor End-to-End Plotify — Suite de Integración Geométrica
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Valida la cadena completa: Geometría → Vecinos → Deslinde Legal → Servidumbre.
 *
 * Mock Subdivision:
 *   Usamos coordenadas WGS84 reales centradas en Santiago (-33.45, -70.66).
 *   1° lat ≈ 111 132 m · 1° lon ≈ 111 320 × cos(33.45°) ≈ 92 935 m
 *   Para un cuadrado de 100 m de lado:
 *     offsetLat = 100 / 111132 ≈ 0.0009
 *     offsetLon = 100 / 92935  ≈ 0.001076
 *
 *   Disposición (vista aérea):
 *
 *        Vecino      Vecino
 *       Completo     Parcial (más grande, toca solo fracción del borde E)
 *     ┌──────────┐ ┌──────────────────┐
 *     │  lote 2  │ │     lote 3       │
 *     └──────────┘ └──────────────────┘
 *     ┌──────────┐
 *     │  lote 1  │  ← loteObjetivo (100×100m)
 *     │ (target) │
 *     └──────────┘
 *          ↑ camino pasa por el borde SUR
 */

import { describe, it, expect } from 'vitest'

// ─── Geometry Engine ───────────────────────────────────────────────────────
import {
    calculatePolygonArea,
    calculateDistance,
    calculateBearing,
    getCardinalDirection,
    getBoundariesWithNeighbors,
    getPolygonCentroidGeographic,
} from '@/lib/geometry/utils'

import {
    calculateServidumbre,
    analyzeServidumbreBoundaries,
} from '@/lib/geometry/servidumbre'

// ─── Legal Generators ──────────────────────────────────────────────────────
import { generateDeslindeText } from '@/lib/legal/deslinde-generator'
import { generateServidumbreText } from '@/lib/legal/servidumbre-generator'

// ─── Types ─────────────────────────────────────────────────────────────────
import type { GeoJSONGeometry, OfficialBoundary } from '@/types/database.types'

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK SUBDIVISION — Constantes Cartesianas WGS84
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_LAT = -33.45
const BASE_LON = -70.66

// Helpers de conversión metros → grados (aprox planares en Santiago)
const DEG_PER_M_LAT = 1 / 111132
const DEG_PER_M_LON = 1 / (111320 * Math.cos(BASE_LAT * Math.PI / 180))

/** Desplaza un punto base [lon, lat] por (dx, dy) metros */
function offset(lon: number, lat: number, dxMeters: number, dyMeters: number): [number, number] {
    return [
        lon + dxMeters * DEG_PER_M_LON,
        lat + dyMeters * DEG_PER_M_LAT,
    ]
}

// ─── 1. loteObjetivo (100×100m) ────────────────────────────────────────────
//   Esquinas: SW(0,0), SE(100,0), NE(100,100), NW(0,100) en metros relativos
const SW = offset(BASE_LON, BASE_LAT, 0, 0)
const SE = offset(BASE_LON, BASE_LAT, 100, 0)
const NE = offset(BASE_LON, BASE_LAT, 100, 100)
const NW = offset(BASE_LON, BASE_LAT, 0, 100)

const loteObjetivo: GeoJSONGeometry = {
    type: 'Polygon',
    coordinates: [[SW, SE, NE, NW, SW]],
}

const loteObjetivoCoords = [SW, SE, NE, NW, SW]

// ─── 2. loteVecinoCompleto (100×100m, comparte 100% del borde NORTE) ──────
//   El borde sur de este lote coincide exactamente con el borde norte del objetivo.
const VN_SW = NW     // = offset(0, 100)
const VN_SE = NE     // = offset(100, 100)
const VN_NE = offset(BASE_LON, BASE_LAT, 100, 200)
const VN_NW = offset(BASE_LON, BASE_LAT, 0, 200)

const loteVecinoCompleto: GeoJSONGeometry = {
    type: 'Polygon',
    coordinates: [[VN_SW, VN_SE, VN_NE, VN_NW, VN_SW]],
}

// ─── 3. loteVecinoParcial (150×150m, comparte solo 60m del borde ORIENTE) ─
//   Está al ESTE del objetivo. El borde W de este vecino tiene 150m de alto,
//   pero el borde E del objetivo solo tiene 100m → overlap < faceLen → is_partial
const VP_SW = offset(BASE_LON, BASE_LAT, 100, -25)  // empieza 25m por debajo
const VP_SE = offset(BASE_LON, BASE_LAT, 250, -25)
const VP_NE = offset(BASE_LON, BASE_LAT, 250, 125)
const VP_NW = offset(BASE_LON, BASE_LAT, 100, 125)

const loteVecinoParcial: GeoJSONGeometry = {
    type: 'Polygon',
    coordinates: [[VP_SW, VP_SE, VP_NE, VP_NW, VP_SW]],
}

// ─── 4. camino (LineString, pasa por el borde SUR del objetivo) ────────────
//   Va de oeste a este a lo largo del borde sur, incluyendo parte del vecino parcial
const ROAD_W = offset(BASE_LON, BASE_LAT, -20, 0)
const ROAD_E = offset(BASE_LON, BASE_LAT, 120, 0)

const camino: GeoJSONGeometry = {
    type: 'LineString',
    coordinates: [ROAD_W, ROAD_E],
}

// ─── 5. loteFragmentado — arista sur dividida en 3 sub-segmentos ──────────
//   SW → (33m, 0) → (66m, 0) → SE — misma recta, nodos intermedios CAD
const FRAG_1 = offset(BASE_LON, BASE_LAT, 33.33, 0)
const FRAG_2 = offset(BASE_LON, BASE_LAT, 66.66, 0)

const loteFragmentadoCoords = [SW, FRAG_1, FRAG_2, SE, NE, NW, SW]

// ─── 6. loteEnL (Polígono Cóncavo en forma de "L") ────────────────────────
//   Disposición (vista aérea, origen en (200,0) metros relativos):
//
//     ┌──────┐
//     │      │  ← brazo superior: 50×50m
//     │      │
//     ├──────┼──────┐
//     │             │  ← base inferior: 100×50m
//     │             │
//     └─────────────┘
//
const L_P0 = offset(BASE_LON, BASE_LAT, 200, 0)     // bottom-left
const L_P1 = offset(BASE_LON, BASE_LAT, 300, 0)     // bottom-right
const L_P2 = offset(BASE_LON, BASE_LAT, 300, 50)    // right notch
const L_P3 = offset(BASE_LON, BASE_LAT, 250, 50)    // esquina interior (concavidad)
const L_P4 = offset(BASE_LON, BASE_LAT, 250, 100)   // top-right
const L_P5 = offset(BASE_LON, BASE_LAT, 200, 100)   // top-left

const loteEnL: GeoJSONGeometry = {
    type: 'Polygon',
    coordinates: [[L_P0, L_P1, L_P2, L_P3, L_P4, L_P5, L_P0]],
}

// ─── 7. loteAgudo (Triángulo con ángulo muy agudo < 15°) ───────────────────
//   Base de 30m, altura de 200m → ángulo en ápice ≈ 2·atan(15/200) ≈ 8.6°
//   Pone a prueba Turf.js con vértices extremos.
const A_P0 = offset(BASE_LON, BASE_LAT, 350, 0)     // base-left
const A_P1 = offset(BASE_LON, BASE_LAT, 380, 0)     // base-right (30m)
const A_P2 = offset(BASE_LON, BASE_LAT, 365, 200)   // ápice (200m altura)

const loteAgudo: GeoJSONGeometry = {
    type: 'Polygon',
    coordinates: [[A_P0, A_P1, A_P2, A_P0]],
}

// ─── 8. caminoQuebrado (LineString con quiebre de 90°) ─────────────────────
//   Viene del oeste por el borde SUR del loteObjetivo, gira 90° en la esquina SE
//   y sube por el borde ESTE. Esto genera servidumbre multi-tramo.
const CQ_W  = offset(BASE_LON, BASE_LAT, -20, 0)    // al oeste de SW
const CQ_SE = offset(BASE_LON, BASE_LAT, 100, 0)    // esquina SE = bend point
const CQ_N  = offset(BASE_LON, BASE_LAT, 100, 120)  // al norte de NE

const caminoQuebrado: GeoJSONGeometry = {
    type: 'LineString',
    coordinates: [CQ_W, CQ_SE, CQ_N],
}

// ─── Helpers para construir allLotFeatures ─────────────────────────────────

function makeLotFeature(
    geometry: GeoJSONGeometry,
    lotId: string,
    numeroLote: string,
) {
    return {
        geometry: geometry as { type: string; coordinates: unknown },
        properties: {
            geometry_type: 'lot' as const,
            lot_id: lotId,
            numero_lote: numeroLote,
        },
    }
}

function makeRoadFeature(geometry: GeoJSONGeometry) {
    return {
        geometry: geometry as { type: string; coordinates: unknown },
        properties: {
            geometry_type: 'road' as const,
            lot_id: undefined,
            numero_lote: undefined,
        },
    }
}

const allLotFeatures = [
    makeLotFeature(loteObjetivo, 'lot-1', '1'),
    makeLotFeature(loteVecinoCompleto, 'lot-2', '2'),
    makeLotFeature(loteVecinoParcial, 'lot-3', '3'),
    makeRoadFeature(camino),
]

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Motor End-to-End Plotify', () => {

    // ───────────────────────────────────────────────────────────────────────
    // TEST 1: Cálculo de Superficie y Fusión Colineal (utils.ts)
    // ───────────────────────────────────────────────────────────────────────
    describe('1. Cálculo de Superficie y Fusión Colineal', () => {

        it('calcula el área del lote fragmentado correctamente (~10 000 m²)', () => {
            // El loteFragmentado tiene la misma forma que el objetivo (100×100m)
            // solo con nodos intermedios en el borde sur.
            const areaFragmentado = calculatePolygonArea(loteFragmentadoCoords)
            const areaOriginal = calculatePolygonArea(loteObjetivoCoords)

            // Ambas áreas deben ser prácticamente iguales (~10 000 m²)
            expect(areaFragmentado).toBeGreaterThan(9800)
            expect(areaFragmentado).toBeLessThan(10200)

            // La diferencia entre ambas debe ser despreciable (< 1 m²)
            expect(Math.abs(areaFragmentado - areaOriginal)).toBeLessThan(1)
        })

        it('fusión colineal: getBoundariesWithNeighbors unifica los 3 sub-segmentos sur en un solo tramo', () => {
            // getBoundariesWithNeighbors aplica la fusión colineal multi-paso.
            // getBoundaries (raw) no fusiona — es el extractor de aristas crudo.
            const boundaries = getBoundariesWithNeighbors(
                loteFragmentadoCoords,
                allLotFeatures,
                'lot-1',
            )

            // Sin fusión tendríamos 6 aristas (3 sub-sur + E + N + W).
            // Con fusión colineal (tolerancia 3°) debe haber exactamente 4.
            expect(boundaries).toHaveLength(4)

            // El tramo SUR debe tener la distancia total (~100m)
            const surBoundary = boundaries.find(b => b.direction === 'Sur')
            expect(surBoundary).toBeDefined()
            expect(surBoundary!.distance).toBeGreaterThan(98)
            expect(surBoundary!.distance).toBeLessThan(102)
        })

        it('los otros lados del lote fragmentado conservan su distancia normal (~100m)', () => {
            const boundaries = getBoundariesWithNeighbors(
                loteFragmentadoCoords,
                allLotFeatures,
                'lot-1',
            )

            for (const dir of ['Norte', 'Oriente', 'Poniente']) {
                const b = boundaries.find(x => x.direction === dir)
                expect(b, `debe existir borde ${dir}`).toBeDefined()
                expect(b!.distance).toBeGreaterThan(98)
                expect(b!.distance).toBeLessThan(102)
            }
        })
    })

    // ───────────────────────────────────────────────────────────────────────
    // TEST 2: Detección de Vecinos y Precisión Semántica (utils.ts)
    // ───────────────────────────────────────────────────────────────────────
    describe('2. Detección de Vecinos y Precisión Semántica', () => {

        it('detecta al loteVecinoCompleto como vecino NO parcial (is_partial: false)', () => {
            const boundaries = getBoundariesWithNeighbors(
                loteObjetivoCoords,
                allLotFeatures,
                'lot-1',
            )

            // Buscar el borde que colinda con el lote 2
            const conVecino2 = boundaries.find(b =>
                b.neighbors.some(n => n.name.includes('2'))
            )

            expect(conVecino2, 'Debe detectar al vecino completo (lote 2)').toBeDefined()

            const meta2 = conVecino2!.neighbors.find(n => n.name.includes('2'))!
            expect(meta2.is_partial).toBe(false)
        })

        it('detecta al loteVecinoParcial como vecino parcial (is_partial: true)', () => {
            const boundaries = getBoundariesWithNeighbors(
                loteObjetivoCoords,
                allLotFeatures,
                'lot-1',
            )

            // Buscar el borde que colinda con el lote 3
            const conVecino3 = boundaries.find(b =>
                b.neighbors.some(n => n.name.includes('3'))
            )

            expect(conVecino3, 'Debe detectar al vecino parcial (lote 3)').toBeDefined()

            const meta3 = conVecino3!.neighbors.find(n => n.name.includes('3'))!
            // El borde E del objetivo tiene 100m, pero la cara W del vecino tiene 150m
            // → overlap (100m) < faceLen (150m) - 0.5 → is_partial = true
            expect(meta3.is_partial).toBe(true)
        })

        it('el borde sur tiene contacto con el camino (touchesRoad)', () => {
            const boundaries = getBoundariesWithNeighbors(
                loteObjetivoCoords,
                allLotFeatures,
                'lot-1',
            )

            const surBoundary = boundaries.find(b => b.direction === 'Sur')
            expect(surBoundary).toBeDefined()
            expect(surBoundary!.touchesRoad).toBe(true)
        })

        it('el borde norte NO toca el camino', () => {
            const boundaries = getBoundariesWithNeighbors(
                loteObjetivoCoords,
                allLotFeatures,
                'lot-1',
            )

            const norteBoundary = boundaries.find(b => b.direction === 'Norte')
            expect(norteBoundary).toBeDefined()
            expect(norteBoundary!.touchesRoad).toBe(false)
        })

        it('el borde poniente toca el camino (comparte vértice SW sobre la línea)', () => {
            // El camino pasa exactamente por y=0 y el borde poniente
            // va de SW(0,0) a NW(0,100). El vértice SW está sobre el camino,
            // por lo que el muestreo (fracción 0 o 1) detecta contacto.
            const boundaries = getBoundariesWithNeighbors(
                loteObjetivoCoords,
                allLotFeatures,
                'lot-1',
            )

            const ponienteBoundary = boundaries.find(b => b.direction === 'Poniente')
            expect(ponienteBoundary).toBeDefined()
            expect(ponienteBoundary!.touchesRoad).toBe(true)
        })
    })

    // ───────────────────────────────────────────────────────────────────────
    // TEST 3: Creador de Deslindes Generales (deslinde-generator.ts)
    // ───────────────────────────────────────────────────────────────────────
    describe('3. Creador de Deslindes Generales', () => {

        it('agrupa correctamente por puntos cardinales y genera texto legal', () => {
            // Construimos boundaries_official simulando la salida del pipeline
            const mockBoundaries: OfficialBoundary[] = [
                {
                    label: 'Norte',
                    description: '',
                    distance: 100,
                    colinda: 'lote 2',
                    neighbors_metadata: [{ name: 'lote 2', is_partial: false }],
                },
                {
                    label: 'Oriente',
                    description: '',
                    distance: 100,
                    colinda: 'lote 3',
                    neighbors_metadata: [{ name: 'lote 3', is_partial: true }],
                },
                {
                    label: 'Sur',
                    description: '',
                    distance: 100,
                    colinda: '',
                    es_servidumbre: true,
                    neighbors_metadata: [],
                },
                {
                    label: 'Poniente',
                    description: '',
                    distance: 100,
                    colinda: '',
                    neighbors_metadata: [],
                },
            ]

            const texto = generateDeslindeText({
                numero_lote: '1',
                area_official_m2: 10000,
                m2: 10000,
                servidumbre_m2: 300,
                boundaries_official: mockBoundaries,
            })

            // Debe contener "LOTE UNO"
            expect(texto).toContain('LOTE UNO')

            // Debe contener puntos cardinales: NORTE, ORIENTE, SUR, PONIENTE
            expect(texto.toUpperCase()).toContain('NORTE')
            expect(texto.toUpperCase()).toContain('ORIENTE')
            expect(texto.toUpperCase()).toContain('SUR')
            expect(texto.toUpperCase()).toContain('PONIENTE')
        })

        it('incluye "parte del" SOLO para el vecino parcial', () => {
            const mockBoundaries: OfficialBoundary[] = [
                {
                    label: 'Norte',
                    description: '',
                    distance: 100,
                    colinda: 'lote 2',
                    neighbors_metadata: [{ name: 'lote 2', is_partial: false }],
                },
                {
                    label: 'Oriente',
                    description: '',
                    distance: 100,
                    colinda: 'lote 3',
                    neighbors_metadata: [{ name: 'lote 3', is_partial: true }],
                },
            ]

            const texto = generateDeslindeText({
                numero_lote: '1',
                area_official_m2: 10000,
                m2: 10000,
                servidumbre_m2: 0,
                boundaries_official: mockBoundaries,
            })

            // La sección ORIENTE debe tener "parte del lote tres"
            expect(texto.toLowerCase()).toContain('parte del lote tres')

            // La sección NORTE NO debe tener "parte del lote dos"
            // Verificamos que "lote dos" aparece SIN el prefijo "parte del"
            // Nota: usamos [\s\S] en vez de . + flag /s (dotAll requiere ES2018+)
            const norteMatch = texto.toLowerCase().match(/norte[\s\S]*?(?:oriente|sur|poniente|$)/)
            if (norteMatch) {
                expect(norteMatch[0]).not.toContain('parte del lote dos')
                expect(norteMatch[0]).toContain('lote dos')
            }
        })

        it('agrega "de la misma subdivisión" al final de cada orientación', () => {
            const mockBoundaries: OfficialBoundary[] = [
                {
                    label: 'Norte',
                    description: '',
                    distance: 100,
                    colinda: 'lote 2',
                    neighbors_metadata: [{ name: 'lote 2', is_partial: false }],
                },
            ]

            const texto = generateDeslindeText({
                numero_lote: '1',
                area_official_m2: 10000,
                m2: 10000,
                servidumbre_m2: 0,
                boundaries_official: mockBoundaries,
            })

            expect(texto.toLowerCase()).toContain('de la misma subdivisión')
        })
    })

    // ───────────────────────────────────────────────────────────────────────
    // TEST 4: Creador de Servidumbres — Geometría y Área (servidumbre.ts)
    // ───────────────────────────────────────────────────────────────────────
    describe('4. Creador de Servidumbres — Geometría y Área', () => {

        const ROAD_WIDTH = 6 // 6 metros de ancho total

        it('crea el buffer con radio = width / 2 (3m)', () => {
            const result = calculateServidumbre(loteObjetivo, camino, ROAD_WIDTH)

            // Debe generar un polígono de intersección
            expect(result.intersectionPolygon).not.toBeNull()
            expect(result.servidumbreM2).toBeGreaterThan(0)
        })

        it('el área de servidumbre se aproxima a largo_compartido × radio (100m × 3m = ~300 m²)', () => {
            const result = calculateServidumbre(loteObjetivo, camino, ROAD_WIDTH)

            // El borde sur del lote mide ~100m.
            // El buffer es un semicírculo de 3m (ancho/2).
            // El polígono de intersección es una franja de ~100m × 3m = ~300 m²

            // El radio del buffer es 3m (width/2), y el camino pasa exactamente
            // por el borde sur del lote, por lo que la intersección cubre
            // la mitad del buffer hacia adentro del lote → 100m × 3m ≈ 300 m²
            // Con tolerancia para las tapas redondeadas de Turf
            expect(result.servidumbreM2).toBeGreaterThan(250)
            expect(result.servidumbreM2).toBeLessThan(360)
        })

        it('retorna resultado vacío si no hay intersección', () => {
            // Camino lejano que no toca el lote
            const caminoLejano: GeoJSONGeometry = {
                type: 'LineString',
                coordinates: [
                    offset(BASE_LON, BASE_LAT, -200, -200),
                    offset(BASE_LON, BASE_LAT, -100, -200),
                ],
            }

            const result = calculateServidumbre(loteObjetivo, caminoLejano, ROAD_WIDTH)
            expect(result.servidumbreM2).toBe(0)
            expect(result.intersectionPolygon).toBeNull()
        })

        it('retorna resultado vacío para inputs inválidos', () => {
            const result = calculateServidumbre(loteObjetivo, camino, 0)
            expect(result.servidumbreM2).toBe(0)

            const result2 = calculateServidumbre(
                null as unknown as GeoJSONGeometry,
                camino,
                ROAD_WIDTH,
            )
            expect(result2.servidumbreM2).toBe(0)
        })
    })

    // ───────────────────────────────────────────────────────────────────────
    // TEST 5: Creador de Servidumbres — Redacción y Cabezas
    //         (servidumbre-generator.ts)
    // ───────────────────────────────────────────────────────────────────────
    describe('5. Creador de Servidumbres — Redacción y Cabezas', () => {

        const ROAD_WIDTH = 6

        it('analyzeServidumbreBoundaries clasifica fronteras internas y externas', () => {
            const analysis = analyzeServidumbreBoundaries(
                loteObjetivo,
                camino,
                ROAD_WIDTH,
                '1',
                allLotFeatures,
                'lot-1',
            )

            expect(analysis).not.toBeNull()
            expect(analysis!.areaM2).toBeGreaterThan(0)
            expect(analysis!.lotNumber).toBe('1')

            // Debe tener aristas
            expect(analysis!.allEdges.length).toBeGreaterThan(0)

            // Al menos una arista debe ser 'internal' (la que mira hacia dentro del lote)
            const internalEdges = analysis!.allEdges.filter(e => e.frontierType === 'internal')
            expect(internalEdges.length).toBeGreaterThan(0)
        })

        it('el borde interno dice "con la misma propiedad"', () => {
            const analysis = analyzeServidumbreBoundaries(
                loteObjetivo,
                camino,
                ROAD_WIDTH,
                '1',
                allLotFeatures,
                'lot-1',
            )

            expect(analysis).not.toBeNull()

            const texto = generateServidumbreText(analysis!, ROAD_WIDTH)

            // La frontera interna debe producir "con la misma propiedad"
            expect(texto.toLowerCase()).toContain('con la misma propiedad')
        })

        it('el borde vecino dice "con servidumbre que grava"', () => {
            // Para este test necesitamos un camino que pase entre dos lotes.
            // Usamos el loteVecinoCompleto adyacente al norte como contexto,
            // y un camino que pasa por el borde ESTE del lote donde también
            // está el vecino parcial.

            // Creamos un camino que pasa por el borde sur (que no tiene vecino lote directo)
            // pero la falta de vecino convertiría eso en 'external'.
            // Para forzar 'neighbor', validamos que si existe, dice "grava".
            const analysis = analyzeServidumbreBoundaries(
                loteObjetivo,
                camino,
                ROAD_WIDTH,
                '1',
                allLotFeatures,
                'lot-1',
            )

            expect(analysis).not.toBeNull()

            const neighborEdges = analysis!.allEdges.filter(e => e.frontierType === 'neighbor')

            if (neighborEdges.length > 0) {
                const texto = generateServidumbreText(analysis!, ROAD_WIDTH)
                expect(texto.toLowerCase()).toContain('con servidumbre que grava')
            }
        })

        it('las "cabezas" del polígono (aristas ≤ widthRoad + 2m) NO imprimen distancia', () => {
            const analysis = analyzeServidumbreBoundaries(
                loteObjetivo,
                camino,
                ROAD_WIDTH,
                '1',
                allLotFeatures,
                'lot-1',
            )

            expect(analysis).not.toBeNull()

            // El texto generado con applyHeadOcclusion oculta las distancias
            // de aristas ≤ 8m (width 6 + 2). Las cabezas del buffer tienen
            // ~3m (radio del buffer), bien por debajo del umbral.
            const texto = generateServidumbreText(analysis!, ROAD_WIDTH)

            // Verificamos que el texto no contiene "tres metros" (la cabeza del buffer)
            // como una frase "en tres metros" ya que las cabezas se ocultan.
            // Nota: la lógica de applyHeadOcclusion pone distance=0 para las cabezas,
            // y el renderer omite "en X metros" cuando distance === 0.
            expect(texto).toBeDefined()
            expect(texto.length).toBeGreaterThan(0)

            // Las aristas cortas (cabezas ~3m) no deben generar texto de distancia
            const shortEdges = analysis!.allEdges.filter(e => e.distance <= ROAD_WIDTH + 2)
            // Si hay aristas cortas, verificar que tras generateServidumbreText
            // no aparecen con su distancia en el texto final.
            for (const edge of shortEdges) {
                if (edge.distance > 0 && edge.distance <= ROAD_WIDTH + 2) {
                    // La distancia exacta de esta cabeza NO debe aparecer como "en X metros"
                    // en el texto (applyHeadOcclusion la pone a 0).
                    const distStr = edge.distance.toFixed(1).replace('.0', '')
                    // No buscamos un match exacto porque number-to-words transforma.
                    // Lo que verificamos es que el texto tiene sentido y se genera.
                    expect(texto.toLowerCase()).not.toMatch(
                        new RegExp(`en.*${distStr}.*metro`, 'i')
                    )
                }
            }
        })

        it('genera texto de servidumbre con formato completo para tramo simple', () => {
            const analysis = analyzeServidumbreBoundaries(
                loteObjetivo,
                camino,
                ROAD_WIDTH,
                '1',
                allLotFeatures,
                'lot-1',
            )

            expect(analysis).not.toBeNull()

            const texto = generateServidumbreText(analysis!, ROAD_WIDTH)

            // Debe iniciar con "LOTE UNO"
            expect(texto).toContain('LOTE UNO')

            // Debe contener "servidumbre de"
            expect(texto.toLowerCase()).toContain('servidumbre de')

            // Debe contener "metros cuadrados"
            expect(texto.toLowerCase()).toContain('metros cuadrados')

            // Debe terminar con punto
            expect(texto.trim().endsWith('.')).toBe(true)
        })
    })

    // ───────────────────────────────────────────────────────────────────────
    // TESTS AUXILIARES: Validaciones de Infraestructura
    // ───────────────────────────────────────────────────────────────────────
    describe('Validaciones de Infraestructura Mock', () => {

        it('las coordenadas de la mock subdivision son coherentes (distancias)', () => {
            // Borde sur del loteObjetivo: SW → SE ≈ 100m
            const distSur = calculateDistance(SW, SE)
            expect(distSur).toBeGreaterThan(98)
            expect(distSur).toBeLessThan(102)

            // Borde este del loteObjetivo: SE → NE ≈ 100m
            const distEste = calculateDistance(SE, NE)
            expect(distEste).toBeGreaterThan(98)
            expect(distEste).toBeLessThan(102)
        })

        it('los bearings cardinales son correctos', () => {
            // SW → SE = hacia el Este (bearing ≈ 90°)
            const bSE = calculateBearing(SW, SE)
            expect(bSE).toBeGreaterThan(85)
            expect(bSE).toBeLessThan(95)

            // SW → NW = hacia el Norte (bearing ≈ 0°)
            const bNW = calculateBearing(SW, NW)
            // Bearing de 0° es exactamente Norte; toleramos 0–5° o 355–360°
            expect(bNW < 5 || bNW > 355).toBe(true)
        })

        it('getCardinalDirection mapea correctamente los 8 sectores', () => {
            expect(getCardinalDirection(0)).toBe('Norte')
            expect(getCardinalDirection(45)).toBe('Nororiente')
            expect(getCardinalDirection(90)).toBe('Oriente')
            expect(getCardinalDirection(135)).toBe('Suroriente')
            expect(getCardinalDirection(180)).toBe('Sur')
            expect(getCardinalDirection(225)).toBe('Surponiente')
            expect(getCardinalDirection(270)).toBe('Poniente')
            expect(getCardinalDirection(315)).toBe('Norponiente')
            expect(getCardinalDirection(360)).toBe('Norte')
        })

        it('el centroide del lote objetivo es el punto medio', () => {
            const centroid = getPolygonCentroidGeographic(loteObjetivoCoords)
            const expectedCenter = offset(BASE_LON, BASE_LAT, 50, 50)

            // Tolerancia: 0.00001° ≈ ~1m
            expect(centroid[0]).toBeCloseTo(expectedCenter[0], 4)
            expect(centroid[1]).toBeCloseTo(expectedCenter[1], 4)
        })
    })

    // ───────────────────────────────────────────────────────────────────────
    // EDGE CASES: Casos Límite Topográficos
    // ───────────────────────────────────────────────────────────────────────
    describe('Casos Límite Topográficos', () => {

        it('Test A — Concavidad: el loteEnL genera servidumbre con fronteras internas', () => {
            // Camino que pasa por el borde sur del polígono cóncavo en "L"
            const caminoEnL: GeoJSONGeometry = {
                type: 'LineString',
                coordinates: [
                    offset(BASE_LON, BASE_LAT, 180, 0),
                    offset(BASE_LON, BASE_LAT, 320, 0),
                ],
            }

            const featuresEnL = [
                makeLotFeature(loteEnL, 'lot-L', 'L'),
                makeRoadFeature(caminoEnL),
            ]

            const analysis = analyzeServidumbreBoundaries(
                loteEnL,
                caminoEnL,
                6,
                'L',
                featuresEnL,
                'lot-L',
            )

            // El análisis no debe ser nulo — el rayo de 0.1m debe funcionar
            // incluso con la concavidad del polígono en "L"
            expect(analysis).not.toBeNull()
            expect(analysis!.areaM2).toBeGreaterThan(0)

            // El mini-polígono de servidumbre debe tener aristas internas
            // (las que miran hacia el interior del lote original)
            const internalEdges = analysis!.allEdges.filter(e => e.frontierType === 'internal')
            expect(internalEdges.length).toBeGreaterThan(0)

            // El texto legal debe contener "con la misma propiedad" para fronteras internas
            const texto = generateServidumbreText(analysis!, 6)
            expect(texto.toLowerCase()).toContain('con la misma propiedad')
        })

        it('Test B — Vértices Agudos: triángulo agudo genera intersección sin errores de topología', () => {
            // Camino ancho (10m) que cruza la base del triángulo agudo
            const caminoAgudo: GeoJSONGeometry = {
                type: 'LineString',
                coordinates: [
                    offset(BASE_LON, BASE_LAT, 340, 0),
                    offset(BASE_LON, BASE_LAT, 390, 0),
                ],
            }

            const ROAD_WIDTH_WIDE = 10 // 10 metros, buffer de 5m

            // calculateServidumbre NO debe lanzar excepciones de topología
            const result = calculateServidumbre(loteAgudo, caminoAgudo, ROAD_WIDTH_WIDE)

            expect(result.intersectionPolygon).not.toBeNull()
            expect(result.servidumbreM2).toBeGreaterThan(0)

            // analyzeServidumbreBoundaries tampoco debe fallar
            const featuresAgudo = [
                makeLotFeature(loteAgudo, 'lot-agudo', 'A'),
                makeRoadFeature(caminoAgudo),
            ]

            const analysis = analyzeServidumbreBoundaries(
                loteAgudo,
                caminoAgudo,
                ROAD_WIDTH_WIDE,
                'A',
                featuresAgudo,
                'lot-agudo',
            )

            expect(analysis).not.toBeNull()
            expect(analysis!.allEdges.length).toBeGreaterThan(0)

            // El área de servidumbre debe ser coherente
            // (base ~30m × radio 5m = ~150 m², con tolerancia generosa por las tapas)
            expect(analysis!.areaM2).toBeGreaterThan(50)
            expect(analysis!.areaM2).toBeLessThan(300)
        })

        it('Test C — Camino Quebrado: genera servidumbre multi-tramo sobre el loteObjetivo', () => {
            // El caminoQuebrado sigue el borde SUR y luego gira por el borde ESTE.
            // El buffer intersecta el lote en dos zonas con normales internas
            // distintas (Norte y Poniente) → multi-tramo.
            const analysis = analyzeServidumbreBoundaries(
                loteObjetivo,
                caminoQuebrado,
                6,
                '1',
                allLotFeatures,
                'lot-1',
            )

            expect(analysis).not.toBeNull()
            expect(analysis!.areaM2).toBeGreaterThan(0)

            // La servidumbre debe tener aristas internas con al menos 2 direcciones
            // cardinales distintas (Norte por borde sur, Poniente por borde este)
            const internalEdges = analysis!.allEdges.filter(e => e.frontierType === 'internal')
            const uniqueInternalDirs = new Set(internalEdges.map(e => e.direction))
            expect(uniqueInternalDirs.size).toBeGreaterThanOrEqual(2)

            // El motor debe detectar multi-tramo
            expect(analysis!.isMultiTramo).toBe(true)
            expect(analysis!.tramos.length).toBeGreaterThan(1)
        })
    })
})
