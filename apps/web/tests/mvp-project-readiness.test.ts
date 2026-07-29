/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import { calculateLegalMetrics } from '@/lib/geometry/utm'
import { getBoundaries } from '@/lib/geometry/utils'
import { generateDeslindeText } from '@/lib/legal/deslinde-generator'
import type { OfficialBoundary } from '@/types/database.types'
import { validateLotDocumentReadiness } from '@/lib/legal/readiness'
import { kmlToGeoJSON, normalizeGeoJSON } from '@/lib/services/kml-to-geojson.service'

const BASE_LAT = -33.45
const BASE_LON = -70.66
const DEG_PER_M_LAT = 1 / 111132
const DEG_PER_M_LON = 1 / (111320 * Math.cos((BASE_LAT * Math.PI) / 180))

function offset(dxMeters: number, dyMeters: number): [number, number] {
  return [BASE_LON + dxMeters * DEG_PER_M_LON, BASE_LAT + dyMeters * DEG_PER_M_LAT]
}

describe('MVP project readiness geometry contract', () => {
  it('derives boundary groups, perimeter, m2, hectares, and legal deslinde inputs', () => {
    const coords = [offset(0, 0), offset(100, 0), offset(100, 100), offset(0, 100), offset(0, 0)]

    const metrics = calculateLegalMetrics(coords)
    const boundaries = getBoundaries(coords)
    const officialBoundaries: OfficialBoundary[] = boundaries.map((boundary) => ({
      label: boundary.direction,
      description: `${boundary.direction} ${boundary.distance.toFixed(2)}m`,
      distance: Number(boundary.distance.toFixed(2)),
      colinda: `Lote ${boundary.direction}`,
    }))
    const deslindeText = generateDeslindeText({
      numero_lote: '24',
      area_official_m2: Math.round(metrics.area_legal_m2),
      m2: Math.round(metrics.area_geodesic_m2),
      servidumbre_m2: 0,
      boundaries_official: officialBoundaries,
    })

    expect(metrics.area_legal_m2).toBeGreaterThan(9900)
    expect(metrics.area_legal_m2).toBeLessThan(10100)
    expect(metrics.area_legal_m2 / 10000).toBeGreaterThan(0.99)
    expect(metrics.perimeter_legal_m).toBeGreaterThan(395)
    expect(metrics.perimeter_legal_m).toBeLessThan(405)
    expect(new Set(boundaries.map((boundary) => boundary.direction))).toEqual(
      new Set(['Norte', 'Sur', 'Oriente', 'Poniente'])
    )
    expect(officialBoundaries).toHaveLength(4)
    expect(deslindeText).toContain('METROS CUADRADOS')
    expect(deslindeText).toContain('deslinda')
    expect(deslindeText).toContain('NORTE')
    expect(deslindeText).toContain('SUR')
  })
})

describe('MVP project readiness KMZ/KML upload validation', () => {
  it('preserves and normalizes source properties in KML-to-GeoJSON extraction', () => {
    const kmlWithExtendedProperties = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Lote 24</name>
      <ExtendedData>
        <Data name="superficie_m2"><value>5000.5</value></Data>
        <Data name="Layer"><value>Manzana A</value></Data>
      </ExtendedData>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              -70.66,-33.45,0
              -70.65,-33.45,0
              -70.65,-33.46,0
              -70.66,-33.46,0
              -70.66,-33.45,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`

    const geojson = kmlToGeoJSON(kmlWithExtendedProperties)
    const classified = normalizeGeoJSON(geojson)

    expect(classified).toHaveLength(1)
    expect(classified[0].properties.name).toBe('Lote 24')
    expect(classified[0].properties.inferred_lot_number).toBe('24')
    expect(classified[0].properties.superficie_m2).toBe('5000.5')
    expect(classified[0].properties.layer).toBe('Manzana A')
  })
})

describe('MVP lot verification and document readiness', () => {
  it('rejects lot if verified_status is draft or null', () => {
    const lotDraft = {
      verified_status: 'draft' as const,
      area_official_m2: 5000,
      perimeter_official_m: 300,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: 100, colinda: 'Lote 1' },
      ],
    }
    const resultDraft = validateLotDocumentReadiness(lotDraft)
    expect(resultDraft.isReady).toBe(false)
    expect(resultDraft.errors).toContain(
      'El lote debe estar verificado (verified_exact o verified_override)'
    )

    const lotNull = {
      verified_status: null,
      area_official_m2: 5000,
      perimeter_official_m: 300,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: 100, colinda: 'Lote 1' },
      ],
    }
    const resultNull = validateLotDocumentReadiness(lotNull)
    expect(resultNull.isReady).toBe(false)
    expect(resultNull.errors).toContain(
      'El lote debe estar verificado (verified_exact o verified_override)'
    )
  })

  it('rejects lot if area_official_m2 is missing or zero/negative', () => {
    const lotMissingArea = {
      verified_status: 'verified_exact' as const,
      area_official_m2: null,
      perimeter_official_m: 300,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: 100, colinda: 'Lote 1' },
      ],
    }
    const resultMissing = validateLotDocumentReadiness(lotMissingArea)
    expect(resultMissing.isReady).toBe(false)
    expect(resultMissing.errors).toContain('La superficie oficial es requerida')

    const lotZeroArea = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 0,
      perimeter_official_m: 300,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: 100, colinda: 'Lote 1' },
      ],
    }
    const resultZero = validateLotDocumentReadiness(lotZeroArea)
    expect(resultZero.isReady).toBe(false)
    expect(resultZero.errors).toContain('La superficie oficial debe ser mayor a 0')

    const lotNegativeArea = {
      verified_status: 'verified_exact' as const,
      area_official_m2: -100,
      perimeter_official_m: 300,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: 100, colinda: 'Lote 1' },
      ],
    }
    const resultNegative = validateLotDocumentReadiness(lotNegativeArea)
    expect(resultNegative.isReady).toBe(false)
    expect(resultNegative.errors).toContain('La superficie oficial debe ser mayor a 0')
  })

  it('rejects lot if perimeter_official_m is missing or zero/negative', () => {
    const lotMissingPerimeter = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 5000,
      perimeter_official_m: null,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: 100, colinda: 'Lote 1' },
      ],
    }
    const resultMissing = validateLotDocumentReadiness(lotMissingPerimeter)
    expect(resultMissing.isReady).toBe(false)
    expect(resultMissing.errors).toContain('El perímetro oficial es requerido')

    const lotZeroPerimeter = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 5000,
      perimeter_official_m: 0,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: 100, colinda: 'Lote 1' },
      ],
    }
    const resultZero = validateLotDocumentReadiness(lotZeroPerimeter)
    expect(resultZero.isReady).toBe(false)
    expect(resultZero.errors).toContain('El perímetro oficial debe ser mayor a 0')

    const lotNegativePerimeter = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 5000,
      perimeter_official_m: -50,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: 100, colinda: 'Lote 1' },
      ],
    }
    const resultNegative = validateLotDocumentReadiness(lotNegativePerimeter)
    expect(resultNegative.isReady).toBe(false)
    expect(resultNegative.errors).toContain('El perímetro oficial debe ser mayor a 0')
  })

  it('rejects lot if boundaries_official is missing or empty', () => {
    const lotMissingBoundaries = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 5000,
      perimeter_official_m: 300,
      boundaries_official: null,
    }
    const resultMissing = validateLotDocumentReadiness(lotMissingBoundaries)
    expect(resultMissing.isReady).toBe(false)
    expect(resultMissing.errors).toContain('Los deslindes oficiales son requeridos')

    const lotEmptyBoundaries = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 5000,
      perimeter_official_m: 300,
      boundaries_official: [],
    }
    const resultEmpty = validateLotDocumentReadiness(lotEmptyBoundaries)
    expect(resultEmpty.isReady).toBe(false)
    expect(resultEmpty.errors).toContain('Los deslindes oficiales son requeridos')
  })

  it('rejects lot if any boundary in boundaries_official is invalid', () => {
    const lotEmptyLabel = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 5000,
      perimeter_official_m: 300,
      boundaries_official: [
        { label: '', description: 'Norte 100m', distance: 100, colinda: 'Lote 1' },
      ],
    }
    const resultEmptyLabel = validateLotDocumentReadiness(lotEmptyLabel)
    expect(resultEmptyLabel.isReady).toBe(false)
    expect(resultEmptyLabel.errors).toContain(
      'Todos los deslindes oficiales deben tener orientación y una distancia mayor a 0'
    )

    const lotZeroDistance = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 5000,
      perimeter_official_m: 300,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: 0, colinda: 'Lote 1' },
      ],
    }
    const resultZeroDistance = validateLotDocumentReadiness(lotZeroDistance)
    expect(resultZeroDistance.isReady).toBe(false)
    expect(resultZeroDistance.errors).toContain(
      'Todos los deslindes oficiales deben tener orientación y una distancia mayor a 0'
    )

    const lotNegativeDistance = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 5000,
      perimeter_official_m: 300,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100m', distance: -5, colinda: 'Lote 1' },
      ],
    }
    const resultNegativeDistance = validateLotDocumentReadiness(lotNegativeDistance)
    expect(resultNegativeDistance.isReady).toBe(false)
    expect(resultNegativeDistance.errors).toContain(
      'Todos los deslindes oficiales deben tener orientación y una distancia mayor a 0'
    )
  })

  it('successfully accepts valid lot for document readiness', () => {
    const validLotExact = {
      verified_status: 'verified_exact' as const,
      area_official_m2: 5000,
      perimeter_official_m: 300,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 100.00 m', distance: 100, colinda: 'Lote 2' },
        { label: 'Sur', description: 'Sur 100.00 m', distance: 100, colinda: 'Lote 3' },
        { label: 'Oriente', description: 'Oriente 50.00 m', distance: 50, colinda: 'Camino' },
        { label: 'Poniente', description: 'Poniente 50.00 m', distance: 50, colinda: 'Lote 4' },
      ],
    }
    const resultExact = validateLotDocumentReadiness(validLotExact)
    expect(resultExact.isReady).toBe(true)
    expect(resultExact.errors).toHaveLength(0)

    const validLotOverride = {
      verified_status: 'verified_override' as const,
      area_official_m2: 4995.5,
      perimeter_official_m: 299.9,
      boundaries_official: [
        { label: 'Norte', description: 'Norte 99.90 m', distance: 99.9, colinda: 'Lote 2' },
        { label: 'Sur', description: 'Sur 100.00 m', distance: 100, colinda: 'Lote 3' },
        { label: 'Oriente', description: 'Oriente 50.00 m', distance: 50, colinda: 'Camino' },
        { label: 'Poniente', description: 'Poniente 50.00 m', distance: 50, colinda: 'Lote 4' },
      ],
    }
    const resultOverride = validateLotDocumentReadiness(validLotOverride)
    expect(resultOverride.isReady).toBe(true)
    expect(resultOverride.errors).toHaveLength(0)
  })
})
