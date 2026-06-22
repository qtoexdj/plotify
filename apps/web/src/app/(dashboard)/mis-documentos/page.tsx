'use client'

import { useCallback, useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { File02Icon } from '@hugeicons/core-free-icons'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  EscrituraDeliveryListResponse,
  EscrituraDeliveryView,
} from '@/lib/documents/matriz-types'
import {
  MIS_DOCUMENTOS_TEXT as T,
  etiquetaEntrega,
  puedeDescargar,
  puedeRenovar,
} from '@/lib/documents/mis-documentos'

/**
 * SDD 011 T017 — "Mis documentos del vendedor" (FR-011).
 *
 * Lista solo los borradores de las ventas del vendedor (aislamiento en la API,
 * SC-005), con descarga, compartir y renovación del enlace vencido.
 */
export default function MisDocumentosPage() {
  const [entregas, setEntregas] = useState<EscrituraDeliveryView[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renovando, setRenovando] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function cargar() {
      try {
        const res = await fetch('/api/escritura-deliveries/mine', { cache: 'no-store' })
        if (!res.ok) throw new Error('error')
        const data = (await res.json()) as EscrituraDeliveryListResponse
        if (!active) return
        setEntregas(data.deliveries ?? [])
        setError(null)
      } catch {
        if (active) setError(T.errorCarga)
      } finally {
        if (active) setCargando(false)
      }
    }
    void cargar()
    return () => {
      active = false
    }
  }, [])

  const renovar = useCallback(async (id: string) => {
    setRenovando(id)
    try {
      const res = await fetch(`/api/escritura-deliveries/${encodeURIComponent(id)}/renew`, {
        method: 'POST',
      })
      if (res.ok) {
        const fresca = (await res.json()) as EscrituraDeliveryView
        setEntregas((prev) => prev.map((e) => (e.id === id ? fresca : e)))
      }
    } finally {
      setRenovando(null)
    }
  }, [])

  const compartir = useCallback(async (url: string) => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ url })
        return
      } catch {
        // El usuario canceló o el canal falló: caemos a copiar el enlace.
      }
    }
    await navigator.clipboard?.writeText(url)
  }, [])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{T.title}</h1>
        <p className="text-muted-foreground text-sm">{T.subtitle}</p>
      </header>

      {cargando && <p className="text-muted-foreground text-sm">Cargando…</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}

      {!cargando && !error && entregas.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            {T.empty}
          </CardContent>
        </Card>
      )}

      <ul className="space-y-3">
        {entregas.map((entrega) => (
          <li key={entrega.id}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <HugeiconsIcon icon={File02Icon} className="size-4" />
                  Borrador de escritura
                </CardTitle>
                <Badge variant="secondary">{etiquetaEntrega(entrega)}</Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                {puedeDescargar(entrega) ? (
                  <>
                    <Button asChild size="sm">
                      <a href={entrega.download_url ?? '#'} download>
                        {T.descargar}
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void compartir(entrega.download_url ?? '')}
                    >
                      {T.compartir}
                    </Button>
                  </>
                ) : puedeRenovar(entrega) ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-muted-foreground text-sm">{T.enlaceVencido}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={renovando === entrega.id}
                      onClick={() => void renovar(entrega.id)}
                    >
                      {renovando === entrega.id ? T.renovando : T.renovar}
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">{T.sinDescarga}</span>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
