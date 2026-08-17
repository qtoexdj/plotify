'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Notification01Icon } from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  listNotifications,
  markNotificationRead,
  dismissNotification,
  markAllNotificationsRead,
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

const PAGE_SIZE = 50
const REFRESH_INTERVAL_MS = 60_000

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
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [supabase] = useState(() => createClient())

  // Ref del estado de ítems para que los refrescos de fondo sepan si el
  // usuario ya cargó más páginas (y así no pisotear el historial cargado).
  const itemsRef = useRef<NotificationItem[]>([])
  const setItemsPreserving = (updater: (prev: NotificationItem[]) => NotificationItem[]) => {
    setItems((prev) => {
      const next = updater(prev)
      itemsRef.current = next
      return next
    })
  }

  // Carga reactiva de notificaciones desde el microservicio (paginada)
  const fetchNotifications = useCallback(
    async (offset = 0, append = false, opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false
      try {
        const result = await listNotifications(userId, organizationId, {
          limit: PAGE_SIZE,
          offset,
        })
        if (!result.success) {
          throw new Error(result.error)
        }
        if (append) {
          // "Cargar más": agrega al final sin duplicar.
          const existing = new Set(itemsRef.current.map((i) => i.id))
          const merged = [...itemsRef.current, ...result.items.filter((i) => !existing.has(i.id))]
          setItemsPreserving(() => merged)
          setHasMore(result.items.length === PAGE_SIZE)
        } else if (silent && itemsRef.current.length > PAGE_SIZE) {
          // Refresco de fondo con historial expandido: conservar las páginas
          // cargadas y solo refrescar conteos (US5-AC1 exige contar, no listar).
          setCounts(result.counts)
        } else {
          // Carga inicial / apertura / decisión: reemplazar la primera página.
          setItemsPreserving(() => result.items)
          setHasMore(result.items.length === PAGE_SIZE)
        }
        setCounts(result.counts)
        setError(null)
      } catch (err) {
        if (append) {
          // "Cargar más" falló: la lista actual se mantiene intacta.
          toast.error('No se pudieron cargar más notificaciones.')
          return
        }
        // La campana comunica el fallo vía el estado `error` (UI), no por
        // consola: Next.js 16 muestra los console.error en el overlay de dev
        // aunque estén capturados, lo que ruido durante recargas de la API.
        // Los refrescos en segundo plano (silent) ni siquiera tocan el estado.
        if (!silent) {
          setError(
            err instanceof Error ? err.message : 'No se pudieron obtener las notificaciones.'
          )
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [userId, organizationId]
  )

  useEffect(() => {
    let active = true

    const loadData = async () => {
      if (active) {
        await fetchNotifications()
      }
    }
    loadData()

    // Suscripción Realtime para actualizar la campana en tiempo real
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
            fetchNotifications(0, false, { silent: true })
          }
        }
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [organizationId, fetchNotifications, supabase])

  // Refresco proactivo: al volver al foco de la pestaña y cada 60 s.
  // Fallos silenciosos: con sesión inactiva/red caída no se rompe la campana.
  useEffect(() => {
    const onFocus = () => fetchNotifications(0, false, { silent: true })
    window.addEventListener('focus', onFocus)
    const intervalId = window.setInterval(
      () => fetchNotifications(0, false, { silent: true }),
      REFRESH_INTERVAL_MS
    )
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(intervalId)
    }
  }, [fetchNotifications])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      fetchNotifications()
    }
  }

  // Cargar la siguiente página del historial
  const handleLoadMore = async () => {
    setLoadingMore(true)
    await fetchNotifications(itemsRef.current.length, true)
  }

  // Marcar una notificación como leída
  const handleMarkRead = async (notificationId: string) => {
    try {
      const result = await markNotificationRead(notificationId, userId)
      if (!result.success) throw new Error(result.error)

      // Actualizar localmente de forma reactiva e instantánea
      setItemsPreserving((prev) =>
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

  // Marcar todas las notificaciones como leídas en UNA operación
  const handleMarkAllRead = async () => {
    const unreadIds = items.filter((item) => !item.read_at).map((item) => item.id)
    if (unreadIds.length === 0) return

    try {
      const result = await markAllNotificationsRead(userId, organizationId)
      if (!result.success) throw new Error(result.error)

      await fetchNotifications()
      toast.success('Todas las notificaciones marcadas como leídas.')
    } catch (err) {
      console.error('Error al marcar todo como leído:', err)
      toast.error('Ocurrió un error al marcar todas las notificaciones.')
    }
  }

  // Descartar (soft-dismiss) una notificación
  const handleDismiss = async (notificationId: string) => {
    const target = itemsRef.current.find((item) => item.id === notificationId)
    try {
      const result = await dismissNotification(notificationId, userId)
      if (!result.success) throw new Error(result.error)

      setItemsPreserving((prev) => prev.filter((item) => item.id !== notificationId))
      setCounts((prev) => ({
        ...prev,
        pending:
          target && target.status === 'pending' ? Math.max(0, prev.pending - 1) : prev.pending,
        unread: target && !target.read_at ? Math.max(0, prev.unread - 1) : prev.unread,
      }))
    } catch (err) {
      console.error('Error al descartar:', err)
      toast.error('No se pudo descartar la notificación.')
      // No relanzar: el ítem permanece visible y el toast comunica el error
      // (AC-5). Relanzar generaría un unhandled rejection en consola.
    }
  }

  // Decidir aprobaciones directamente desde las notificaciones
  const handleDecide = async (approvalId: string, action: 'approve' | 'reject') => {
    try {
      const result = await decideNotificationApproval(approvalId, action, userId, organizationId)

      if (!result.success) {
        const message =
          result.code === 'already_processed'
            ? 'Esta solicitud ya fue procesada por otro canal (ej. Telegram).'
            : result.error || 'Error al procesar la decisión.'

        throw new Error(message)
      }

      toast.success(
        action === 'approve'
          ? 'Solicitud aprobada exitosamente.'
          : 'Solicitud rechazada exitosamente.'
      )

      // Refrescar conteo reactivo global
      await fetchNotifications()
    } catch (err) {
      const errorMsg = err as Error
      toast.error(errorMsg.message || 'Error al procesar la decisión.')
      await fetchNotifications()
      throw err
    }
  }

  return (
    <div className="relative flex items-center justify-center h-10 w-10">
      {/* Región live separada del control para anunciar cambios de conteo
          (WCAG 4.1.3: live regions no deben vivir dentro de un botón). */}
      <span className="sr-only" aria-live="polite">
        {counts.pending > 0
          ? `${counts.pending} solicitudes pendientes`
          : 'Sin solicitudes pendientes'}
      </span>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-muted rounded-full h-9 w-9 flex items-center justify-center transition-all duration-200 group"
            aria-label={`Campana de notificaciones${
              counts.pending > 0 ? `, ${counts.pending} solicitudes pendientes` : ''
            }`}
          >
            <HugeiconsIcon
              icon={Notification01Icon}
              className="h-5 w-5 text-muted-foreground stroke-[1.8] group-hover:scale-105 transition-transform"
            />
            {counts.pending > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center border-2 border-background animate-in zoom-in duration-200">
                {counts.pending > 99 ? '99+' : counts.pending}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        {/* Dropdown flotante premium con Radix Popover */}
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[360px] p-0 rounded-2xl border border-border bg-background shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-3 duration-300 relative z-50"
        >
          <div className="px-4 py-3.5 border-b border-border flex items-center justify-between bg-muted/20">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              Notificaciones
              {counts.pending > 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </h3>
            {loading && <Spinner className="h-4 w-4" />}
          </div>

          <NotificationList
            items={items}
            loading={loading}
            error={error}
            userRole={userRole}
            onMarkRead={handleMarkRead}
            onDecide={handleDecide}
            onMarkAllRead={handleMarkAllRead}
            onDismiss={handleDismiss}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
