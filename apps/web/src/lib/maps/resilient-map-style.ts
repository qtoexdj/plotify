import type { StyleSpecification } from 'maplibre-gl'

export type MapTheme = 'light' | 'dark'

const CARTO_TILE_URLS: Record<MapTheme, string> = {
  light: '/api/map-tiles/{z}/{x}/{y}?theme=light',
  dark: '/api/map-tiles/{z}/{x}/{y}?theme=dark',
}

export function createResilientMapStyle(theme: MapTheme): StyleSpecification {
  const backgroundColor = theme === 'dark' ? '#0e0e0e' : '#f2f2f2'

  return {
    version: 8,
    name: `Plotify ${theme} basemap`,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      'plotify-basemap': {
        type: 'raster',
        tiles: [CARTO_TILE_URLS[theme]],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors © CARTO',
      },
    },
    layers: [
      {
        id: 'plotify-background',
        type: 'background',
        paint: {
          'background-color': backgroundColor,
        },
      },
      {
        id: 'plotify-basemap',
        type: 'raster',
        source: 'plotify-basemap',
        paint: {
          'raster-opacity': 1,
        },
      },
    ],
  }
}
