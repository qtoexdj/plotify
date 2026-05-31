'use client'

import { useState } from 'react'
import { Check, X, Loader2, ClipboardList, User, MapPin, Calendar, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { NotificationItem as NotificationItemType } from '@/lib/services/notifications.service'

interface NotificationItemProps {
  item: NotificationItemType
  userRole: 'admin' | 'vendor'
  onMarkRead: (notificationId: string) => Promise<void>
  onDecide?: (approvalId: string, action: 'approve' | 'reject') => Promise<void>
}

export function NotificationItem({ item, userRole, onMarkRead, onDecide }: NotificationItemProps) {
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null)
  const [markingRead, setMarkingRead] = useState(false)

  const isSale = item.request_type === 'sale'
  const isPending = item.status === 'pending'
  const isApproved = item.status === 'approved'

  const formattedDate = new Date(item.created_at).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!onDecide) return
    setDeciding(action)
    try {
      await onDecide(item.approval_id, action)
    } finally {
      setDeciding(null)
    }
  }

  const handleItemClick = async () => {
    if (!item.read_at && !markingRead) {
      setMarkingRead(true)
      try {
        await onMarkRead(item.id)
      } finally {
        setMarkingRead(false)
      }
    }
  }

  const isVendor = userRole === 'vendor'

  return (
    <div
      onClick={handleItemClick}
      className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-3.5 shadow-sm text-left relative overflow-hidden group ${
        !item.read_at
          ? 'bg-gradient-to-r from-blue-50/50 via-background to-background border-blue-100 hover:from-blue-50 hover:to-background cursor-pointer'
          : 'bg-background hover:bg-slate-50/50 border-muted'
      }`}
    >
      {/* Sutil micro-animación pulsante para notificaciones no leídas */}
      {!item.read_at && (
        <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div
            className={`p-2 rounded-lg border shrink-0 ${
              isSale
                ? 'bg-blue-50 text-blue-600 border-blue-100'
                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
            }`}
          >
            <ClipboardList className="h-4.5 w-4.5 stroke-[1.5]" />
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-xs text-slate-800">
                {isVendor
                  ? isSale
                    ? 'Solicitud de Venta'
                    : 'Solicitud de Reserva'
                  : isSale
                    ? 'Aprobación de Venta'
                    : 'Aprobación de Reserva'}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] py-0 px-1.5 font-semibold bg-background"
              >
                {item.lot_label}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium">{item.project_name}</p>
          </div>
        </div>

        <Badge
          className={`text-[10px] font-bold py-0.5 px-2 border transition-all duration-300 ${
            isPending
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : isApproved
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {isPending
            ? 'En Proceso'
            : isApproved
              ? isVendor
                ? 'Procesada con éxito'
                : 'Aprobada'
              : isVendor
                ? 'No Aprobada'
                : 'Rechazada'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100/80 pt-2.5 text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-500">Cliente:</span>
          <span className="truncate font-medium text-slate-700">{item.client_name}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-500">Vendedor:</span>
          <span className="truncate font-medium text-slate-700">{item.vendor_name}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="font-semibold text-slate-500">Fecha:</span>
          <span className="font-medium text-slate-700">{formattedDate}</span>
        </div>

        {item.decided_at && (
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-500">Decisión:</span>
            <span className="font-medium text-slate-700">
              {new Date(item.decided_at).toLocaleDateString('es-CL', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>
        )}
      </div>

      {/* Botones de acción administrativa (T023 - US2) */}
      {userRole === 'admin' && item.can_decide && onDecide && (
        <div className="flex w-full gap-2 justify-stretch border-t border-slate-100/80 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleAction('reject')
            }}
            disabled={deciding !== null}
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold h-8 text-[11px] px-3 flex items-center gap-1.5 flex-1 justify-center rounded-lg shadow-sm"
          >
            {deciding === 'reject' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Rechazar
          </Button>

          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleAction('approve')
            }}
            disabled={deciding !== null}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold h-8 text-[11px] px-3 flex items-center gap-1.5 flex-1 justify-center rounded-lg shadow-sm"
          >
            {deciding === 'approve' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Aprobar
          </Button>
        </div>
      )}
    </div>
  )
}
