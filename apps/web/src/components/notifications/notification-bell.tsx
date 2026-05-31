'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  listNotifications,
  markNotificationRead,
  decideNotificationApproval,
  type NotificationItem,
  type NotificationCounts,
} from '@/lib/services/notifications.service'
import { NotificationList } from './notification-list'

interface NotificationBellProps {
  userId: string
  organizationId: string
  userRole: 'admin' | 'vendor'
}

export function NotificationBell({ userId, organizationId, userRole }: NotificationBellProps) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [counts, setCounts] = useState<NotificationCounts>({
    pending: 0,
    approved: 0,
    rejected: 0,
    unread: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const [supabase] = useState(() => createClient())

  // Carga reactiva de notificaciones desde el microservicio
  const fetchNotifications = useCallback(async () => {
    try {
      const result = await listNotifications(userId, organizationId)
      if (!result.success) {
        throw new Error(result.error)
      }
      setItems(result.items)
      setCounts(result.counts)
      setError(null)
    } catch (err) {
      console.error('Error al cargar notificaciones:', err)
      setError(err instanceof Error ? err.message : 'No se pudieron obtener las notificaciones.')
    } finally {
      setLoading(false)
    }
  }, [userId, organizationId])

  useEffect(() => {
    let active = true

    const loadData = async () => {
      if (active) {
        await fetchNotifications()
      }
    }
    loadData()

    // Suscripción Realtime para actualizar la campana en tiempo real (US1 y US5)
    const channel = supabase
      .channel('notification-events-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_events',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (active) {
            fetchNotifications()
          }
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [organizationId, fetchNotifications, supabase])

  // Marcar una notificación como leída
  const handleMarkRead = async (notificationId: string) => {
    try {
      const result = await markNotificationRead(notificationId, userId)
      if (!result.success) throw new Error(result.error)

      // Actualizar localmente de forma reactiva e instantánea
      setItems((prev) =>
        prev.map((item) =>
          item.id === notificationId
            ? { ...item, read_at: result.readAt || new Date().toISOString() }
            : item
        )
      )
      setCounts((prev) => ({
        ...prev,
        unread: Math.max(0, prev.unread - 1),
      }))
    } catch (err) {
      console.error('Error al marcar leída:', err)
      toast.error('No se pudo marcar la notificación como leída.')
    }
  }

  // Marcar todas las notificaciones como leídas
  const handleMarkAllRead = async () => {
    const unreadIds = items.filter((item) => !item.read_at).map((item) => item.id)
    if (unreadIds.length === 0) return

    try {
      // Marcar lectura secuencial en la API
      await Promise.all(unreadIds.map((id) => markNotificationRead(id, userId)))

      // Refrescar conteo reactivo
      await fetchNotifications()
      toast.success('Todas las notificaciones marcadas como leídas.')
    } catch (err) {
      console.error('Error al marcar todo como leído:', err)
      toast.error('Ocurrió un error al marcar todas las notificaciones.')
    }
  }

  // Decidir aprobaciones directamente desde las notificaciones
  const handleDecide = async (approvalId: string, action: 'approve' | 'reject') => {
    try {
      const result = await decideNotificationApproval(approvalId, action, userId, organizationId)

      if (!result.success) {
        if (result.code === 'already_processed') {
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

      // Refrescar conteo reactivo global
      await fetchNotifications()
    } catch (err) {
      const errorMsg = err as Error
      toast.error(errorMsg.message || 'Error al procesar la decisión.')
    }
  }

  return (
    <div className="relative flex items-center justify-center h-10 w-10">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-slate-100/80 rounded-full h-9 w-9 flex items-center justify-center transition-all duration-200"
            aria-label="Campana de notificaciones"
          >
            <Bell className="h-5 w-5 text-slate-600 stroke-[1.8] group-hover:scale-105 transition-transform" />
            {counts.unread > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] rounded-full flex items-center justify-center text-[10px] font-bold px-1.5 animate-pulse border-2 border-background"
              >
                {counts.unread}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>

        {/* Dropdown flotante premium con Radix Popover */}
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[360px] p-0 rounded-2xl border border-slate-100 bg-background shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-3 duration-300 relative z-50"
        >
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
              Notificaciones
              {counts.unread > 0 && (
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              )}
            </h3>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>

          <NotificationList
            items={items}
            loading={loading}
            error={error}
            userRole={userRole}
            onMarkRead={handleMarkRead}
            onDecide={handleDecide}
            onMarkAllRead={handleMarkAllRead}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
