import { useMemo, useState } from 'react'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { PencilEdit02Icon, RulerIcon, File02Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { getBoundariesWithNeighbors, type BoundaryWithNeighbor } from '@/lib/geometry/utils'
import { calculateLegalMetrics } from '@/lib/geometry/utm'
import type { GeoJSONGeometry } from '@/types/database.types'

import type { ViewerFeature } from '@/types/viewer.types'
import { LotVerificationPanel } from '../LotVerificationPanel'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { Badge } from '@/components/ui/badge'
import { ESTADO_CONFIG, getEstadoBadgeClasses } from '@/lib/models/lot.model'
import { StageStepper } from '../StageStepper'
import type { ProcessStage } from '@/types/database.types'
import { updateLotStage } from '@/actions/lot-process.action'
import { toast } from 'sonner'
import type { LotDetails } from '@/types/viewer.types'
import { cn } from '@/lib/utils'

import { useRouter } from 'next/navigation'

interface LotInfoViewProps {
  projectId: string
  lotDetails: LotDetails
  geometry?: GeoJSONGeometry | null
  allFeatures?: ViewerFeature[]
  onEditClick: () => void
  onOpenReservation: (mode: 'reservation' | 'direct_sale') => void
  onLotUpdated?: () => void
}

export function LotInfoView({
  projectId,
  lotDetails,
  geometry,
  allFeatures = [],
  onEditClick,
  onOpenReservation,
  onLotUpdated,
}: LotInfoViewProps) {
  const [activeTab, setActiveTab] = useState('general')
  const router = useRouter()

  // Calculate Boundaries WITH neighbors
  const boundariesWithNeighbors = useMemo<BoundaryWithNeighbor[]>(() => {
    if (!geometry || allFeatures.length === 0) return []
    try {
      let coords: number[][] = []
      if (geometry.type === 'Polygon') {
        coords = geometry.coordinates[0]
      } else if (geometry.type === 'MultiPolygon') {
        coords = geometry.coordinates[0][0]
      } else if (geometry.type === 'LineString') {
        coords = geometry.coordinates
      } else if (geometry.type === 'MultiLineString') {
        coords = geometry.coordinates[0]
      }
      return getBoundariesWithNeighbors(coords, allFeatures, lotDetails.id)
    } catch {
      return []
    }
  }, [geometry, allFeatures, lotDetails.id])

  // Calculate Legal Metrics (UTM vs Geodesic)
  const legalMetrics = useMemo(() => {
    if (!geometry) return null
    try {
      let coords: number[][] = []
      if (geometry.type === 'Polygon') {
        coords = geometry.coordinates[0]
      } else if (geometry.type === 'MultiPolygon') {
        coords = geometry.coordinates[0][0]
      } else if (geometry.type === 'LineString') {
        coords = geometry.coordinates
      } else if (geometry.type === 'MultiLineString') {
        coords = geometry.coordinates[0]
      }

      if (coords.length < 3) return null
      return calculateLegalMetrics(coords)
    } catch (e) {
      console.error('Error calculating legal metrics:', e)
      return null
    }
  }, [geometry])

  const handleStageChange = async (newStage: ProcessStage) => {
    const promise = updateLotStage(projectId, lotDetails.id, newStage)

    toast.promise(promise, {
      loading: 'Actualizando etapa...',
      success: (data) => {
        if (!data.success) throw new Error(data.error)
        router.refresh()
        return 'Etapa actualizada correctamente'
      },
      error: (err) => err.message || 'Error al actualizar etapa',
    })
  }

  // Determine if process tab should be visible
  const showProcessTab = lotDetails.estado === 'reservado' && lotDetails.etapa_proceso

  return (
    <div className="space-y-3">
      {/* Lot Number Hero — Always visible above tabs */}
      <div className="relative overflow-hidden rounded-xl bg-linear-to-br from-primary/10 via-primary/5 to-transparent p-5 text-center border border-primary/10 shadow-xs">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70">Lote</p>
        <p className="text-3xl font-bold text-primary mt-0.5 tracking-tight">
          {lotDetails.numero_lote}
        </p>

        <div className="mt-3 flex justify-center">
          <Badge
            variant="outline"
            className={cn(
              'capitalize font-medium border shadow-xs',
              getEstadoBadgeClasses(lotDetails.estado)
            )}
          >
            {ESTADO_CONFIG[lotDetails.estado as keyof typeof ESTADO_CONFIG]?.label ||
              lotDetails.estado}
          </Badge>
        </div>
      </div>

      {/* Edit button — Always visible, right below hero */}
      <Button
        variant="outline"
        size="sm"
        className="w-full h-8 text-xs text-muted-foreground hover:text-foreground"
        onClick={onEditClick}
      >
        <HugeiconsIcon icon={PencilEdit02Icon} className="w-3 h-3 mr-1.5" />
        Editar información
      </Button>

      {/* ═══ TABS ═══ */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full h-auto p-1 bg-muted/50 rounded-lg">
          <TabsTrigger
            value="general"
            className="flex-1 text-xs gap-1.5 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs dark:data-[state=active]:bg-input/30 rounded-md"
          >
            <HugeiconsIcon icon={File02Icon} className="w-3.5 h-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger
            value="legal"
            className="flex-1 text-xs gap-1.5 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs dark:data-[state=active]:bg-input/30 rounded-md"
          >
            <HugeiconsIcon icon={RulerIcon} className="w-3.5 h-3.5" />
            Legal
          </TabsTrigger>
          {showProcessTab && (
            <TabsTrigger
              value="proceso"
              className="flex-1 text-xs gap-1.5 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-xs dark:data-[state=active]:bg-input/30 rounded-md"
            >
              <HugeiconsIcon icon={Settings02Icon} className="w-3.5 h-3.5" />
              Proceso
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Tab: General ─── */}
        <TabsContent value="general" className="space-y-3 mt-3">
          {/* Meta Grid: Superficie + Precio */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="shadow-xs border-sidebar-border/50">
              <CardHeader className="p-3 pb-1 space-y-0">
                <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Superficie
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1">
                <div className="text-lg font-bold text-foreground truncate">
                  {lotDetails.area_official_m2 ? (
                    `${new Intl.NumberFormat('es-CL').format(lotDetails.area_official_m2)} m²`
                  ) : legalMetrics ? (
                    `${new Intl.NumberFormat('es-CL').format(Math.round(legalMetrics.area_legal_m2))} m²`
                  ) : (
                    <span className="text-muted-foreground font-normal text-sm">--</span>
                  )}
                </div>
                {lotDetails.area_official_m2 ? (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate mb-1">
                    Oficial verificado
                  </p>
                ) : legalMetrics ? (
                  <p className="text-[10px] text-muted-foreground truncate mb-1">
                    Calculado (UTM Zona {legalMetrics.utm_zone})
                  </p>
                ) : null}

                {/* Servidumbre y Neta */}
                {lotDetails.servidumbre_m2 ? (
                  <div className="mt-1.5 pt-1.5 border-t border-sidebar-border/50 text-[10px] space-y-0.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Servidumbre:</span>
                      <span>
                        -{new Intl.NumberFormat('es-CL').format(lotDetails.servidumbre_m2)} m²
                      </span>
                    </div>
                    <div className="flex justify-between font-medium text-foreground/80">
                      <span>Sup. Neta útil:</span>
                      <span>
                        {new Intl.NumberFormat('es-CL').format(lotDetails.superficie_neta_m2 ?? 0)}{' '}
                        m²
                      </span>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="shadow-xs border-sidebar-border/50">
              <CardHeader className="p-3 pb-1 space-y-0">
                <CardTitle className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Precio
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1">
                <div className="text-lg font-bold text-foreground truncate">
                  {lotDetails.precio ? (
                    new Intl.NumberFormat('es-CL', {
                      style: 'currency',
                      currency: 'CLP',
                      maximumFractionDigits: 0,
                    }).format(lotDetails.precio)
                  ) : (
                    <span className="text-sm font-normal text-muted-foreground">Consulte</span>
                  )}
                </div>
                {lotDetails.valor_reserva ? (
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-medium uppercase tracking-tight text-primary/60">
                      Reserva:
                    </span>
                    <span className="font-medium text-foreground/80">
                      {new Intl.NumberFormat('es-CL', {
                        style: 'currency',
                        currency: 'CLP',
                        maximumFractionDigits: 0,
                      }).format(lotDetails.valor_reserva)}
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* ACTION BUTTONS */}
          {lotDetails.estado && ['reservado', 'vendido'].includes(lotDetails.estado) && (
            <Button variant="outline" className="w-full mt-1" asChild>
              <Link href={`/documentos/generar/${lotDetails.id}`}>
                <HugeiconsIcon icon={File02Icon} className="h-4 w-4 mr-2" />
                Generar Documento Legal
              </Link>
            </Button>
          )}

          {lotDetails.estado === 'disponible' && (
            <div className="flex flex-col gap-2 pt-1">
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-10"
                onClick={() => onOpenReservation('reservation')}
              >
                Solicitar Reserva
              </Button>
              <Button
                variant="outline"
                className="w-full border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950 dark:hover:text-blue-300 h-10"
                onClick={() => onOpenReservation('direct_sale')}
              >
                Venta Directa
              </Button>
            </div>
          )}

          {/* Observations */}
          {lotDetails.observaciones && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 ml-1">
                Observaciones
              </p>
              <div className="text-sm text-foreground/80 p-3 rounded-lg bg-muted/30 border border-border leading-relaxed">
                {lotDetails.observaciones}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab: Legal ─── */}
        <TabsContent value="legal" className="space-y-3 mt-3">
          {/* Verification Legal Panel (first) */}
          {geometry && (
            <LotVerificationPanel
              projectId={projectId}
              lotDetails={lotDetails}
              legalMetrics={legalMetrics}
              calculatedBoundaries={boundariesWithNeighbors}
              onLotUpdated={onLotUpdated}
            />
          )}

          {/* Empty state for legal tab */}
          {!geometry && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <HugeiconsIcon icon={RulerIcon} className="w-8 h-8 opacity-20 mb-2" />
              <p className="text-sm">No hay datos legales disponibles</p>
              <p className="text-xs opacity-60 mt-1">Asigna una geometría para ver métricas</p>
            </div>
          )}
        </TabsContent>

        {/* ─── Tab: Proceso ─── */}
        {showProcessTab && (
          <TabsContent value="proceso" className="space-y-3 mt-3">
            <Card className="border-primary/20 bg-primary/5 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-[10px] uppercase tracking-widest text-primary/70">
                  Progreso Venta
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-4">
                <StageStepper currentStage={lotDetails.etapa_proceso!} />

                {/* Controls to Advance Stage */}
                <div className="flex flex-col gap-2">
                  {lotDetails.etapa_proceso === 'espera_firma_reserva' && (
                    <Button
                      onClick={() => handleStageChange('reserva_firmada')}
                      size="sm"
                      variant="secondary"
                      className="w-full"
                    >
                      Confirmar Reserva Firmada
                    </Button>
                  )}
                  {lotDetails.etapa_proceso === 'reserva_firmada' && (
                    <Button
                      onClick={() => handleStageChange('espera_firma_escritura')}
                      size="sm"
                      variant="secondary"
                      className="w-full"
                    >
                      Lista para Escritura
                    </Button>
                  )}
                  {lotDetails.etapa_proceso === 'espera_firma_escritura' && (
                    <Button
                      onClick={() => handleStageChange('escritura_firmada')}
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Confirmar Escritura Firmada (Cerrar Venta)
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
