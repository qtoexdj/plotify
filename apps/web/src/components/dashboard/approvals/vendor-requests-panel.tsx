'use client'

import { useEffect, useState, useCallback } from 'react'
import { ClipboardList, Clock, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'

interface RecentRequest {
  id: string
  lot_label: string
  project_name: string
  request_type: 'reservation' | 'sale'
  status: 'pending' | 'approved' | 'rejected'
  client_name: string
  created_at: string
}

interface VendorRequestsPanelProps {
  userId: string
  organizationId: string
}

export function VendorRequestsPanel({ userId, organizationId }: VendorRequestsPanelProps) {
  const [requests, setRequests] = useState<RecentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [supabase] = useState(() => createClient())

  const fetchRecentRequests = useCallback(async () => {
    try {
      // Usar la tabla de notificaciones que ya contiene los eventos mapeados de manera segura por el RLS (T028 y T026)
      const { data, error } = await supabase
        .from('notification_events')
        .select(
          `
          id,
          created_at,
          approval_requests!inner(
            id,
            request_type,
            status,
            payload,
            lots!inner(
              numero_lote,
              projects!inner(name)
            )
          )
        `
        )
        .eq('organization_id', organizationId)
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error

      interface SupabaseNotificationRow {
        id: string
        created_at: string
        approval_requests: {
          id: string
          request_type: 'reservation' | 'sale'
          status: 'pending' | 'approved' | 'rejected'
          payload?: {
            cliente_nombre?: string
          } | null
          lots: {
            numero_lote: string
            projects: {
              name: string
            }
          }
        }
      }

      const mapped = ((data as unknown as SupabaseNotificationRow[]) || []).map((row) => {
        const app = row.approval_requests
        const payload = app.payload || {}
        return {
          id: row.id,
          lot_label: `Lote ${app.lots.numero_lote}`,
          project_name: app.lots.projects.name,
          request_type: app.request_type,
          status: app.status,
          client_name: payload.cliente_nombre || 'N/A',
          created_at: row.created_at,
        }
      })

      setRequests(mapped)
    } catch (err) {
      console.error('Error al cargar solicitudes de vendedor:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, organizationId, supabase])

  useEffect(() => {
    let active = true

    const loadData = async () => {
      if (active) {
        await fetchRecentRequests()
      }
    }
    loadData()

    // Suscripción en tiempo real a las notificaciones recibidas por el vendedor
    const channel = supabase
      .channel('vendor-notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_events',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          if (active) {
            fetchRecentRequests()
          }
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [userId, fetchRecentRequests, supabase])

  if (loading) {
    return (
      <Card className="border-muted bg-muted/40">
        <CardContent className="h-[150px] flex items-center justify-center">
          <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-muted bg-muted/40 overflow-hidden relative shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" />
          Mis Solicitudes Recientes
          {requests.filter((r) => r.status === 'pending').length > 0 && (
            <Badge
              variant="outline"
              className="ml-auto bg-amber-50 text-amber-700 border-amber-200"
            >
              {requests.filter((r) => r.status === 'pending').length} en proceso
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Monitorea en tiempo real el estado de tus ingresos de reservas y ventas.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground animate-in fade-in duration-300">
            <ClipboardList className="h-12 w-12 text-muted/60 mb-3 stroke-[1.2]" />
            <p className="font-medium text-sm text-slate-700">Sin movimientos</p>
            <p className="text-xs max-w-xs mt-1">
              No tienes ingresos o solicitudes enviadas en este periodo.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-1">
            {requests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 rounded-xl border border-muted bg-background/50 hover:bg-background/90 transition-all duration-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="bg-primary/5 text-primary border-primary/20 font-semibold text-[10px]"
                    >
                      {req.lot_label}
                    </Badge>
                    <span className="text-[11px] font-bold text-slate-700">
                      {req.request_type === 'sale' ? 'Solicitud de Venta' : 'Solicitud de Reserva'}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {req.project_name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-500">Cliente:</span> {req.client_name}
                  </p>
                </div>

                <Badge
                  className={`text-[10px] font-bold py-0.5 px-2 border shrink-0 transition-all duration-300 flex items-center gap-1 ${
                    req.status === 'pending'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : req.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  {req.status === 'pending' ? (
                    <>
                      <Clock className="h-3 w-3 animate-spin" />
                      En Proceso
                    </>
                  ) : req.status === 'approved' ? (
                    <>
                      <CheckCircle className="h-3 w-3" />
                      Aprobada
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" />
                      No Aprobada
                    </>
                  )}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
