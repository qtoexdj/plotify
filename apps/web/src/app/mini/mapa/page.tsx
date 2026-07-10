'use client'

import React, { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MapLibreGL from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useMiniApp } from '@/lib/miniapp/mini-app-shell'
import { LotSheet } from './lot-sheet'

interface Proyecto {
  id: string
  name: string
}

function MapaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session, loading: sessionLoading, error: sessionError } = useMiniApp()

  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedLotId, setSelectedLotId] = useState<string | null>(searchParams.get('lot_id'))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreGL.Map | null>(null)

  // 1. Cargar proyectos disponibles de la organización
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
        const res = await fetch('/api/projects', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error('Fallo al obtener proyectos.')
        }

        const data = await res.json()
        setProyectos(data)

        // Definir proyecto inicial desde search params o primer elemento
        const paramProj = searchParams.get('project_id')
        if (paramProj) {
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

  // 2. Inicializar MapLibre GL
  useEffect(() => {
    if (!selectedProjectId || !session || !mapContainerRef.current) return

    // Limpiar mapa previo si existe
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = new MapLibreGL.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [-71.3, -41.3], // Coordenadas chilenas por defecto (zona sur)
      zoom: 12,
      attributionControl: false,
    })

    mapRef.current = map

    map.on('load', async () => {
      try {
        // Cargar GeoJSON de lotes del proyecto
        const token = session.token
        const res = await fetch(`/api/miniapp/proyectos/${selectedProjectId}/mapa`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error('Error al obtener geometrías del proyecto.')
        }

        const geojson = await res.json()

        // Añadir fuente GeoJSON al mapa
        map.addSource('lotes', {
          type: 'geojson',
          data: geojson,
        })

        // Capa de relleno (Relleno semitransparente según estado)
        map.addLayer({
          id: 'lotes-fill',
          type: 'fill',
          source: 'lotes',
          paint: {
            'fill-color': [
              'match',
              ['get', 'status'],
              'disponible',
              'rgba(16, 185, 129, 0.35)',
              'reservado',
              'rgba(245, 158, 11, 0.35)',
              'vendido',
              'rgba(107, 114, 128, 0.35)',
              'rgba(255, 255, 255, 0.1)',
            ],
            'fill-outline-color': 'transparent',
          },
        })

        // Capa de bordes (Para resaltar divisiones de parcelas)
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
              '#6b7280',
              '#ffffff',
            ],
            'line-width': 1.5,
          },
        })

        // Centrar y ajustar la cámara sobre la envolvente (bbox) de las geometrías de forma automatizada
        if (geojson.features && geojson.features.length > 0) {
          const coordinates: [number, number][] = []
          geojson.features.forEach(
            (feature: {
              geometry: {
                type: string
                coordinates: [number, number][][] | [number, number][][][]
              }
            }) => {
              if (feature.geometry && feature.geometry.coordinates) {
                const geomType = feature.geometry.type
                if (geomType === 'Polygon') {
                  const coords = feature.geometry.coordinates as [number, number][][]
                  coords[0].forEach((coord: [number, number]) => {
                    coordinates.push(coord)
                  })
                } else if (geomType === 'MultiPolygon') {
                  const multiCoords = feature.geometry.coordinates as [number, number][][][]
                  multiCoords.forEach((polygon: [number, number][][]) => {
                    polygon[0].forEach((coord: [number, number]) => {
                      coordinates.push(coord)
                    })
                  })
                }
              }
            }
          )

          if (coordinates.length > 0) {
            const bounds = coordinates.reduce(
              (acc, coord) => {
                return [
                  [Math.min(acc[0][0], coord[0]), Math.min(acc[0][1], coord[1])],
                  [Math.max(acc[1][0], coord[0]), Math.max(acc[1][1], coord[1])],
                ]
              },
              [
                [coordinates[0][0], coordinates[0][1]],
                [coordinates[0][0], coordinates[0][1]],
              ]
            )

            map.fitBounds(bounds as [[number, number], [number, number]], {
              padding: 40,
              maxZoom: 16,
              duration: 1000,
            })
          }
        }
        // 3. Registrar eventos interactivos sobre las parcelas
        map.on('click', 'lotes-fill', (e) => {
          if (e.features && e.features.length > 0) {
            const feat = e.features[0]
            if (feat.id) {
              setSelectedLotId(String(feat.id))
            }
          }
        })

        map.on('mouseenter', 'lotes-fill', () => {
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', 'lotes-fill', () => {
          map.getCanvas().style.cursor = ''
        })
      } catch (err) {
        console.error('Error inicializando capas de mapa:', err)
      }
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [selectedProjectId, session])

  if (sessionLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
        <p className="mt-4 text-sm text-gray-400">Iniciando visor satelital...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] p-6 text-center text-white">
        <div className="rounded-full bg-red-950/50 p-4 text-red-500 mb-4">
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
        <h2 className="text-lg font-semibold">Error</h2>
        <p className="mt-2 text-sm text-gray-400 max-w-xs">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-full bg-[#0e1621] text-white overflow-hidden">
      {/* Flotador de Selección de Proyecto */}
      <div className="absolute top-4 left-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => router.push('/mini/ventas')}
          className="rounded-xl bg-[#17212b] border border-[#242f3d] p-3 text-white hover:bg-[#1a2734] transition-all shadow-lg active:scale-95"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
        </button>

        {proyectos.length > 1 && (
          <div className="flex-1 relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full rounded-xl bg-[#17212b] border border-[#242f3d] px-4 py-3 text-sm font-bold text-white shadow-lg outline-none appearance-none pr-10 cursor-pointer"
            >
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Contenedor del Mapa */}
      <div ref={mapContainerRef} className="h-full w-full" />

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
        <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Iniciando visor satelital...</p>
        </div>
      }
    >
      <MapaContent />
    </Suspense>
  )
}
