import { describe, expect, it } from 'vitest'
import { createResilientMapStyle } from '@/lib/maps/resilient-map-style'

describe('createResilientMapStyle', () => {
  it('usa rutas Carto del mismo origen para conservar la apariencia de main', () => {
    const light = createResilientMapStyle('light')
    const dark = createResilientMapStyle('dark')

    expect(light.sources['plotify-basemap']).toMatchObject({
      type: 'raster',
      tiles: ['/api/map-tiles/{z}/{x}/{y}?theme=light'],
      attribution: '© OpenStreetMap contributors © CARTO',
    })
    expect(dark.sources['plotify-basemap']).toMatchObject({
      type: 'raster',
      tiles: ['/api/map-tiles/{z}/{x}/{y}?theme=dark'],
      attribution: '© OpenStreetMap contributors © CARTO',
    })
  })

  it('mantiene los fondos equivalentes a Positron y Dark Matter', () => {
    const light = createResilientMapStyle('light')
    const dark = createResilientMapStyle('dark')

    expect(light.layers[0]).toMatchObject({
      type: 'background',
      paint: { 'background-color': '#f2f2f2' },
    })
    expect(dark.layers[0]).toMatchObject({
      type: 'background',
      paint: { 'background-color': '#0e0e0e' },
    })
  })
})
