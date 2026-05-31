'use client'

import { BellOff, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
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
      <div className="h-[250px] flex flex-col items-center justify-center text-muted-foreground gap-2.5 p-4 animate-in fade-in duration-300">
        <Loader2 className="h-7 w-7 animate-spin text-primary stroke-[1.5]" />
        <p className="text-xs font-medium text-slate-500">Cargando notificaciones...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-[250px] flex flex-col items-center justify-center text-center p-6 gap-2.5 animate-in fade-in duration-300">
        <div className="p-2 rounded-lg bg-red-50 text-red-500 border border-red-100">
          <AlertCircle className="h-6 w-6 stroke-[1.5]" />
        </div>
        <p className="text-xs font-semibold text-slate-700">Error al cargar</p>
        <p className="text-[11px] text-muted-foreground max-w-xs">{error}</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="h-[250px] flex flex-col items-center justify-center text-center p-6 gap-2.5 animate-in fade-in duration-300">
        <div className="p-3 rounded-full bg-slate-50 text-slate-400 border border-slate-100">
          <BellOff className="h-6 w-6 stroke-[1.2]" />
        </div>
        <p className="text-xs font-bold text-slate-700">Todo al día</p>
        <p className="text-[11px] text-muted-foreground max-w-[200px]">
          No tienes alertas o solicitudes pendientes en este momento.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Cabecera del Listado con opción de Marcar Todo */}
      {unreadItems.length > 0 && onMarkAllRead && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/50">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {unreadItems.length} sin leer
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkAllRead()
            }}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline transition-all"
          >
            <CheckCircle className="h-3 w-3" />
            Marcar todo como leído
          </button>
        </div>
      )}

      {/* Contenedor Adaptable con Scroll para manejar Desbordamiento (T017 responsivo) */}
      <div className="flex-1 overflow-y-auto max-h-[380px] p-3.5 space-y-2.5 scrollbar-thin scrollbar-thumb-slate-200">
        {items.map((item) => (
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
}
