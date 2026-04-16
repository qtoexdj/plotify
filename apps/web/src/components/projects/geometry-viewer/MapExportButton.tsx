'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Download02Icon, Loading02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { ESTADO_CONFIG } from '@/lib/models/lot.model'
import { calculateBounds, transformCoordinates, getCentroid } from '@/lib/geometry/utils'
import type { ViewerFeatureCollection } from '@/types/viewer.types'

interface MapExportButtonProps {
  projectName?: string
  featureCollection: ViewerFeatureCollection
}

const ROAD_STROKE = '#f59e0b'
const COMMON_AREA_FILL = '#a78bfa'
const COMMON_AREA_STROKE = '#7c3aed'

// ─── Renderizar el plano en un canvas 2D offscreen ───────────────────────────
function renderPlanToCanvas(
  fc: ViewerFeatureCollection,
  width = 1800,
  height = 1200
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  // Fondo blanco
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, width, height)

  // Grilla sutil de fondo (simula mapa base)
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 0.5
  const gridSize = 60
  for (let x = 0; x <= width; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  }

  const features = fc.features
  if (features.length === 0) return canvas

  const bounds = calculateBounds(features)
  const padding = 80

  const drawPolygonRings = (rings: number[][][]) => {
    const outerPoints = transformCoordinates(rings[0], bounds, width, height, padding)
    ctx.beginPath()
    for (let i = 0; i < outerPoints.length; i += 2) {
      if (i === 0) ctx.moveTo(outerPoints[i], outerPoints[i + 1])
      else ctx.lineTo(outerPoints[i], outerPoints[i + 1])
    }
    ctx.closePath()
    // Holes
    for (let r = 1; r < rings.length; r++) {
      const holePoints = transformCoordinates(rings[r], bounds, width, height, padding)
      for (let i = 0; i < holePoints.length; i += 2) {
        if (i === 0) ctx.moveTo(holePoints[i], holePoints[i + 1])
        else ctx.lineTo(holePoints[i], holePoints[i + 1])
      }
      ctx.closePath()
    }
  }

  // ── 1. Áreas comunes + carreteras (capas inferiores) ──
  for (const f of features) {
    const type = f.properties.geometry_type
    const geom = f.geometry

    if (type === 'road') {
      ctx.strokeStyle = ROAD_STROKE
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const lines =
        geom.type === 'LineString'
          ? [geom.coordinates as number[][]]
          : (geom.coordinates as number[][][])
      for (const line of lines) {
        const pts = transformCoordinates(line, bounds, width, height, padding)
        ctx.beginPath()
        for (let i = 0; i < pts.length; i += 2) {
          if (i === 0) ctx.moveTo(pts[i], pts[i + 1])
          else ctx.lineTo(pts[i], pts[i + 1])
        }
        ctx.stroke()
      }
      continue
    }

    if (type === 'common_area') {
      const rings =
        geom.type === 'Polygon'
          ? (geom.coordinates as number[][][])
          : (geom.coordinates as number[][][][])[0]
      drawPolygonRings(rings)
      ctx.fillStyle = COMMON_AREA_FILL + '55' // 33% opacity
      ctx.strokeStyle = COMMON_AREA_STROKE
      ctx.lineWidth = 1.5
      ctx.fill('evenodd')
      ctx.stroke()
      continue
    }
  }

  // ── 2. Lotes ──
  for (const f of features) {
    if (f.properties.geometry_type !== 'lot') continue
    const geom = f.geometry
    const estado = f.properties.estado || 'sin_asignar'
    const cfg = ESTADO_CONFIG[estado as keyof typeof ESTADO_CONFIG] ?? ESTADO_CONFIG.sin_asignar

    const allRings: number[][][] =
      geom.type === 'Polygon'
        ? (geom.coordinates as number[][][])
        : (geom.coordinates as number[][][][]).flat(1)

    drawPolygonRings(
      geom.type === 'Polygon'
        ? (geom.coordinates as number[][][])
        : (geom.coordinates as number[][][][])[0]
    )
    ctx.fillStyle = cfg.fill + 'dd' // ~87% opacity
    ctx.fill('evenodd')

    ctx.strokeStyle = cfg.stroke
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Número de lote
    const numero = f.properties.numero_lote ?? f.properties.name
    if (numero) {
      const outerPoints = transformCoordinates(allRings[0], bounds, width, height, padding)
      const c = getCentroid(outerPoints)
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // Sombra suave para legibilidad sobre el relleno
      ctx.shadowColor = 'rgba(255,255,255,0.8)'
      ctx.shadowBlur = 2
      ctx.fillStyle = '#1a2e0a'
      ctx.fillText(String(numero), c.x, c.y)
      ctx.shadowBlur = 0
    }
  }

  return canvas
}

export function MapExportButton({ projectName = 'Proyecto', featureCollection }: MapExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = () => {
    if (isExporting) return
    setIsExporting(true)

    const doExport = async () => {
      try {
        const mapCanvas = renderPlanToCanvas(featureCollection)
        const dataURL = mapCanvas.toDataURL('image/png')

        const { jsPDF } = await import('jspdf')

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
        const pageW = doc.internal.pageSize.getWidth()
        const pageH = doc.internal.pageSize.getHeight()
        const margin = 12
        const headerH = 20

        // ── Encabezado ──
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(20, 20, 20)
        doc.text(projectName, margin, margin + 6)

        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)
        const now = new Date().toLocaleDateString('es-CL', {
          year: 'numeric', month: 'long', day: 'numeric',
        })
        doc.text(`Generado el ${now} · Plotify`, margin, margin + 12)

        // ── Imagen del plano ──
        const imgX = margin
        const imgY = margin + headerH
        const imgW = pageW - margin * 2
        const imgH = pageH - margin * 2 - headerH - 10

        doc.addImage(dataURL, 'PNG', imgX, imgY, imgW, imgH)

        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.2)
        doc.rect(imgX, imgY, imgW, imgH)

        // ── Leyenda ──
        const legendY = imgY + imgH + 5
        const items = Object.entries(ESTADO_CONFIG).map(([, cfg]) => ({
          label: cfg.label,
          color: cfg.fill,
        }))
        let lx = margin
        doc.setFontSize(7)
        for (const item of items) {
          const r = parseInt(item.color.slice(1, 3), 16)
          const g = parseInt(item.color.slice(3, 5), 16)
          const b = parseInt(item.color.slice(5, 7), 16)
          doc.setFillColor(r, g, b)
          doc.rect(lx, legendY, 3, 3, 'F')
          doc.setTextColor(80, 80, 80)
          doc.text(item.label, lx + 4.5, legendY + 2.5)
          lx += 32
        }

        const safeName = projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()
        doc.save(`plano-lotes-${safeName}.pdf`)
        toast.success('PDF exportado correctamente')
      } catch (err) {
        console.error('Error al exportar PDF:', err)
        toast.error('No se pudo exportar el PDF')
      } finally {
        setIsExporting(false)
      }
    }

    doExport()
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-2 right-2 z-10 h-8 w-8 shadow-md bg-background/90 hover:bg-background border border-border"
          onClick={handleExport}
          disabled={isExporting}
          aria-label="Exportar plano como PDF"
        >
          {isExporting ? (
            <HugeiconsIcon icon={Loading02Icon} className="w-4 h-4 animate-spin" />
          ) : (
            <HugeiconsIcon icon={Download02Icon} className="w-4 h-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>Exportar plano como PDF</p>
      </TooltipContent>
    </Tooltip>
  )
}

