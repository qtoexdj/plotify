'use client'

import { useEffect, useState, useCallback } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon as Check,
  Cancel01Icon as X,
  ClipboardIcon as ClipboardList,
  UserIcon as User,
  Location01Icon as MapPin,
  Dollar01Icon as DollarSign,
  Calendar01Icon as Calendar,
  BankIcon as Landmark,
} from '@hugeicons/core-free-icons'
import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { resolveApprovalRequestAction } from '@/actions/request-approval.action'

interface ApprovalRequest {
  id: string
  lot_id: string
  organization_id: string
  vendor_id: string
  vendor_name: string
  vendor_phone: string | null
  vendor_platform: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  request_type?: 'reservation' | 'sale'
  sale_mode?: 'direct' | 'reserved' | null
  previous_lot_state?: 'disponible' | 'reservado' | null
  payload: {
    cliente_nombre: string
    cliente_run: string
    valor_reserva?: number
    valor_final?: number
    notaria?: string
    fecha_firma?: string
  }
  lots?: {
    numero_lote: string
    projects?: {
      name: string
    }
  }
}

interface PendingApprovalsPanelProps {
  organizationId: string
}

export function PendingApprovalsPanel({ organizationId }: PendingApprovalsPanelProps) {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null) // ID de la solicitud procesándose

  const [supabase] = useState(() => createClient())

  // Cargar aprobaciones iniciales
  const fetchApprovals = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('approval_requests')
        .select(
          `
          *,
          lots:lot_id (
            numero_lote,
            projects:project_id (
              name
            )
          )
        `
        )
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error
      setApprovals((data as ApprovalRequest[]) || [])
    } catch (err) {
      console.error('Error al cargar aprobaciones:', err)
      toast.error('No se pudieron cargar las aprobaciones pendientes.')
    } finally {
      setLoading(false)
    }
  }, [organizationId, supabase])

  useEffect(() => {
    let active = true

    const loadData = async () => {
      if (active) {
        await fetchApprovals()
      }
    }
    loadData()

    // Suscripción Realtime para actualizaciones instantáneas
    const channel = supabase
      .channel('approval-requests-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'approval_requests',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (active) {
            fetchApprovals()
          }
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [organizationId, fetchApprovals, supabase])

  const handleDecision = async (approvalId: string, action: 'approve' | 'reject') => {
    setActionLoading(approvalId)
    try {
      const result = await resolveApprovalRequestAction(approvalId, action)

      if (!result.success) {
        if (result.error === 'already_processed') {
          toast.error('Esta solicitud ya fue procesada por otro canal (ej. Telegram).')
        } else {
          throw new Error(result.error)
        }
      } else {
        toast.success(
          action === 'approve'
            ? 'Solicitud aprobada exitosamente.'
            : 'Solicitud rechazada exitosamente.'
        )
      }
      // Refrescar localmente
      setApprovals((prev) => prev.filter((a) => a.id !== approvalId))
    } catch (err) {
      const error = err as Error
      toast.error(error.message || 'Error al procesar la decisión.')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <Card className="border-muted bg-muted/40">
        <CardContent className="h-[250px] flex items-center justify-center">
          <Spinner className="h-8 w-8" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-muted bg-muted/40 overflow-hidden relative shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <HugeiconsIcon icon={ClipboardList} className="h-5 w-5 text-primary" />
          Aprobaciones Pendientes
          {approvals.length > 0 && (
            <Badge variant="destructive" className="ml-auto animate-pulse">
              {approvals.length} pendientes
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Revisa y decide sobre las intenciones de reserva y venta cargadas por tus vendedores en
          tiempo real.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {approvals.length === 0 ? (
          <EmptyState
            icon={CheckmarkCircle02Icon}
            title="Todo al día"
            description="No hay solicitudes de aprobación pendientes para tu organización en este momento."
          />
        ) : (
          <div className="grid gap-4 max-h-[500px] overflow-y-auto pr-1">
            {approvals.map((approval) => {
              const amount =
                approval.request_type === 'sale'
                  ? approval.payload.valor_final
                  : approval.payload.valor_reserva

              const valorStr = new Intl.NumberFormat('es-CL', {
                style: 'currency',
                currency: 'CLP',
                maximumFractionDigits: 0,
              }).format(amount || 0)

              const fechaFirma = approval.payload.fecha_firma
                ? new Date(approval.payload.fecha_firma).toLocaleDateString('es-CL', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'No definida'

              const isSale = approval.request_type === 'sale'

              return (
                <div
                  key={approval.id}
                  className="p-4 rounded-xl border border-muted bg-background/50 hover:bg-background/90 transition-all duration-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className="bg-primary/5 text-primary border-primary/20 font-medium"
                      >
                        Lote {approval.lots?.numero_lote || '?'}
                      </Badge>
                      {isSale ? (
                        <Badge
                          variant="outline"
                          className={
                            approval.sale_mode === 'direct'
                              ? 'bg-info/10 text-info border-info/20'
                              : 'bg-common-area/10 text-common-area border-common-area/20'
                          }
                        >
                          {approval.sale_mode === 'direct' ? 'Venta Directa' : 'Venta s/ Reserva'}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-success/10 text-success border-success/20"
                        >
                          Reserva
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground font-medium">
                        {approval.lots?.projects?.name || 'Proyecto Desconocido'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={User}
                          className="h-3.5 w-3.5 text-muted-foreground/60"
                        />
                        <span className="font-semibold text-foreground">Cliente:</span>{' '}
                        {approval.payload.cliente_nombre} ({approval.payload.cliente_run})
                      </div>
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={DollarSign}
                          className="h-3.5 w-3.5 text-muted-foreground/60"
                        />
                        <span className="font-semibold text-foreground">
                          {isSale ? 'Valor Final:' : 'Monto Reserva:'}
                        </span>{' '}
                        {valorStr}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={MapPin}
                          className="h-3.5 w-3.5 text-muted-foreground/60"
                        />
                        <span className="font-semibold text-foreground">Vendedor:</span>{' '}
                        {approval.vendor_name}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={Calendar}
                          className="h-3.5 w-3.5 text-muted-foreground/60"
                        />
                        <span className="font-semibold text-foreground">Firma:</span> {fechaFirma}
                      </div>
                      {approval.payload.notaria && (
                        <div className="flex items-center gap-1.5 sm:col-span-2">
                          <HugeiconsIcon
                            icon={Landmark}
                            className="h-3.5 w-3.5 text-muted-foreground/60"
                          />
                          <span className="font-semibold text-foreground">Notaría:</span>{' '}
                          {approval.payload.notaria}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex w-full md:w-auto gap-2 justify-stretch sm:justify-end border-t md:border-t-0 pt-3 md:pt-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDecision(approval.id, 'reject')}
                      disabled={actionLoading !== null}
                      className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive font-medium h-9 px-3.5 flex items-center gap-1.5 flex-1 md:flex-initial justify-center"
                    >
                      {actionLoading === approval.id ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <HugeiconsIcon icon={X} className="h-4 w-4" />
                      )}
                      Rechazar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDecision(approval.id, 'approve')}
                      disabled={actionLoading !== null}
                      className="bg-success text-success-foreground hover:bg-success/90 font-medium h-9 px-3.5 flex items-center gap-1.5 flex-1 md:flex-initial justify-center"
                    >
                      {actionLoading === approval.id ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <HugeiconsIcon icon={Check} className="h-4 w-4" />
                      )}
                      Aprobar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
