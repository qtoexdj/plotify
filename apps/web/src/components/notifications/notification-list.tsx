'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import { NotificationOff01Icon, AlertCircleIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { NotificationItem } from './notification-item'
import type { NotificationItem as NotificationItemType } from '@/lib/services/notifications.service'

interface NotificationListProps {
  items: NotificationItemType[]
  loading: boolean
  error: string | null
  userRole: 'admin' | 'vendor'
  onMarkRead: (notificationId: string) => Promise<void>
  onDecide?: (approvalId: string, action: 'approve' | 'reject') => Promise<void>
  onMarkAllRead?: () => Promise<void>
}

function NotificationSkeleton() {
  return (
    <div className="p-3.5 rounded-xl border border-border bg-background flex flex-col gap-3.5 animate-pulse text-left relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 w-full">
          <div className="rounded-lg bg-muted shrink-0 h-9 w-9" />
          <div className="space-y-2 flex-1 pt-1">
            <div className="h-3 w-2/3 bg-muted rounded" />
            <div className="h-2 w-1/3 bg-muted rounded" />
          </div>
        </div>
        <div className="h-4 w-16 bg-muted rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border pt-2.5">
        <div className="h-2.5 w-3/4 bg-muted rounded" />
        <div className="h-2.5 w-1/2 bg-muted rounded" />
      </div>
    </div>
  )
}

function getTemporalGroup(dateStr: string): 'Hoy' | 'Ayer' | 'Esta semana' | 'Anteriores' {
  const date = new Date(dateStr)
  const today = new Date()

  const todayReset = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dateReset = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const diffTime = todayReset.getTime() - dateReset.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return 'Esta semana'
  return 'Anteriores'
}

export function NotificationList({
  items,
  loading,
  error,
  userRole,
  onMarkRead,
  onDecide,
  onMarkAllRead,
}: NotificationListProps) {
  const unreadItems = items.filter((item) => !item.read_at)

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto max-h-[380px] p-3.5 space-y-2.5">
        <NotificationSkeleton />
        <NotificationSkeleton />
        <NotificationSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-[250px] flex flex-col items-center justify-center text-center p-6 gap-2.5 animate-in fade-in duration-300">
        <div className="p-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          <HugeiconsIcon icon={AlertCircleIcon} className="h-6 w-6 stroke-[1.5]" />
        </div>
        <p className="text-xs font-semibold text-foreground">Error al cargar</p>
        <p className="text-[11px] text-muted-foreground max-w-xs">{error}</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="h-[250px] flex flex-col items-center justify-center text-center p-6 gap-2.5 animate-in fade-in duration-300">
        <div className="p-3 rounded-full bg-muted/30 text-muted-foreground/60 border border-border">
          <HugeiconsIcon icon={NotificationOff01Icon} className="h-6 w-6 stroke-[1.2]" />
        </div>
        <p className="text-xs font-bold text-foreground">Todo al día</p>
        <p className="text-[11px] text-muted-foreground max-w-[200px]">
          No tienes alertas o solicitudes pendientes en este momento.
        </p>
      </div>
    )
  }

  // Agrupación temporal de las notificaciones
  const groups: Record<'Hoy' | 'Ayer' | 'Esta semana' | 'Anteriores', NotificationItemType[]> = {
    Hoy: [],
    Ayer: [],
    'Esta semana': [],
    Anteriores: [],
  }

  items.forEach((item) => {
    const group = getTemporalGroup(item.created_at)
    groups[group].push(item)
  })

  const groupKeys: ('Hoy' | 'Ayer' | 'Esta semana' | 'Anteriores')[] = [
    'Hoy',
    'Ayer',
    'Esta semana',
    'Anteriores',
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Cabecera del Listado con opción de Marcar Todo */}
      {unreadItems.length > 0 && onMarkAllRead && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/10">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {unreadItems.length} sin leer
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkAllRead()
            }}
            className="text-[10px] font-bold text-accent hover:text-accent/80 flex items-center gap-1 hover:underline transition-all"
          >
            <HugeiconsIcon icon={Tick02Icon} className="h-3.5 w-3.5" />
            Marcar todo como leído
          </button>
        </div>
      )}

      {/* Contenedor Adaptable con Scroll y Agrupamiento Temporal */}
      <div className="flex-1 overflow-y-auto max-h-[380px] p-3.5 space-y-3.5 scrollbar-thin">
        {groupKeys.map((key) => {
          const groupItems = groups[key]
          if (groupItems.length === 0) return null

          return (
            <div key={key} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  {key}
                </span>
                <span className="flex-1 h-px bg-border/40" />
              </div>
              <div className="space-y-2.5">
                {groupItems.map((item) => (
                  <NotificationItem
                    key={item.id}
                    item={item}
                    userRole={userRole}
                    onMarkRead={onMarkRead}
                    onDecide={onDecide}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
