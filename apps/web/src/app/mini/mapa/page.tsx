'use client'

import React, { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MapLibreGL from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { createResilientMapStyle } from '@/lib/maps/resilient-map-style'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { useTelegram } from '@/lib/miniapp/telegram'
import { LotSheet } from './lot-sheet'

interface Proyecto {
  id: string
  name: string
}

interface FeatureProperties {
  id?: string
  lot_id?: string
  numero_lote?: string
  status?: 'disponible' | 'reservado' | 'vendido' | string
}

interface GeoJSONFeature {
  type: string
  id?: string
  geometry: {
    type: string
    coordinates: unknown
  }
  properties?: FeatureProperties
}

interface GeoJSONData {
  type: string
  features: GeoJSONFeature[]
}

function computeBounds(features: GeoJSONFeature[]): [[number, number], [number, number]] | null {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  let hasValid = false

  const processCoord = (coord: unknown) => {
    if (
      Array.isArray(coord) &&
      coord.length >= 2 &&
      typeof coord[0] === 'number' &&
      typeof coord[1] === 'number' &&
      !isNaN(coord[0]) &&
      !isNaN(coord[1])
    ) {
      const lng = coord[0]
      const lat = coord[1]
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
      hasValid = true
    }
  }

  const scanGeometry = (geometry: GeoJSONFeature['geometry']) => {
    if (!geometry || !geometry.coordinates) return
    const { type, coordinates } = geometry
    if (type === 'Polygon' && Array.isArray(coordinates)) {
      coordinates.forEach((ring: unknown) => {
        if (Array.isArray(ring)) ring.forEach(processCoord)
      })
    } else if (type === 'MultiPolygon' && Array.isArray(coordinates)) {
      coordinates.forEach((polygon: unknown) => {
        if (Array.isArray(polygon)) {
          polygon.forEach((ring: unknown) => {
            if (Array.isArray(ring)) ring.forEach(processCoord)
          })
        }
      })
    } else if (type === 'Point' && Array.isArray(coordinates)) {
      processCoord(coordinates)
    }
  }

  features.forEach((f) => scanGeometry(f.geometry))

  if (hasValid && isFinite(minLng) && isFinite(minLat) && isFinite(maxLng) && isFinite(maxLat)) {
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ]
  }

  return null
}

function MapaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()
  const { haptic } = useTelegram()

  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedLotId, setSelectedLotId] = useState<string | null>(searchParams.get('lot_id'))
  const [stats, setStats] = useState<{ total: number; disponibles: number; reservados: number; vendidos: number }>({
    total: 0,
    disponibles: 0,
    reservados: 0,
    vendidos: 0,
  })
  const [loading, setLoading] = useState(true)
  const [mapLoading, setMapLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreGL.Map | null>(null)
  const [mapInstance, setMapInstance] = useState<MapLibreGL.Map | null>(null)
  const mapLoadedRef = useRef(false)

  // 1. Cargar proyectos de la organización
  useEffect(() => {
    if (sessionLoading) return
    if (sessionError) {
      Promise.resolve().then(() => {
        setError(sessionError)
        setLoading(false)
      })
      return
    }
    if (!session) {
      Promise.resolve().then(() => {
        setError('No se pudo verificar tu sesión.')
        setLoading(false)
      })
      return
    }

    const fetchProyectos = async () => {
      try {
        setError(null)
        setLoading(true)
        const token = session.token
        const res = await fetch('/api/miniapp/proyectos', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error('Fallo al obtener los proyectos disponibles.')
        }

        const data = await res.json()
        setProyectos(data)

        const paramProj = searchParams.get('project_id')
        if (paramProj && data.some((p: Proyecto) => p.id === paramProj)) {
          setSelectedProjectId(paramProj)
        } else if (data.length > 0) {
          setSelectedProjectId(data[0].id)
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error cargando proyectos.'
        setError(errorMsg)
      } finally {
        setLoading(false)
      }
    }

    fetchProyectos()
  }, [session, sessionLoading, sessionError, searchParams])

  // 2. Inicializar MapLibre GL una sola vez
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new MapLibreGL.Map({
      container: mapContainerRef.current,
      style: createResilientMapStyle('dark'),
      center: [-71.0, -34.88], // Chile central por defecto
      zoom: 14,
      attributionControl: false,
    })

    mapRef.current = map
    setMapInstance(map)

    map.on('load', () => {
      mapLoadedRef.current = true
      map.resize()
    })

    // ResizeObserver para asegurar que el canvas mida el tamaño correcto en móviles y Telegram
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize()
      }
    })
    resizeObserver.observe(mapContainerRef.current)

    return () => {
      resizeObserver.disconnect()
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        setMapInstance(null)
        mapLoadedRef.current = false
      }
    }
  }, [])

  // 3. Cargar y renderizar geometrías cuando cambia el proyecto o el mapa está listo
  useEffect(() => {
    if (!selectedProjectId || !session || !mapInstance) return

    let isMounted = true
    setMapLoading(true)

    const loadProjectData = async () => {
      try {
        const token = session.token
        const res = await fetch(`/api/miniapp/proyectos/${selectedProjectId}/mapa`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error('Error al obtener geometrías del proyecto.')
        }

        const geojson: GeoJSONData = await res.json()
        if (!isMounted) return

        // Calcular estadísticas
        let disp = 0
        let resv = 0
        let vend = 0
        const total = geojson.features?.length || 0
        geojson.features?.forEach((f) => {
          const st = f.properties?.status
          if (st === 'disponible') disp++
          else if (st === 'reservado') resv++
          else if (st === 'vendido') vend++
        })
        setStats({ total, disponibles: disp, reservados: resv, vendidos: vend })

        const map = mapInstance
        if (!map) return

        const applyLayers = () => {
          if (!map.isStyleLoaded()) {
            map.once('styledata', applyLayers)
            return
          }

          // Si la fuente ya existe, actualizar datos
          if (map.getSource('lotes')) {
            const src = map.getSource('lotes') as MapLibreGL.GeoJSONSource
            src.setData(geojson as GeoJSON.GeoJSON)
          } else {
            // Añadir fuente GeoJSON con promoteId para identificación fiable de lotes
            map.addSource('lotes', {
              type: 'geojson',
              data: geojson as GeoJSON.GeoJSON,
              promoteId: 'id',
            })

            // Capa 1: Relleno de Lotes
            map.addLayer({
              id: 'lotes-fill',
              type: 'fill',
              source: 'lotes',
              paint: {
                'fill-color': [
                  'match',
                  ['get', 'status'],
                  'disponible',
                  'rgba(16, 185, 129, 0.45)',
                  'reservado',
                  'rgba(245, 158, 11, 0.45)',
                  'vendido',
                  'rgba(113, 113, 122, 0.35)',
                  'rgba(255, 255, 255, 0.1)',
                ],
                'fill-opacity': 0.85,
              },
            })

            // Capa 2: Bordes de Parcelas
            map.addLayer({
              id: 'lotes-borders',
              type: 'line',
              source: 'lotes',
              paint: {
                'line-color': [
                  'match',
                  ['get', 'status'],
                  'disponible',
                  '#10b981',
                  'reservado',
                  '#f59e0b',
                  'vendido',
                  '#71717a',
                  '#ffffff',
                ],
                'line-width': 2,
              },
            })

            // Capa 3: Etiquetas con Número de Lote
            map.addLayer({
              id: 'lotes-labels',
              type: 'symbol',
              source: 'lotes',
              layout: {
                'text-field': ['get', 'numero_lote'],
                'text-size': 11,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              },
              paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#121212',
                'text-halo-width': 2,
              },
            })

            // Interacciones de click
            map.on('click', 'lotes-fill', (e) => {
              if (e.features && e.features.length > 0) {
                const feat = e.features[0]
                const lotId = feat.id || feat.properties?.lot_id || feat.properties?.id
                if (lotId) {
                  haptic.impact('light')
                  setSelectedLotId(String(lotId))
                }
              }
            })

            map.on('mouseenter', 'lotes-fill', () => {
              map.getCanvas().style.cursor = 'pointer'
            })

            map.on('mouseleave', 'lotes-fill', () => {
              map.getCanvas().style.cursor = ''
            })
          }

          // Ajustar cámara a los límites de las parcelas
          const bounds = computeBounds(geojson.features || [])
          if (bounds) {
            map.fitBounds(bounds, {
              padding: { top: 80, bottom: 100, left: 30, right: 30 },
              maxZoom: 17,
              duration: 600,
            })
          }
          map.resize()
        }

        if (map.isStyleLoaded()) {
          applyLayers()
        } else {
          map.once('styledata', applyLayers)
        }
      } catch (err) {
        console.error('Error cargando geometrías del proyecto:', err)
      } finally {
        if (isMounted) setMapLoading(false)
      }
    }

    loadProjectData()

    return () => {
      isMounted = false
    }
  }, [selectedProjectId, session, mapInstance, haptic])

  return (
    <div className="fixed inset-0 bottom-16 w-full bg-[#121212] text-white overflow-hidden">
      {/* Overlay de Carga Inicial */}
      {(sessionLoading || loading) && (
        <div className="absolute inset-0 z-50 bg-[#121212] flex flex-col items-center justify-center text-white">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-2xl">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
          </div>
          <p className="mt-4 text-xs font-medium text-zinc-400">Cargando visor satelital...</p>
        </div>
      )}

      {/* Overlay de Error */}
      {error && !loading && (
        <div className="absolute inset-0 z-50 bg-[#121212] flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="rounded-2xl bg-rose-950/40 border border-rose-800/30 p-4 text-rose-400 mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-8 w-8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h2 className="text-base font-bold">Error al cargar mapa</h2>
          <p className="mt-2 text-xs text-zinc-400 max-w-xs">{error}</p>
          <button
            onClick={() => router.refresh()}
            className="mt-6 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] px-5 py-2.5 text-xs font-semibold text-white active:scale-95 transition-all"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Barra Flotante Superior: Selector de Proyecto y Resumen */}
      <div className="absolute top-3 left-3 right-3 z-10 space-y-2">
        <div className="flex items-center gap-2">
          {proyectos.length > 0 && (
            <div className="flex-1 relative">
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  haptic.selection()
                  setSelectedProjectId(e.target.value)
                  setSelectedLotId(null)
                }}
                className="w-full rounded-2xl bg-[#181818]/95 backdrop-blur-xl border border-white/[0.12] px-4 py-2.5 text-xs font-bold text-white shadow-2xl outline-none appearance-none pr-9 cursor-pointer active:scale-[0.99] transition-all"
              >
                {proyectos.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#181818] text-white py-1">
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Badges de Disponibilidad en Tiempo Real */}
        {stats.total > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#181818]/90 backdrop-blur-md border border-white/[0.08] px-3 py-1 text-[11px] font-semibold text-zinc-300 shadow-md whitespace-nowrap">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
              {stats.disponibles} Disponibles
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#181818]/90 backdrop-blur-md border border-white/[0.08] px-3 py-1 text-[11px] font-semibold text-zinc-300 shadow-md whitespace-nowrap">
              <span className="h-2 w-2 rounded-full bg-amber-400"></span>
              {stats.reservados} Reservados
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#181818]/90 backdrop-blur-md border border-white/[0.08] px-3 py-1 text-[11px] font-semibold text-zinc-300 shadow-md whitespace-nowrap">
              <span className="h-2 w-2 rounded-full bg-zinc-500"></span>
              {stats.vendidos} Vendidos
            </span>
          </div>
        )}
      </div>

      {/* Indicador de carga de mapa */}
      {mapLoading && (
        <div className="absolute top-20 right-4 z-10 flex items-center gap-2 rounded-xl bg-[#181818]/90 backdrop-blur-md border border-white/[0.1] px-3 py-1.5 text-xs text-zinc-300 shadow-lg">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"></div>
          <span>Actualizando loteo...</span>
        </div>
      )}

      {/* Contenedor del Mapa MapLibre GL */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Ficha Deslizable de Lote */}
      {selectedLotId && session && (
        <LotSheet
          lotId={selectedLotId}
          token={session.token}
          onClose={() => setSelectedLotId(null)}
          onStartReservation={(id) => {
            router.push(`/mini/reserva?lot_id=${id}`)
          }}
        />
      )}
    </div>
  )
}

export default function MapaPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bottom-16 bg-[#121212] flex flex-col items-center justify-center text-white">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
        </div>
      }
    >
      <MapaContent />
    </Suspense>
  )
}
