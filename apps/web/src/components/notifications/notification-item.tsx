'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon,
  Cancel01Icon,
  Loading01Icon,
  Task01Icon,
  UserIcon,
  Location01Icon,
  Calendar01Icon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
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
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)

  const isSale = item.request_type === 'sale'
  const currentStatus = optimisticStatus || item.status
  const isPending = currentStatus === 'pending'
  const isApproved = currentStatus === 'approved'

  const formattedDate = new Date(item.created_at).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!onDecide) return
    setDeciding(action)
    const targetStatus = action === 'approve' ? 'approved' : 'rejected'
    setOptimisticStatus(targetStatus)
    try {
      await onDecide(item.approval_id, action)
    } catch (error) {
      setOptimisticStatus(null)
      throw error
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
          ? 'bg-accent/5 border-accent/15 hover:bg-accent/10 cursor-pointer'
          : 'bg-background hover:bg-muted/40 border-border'
      }`}
    >
      {/* Sutil indicador estático para notificaciones no leídas */}
      {!item.read_at && (
        <span className="absolute top-3.5 right-3.5 h-2 w-2 rounded-full bg-primary" />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div
            className={`p-2 rounded-lg border shrink-0 ${
              isSale
                ? 'bg-accent/10 text-accent border-accent/25'
                : 'bg-success/10 text-success border-success/25'
            }`}
          >
            <HugeiconsIcon icon={Task01Icon} className="h-4.5 w-4.5 stroke-[1.5]" />
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-xs text-foreground">
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
              ? 'bg-warning/10 text-warning border-warning/25 shadow-none'
              : isApproved
                ? 'bg-success/10 text-success border-success/25 shadow-none'
                : 'bg-destructive/10 text-destructive border-destructive/20 shadow-none'
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={UserIcon}
            className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0"
          />
          <span className="font-semibold text-muted-foreground/80">Cliente:</span>
          <span className="truncate font-medium text-foreground">{item.client_name}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={Location01Icon}
            className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0"
          />
          <span className="font-semibold text-muted-foreground/80">Vendedor:</span>
          <span className="truncate font-medium text-foreground">{item.vendor_name}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={Calendar01Icon}
            className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0"
          />
          <span className="font-semibold text-muted-foreground/80">Fecha:</span>
          <span className="font-medium text-foreground">{formattedDate}</span>
        </div>

        {item.decided_at && (
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon
              icon={SparklesIcon}
              className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0"
            />
            <span className="font-semibold text-muted-foreground/80">Decisión:</span>
            <span className="font-medium text-foreground">
              {new Date(item.decided_at).toLocaleDateString('es-CL', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>
        )}
      </div>

      {/* Botones de acción administrativa */}
      {userRole === 'admin' && item.can_decide && onDecide && (
        <div className="flex w-full gap-2 justify-stretch border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleAction('reject')
            }}
            disabled={deciding !== null}
            className="border-destructive/20 text-destructive hover:bg-destructive/10 font-semibold h-8 text-[11px] px-3 flex items-center gap-1.5 flex-1 justify-center rounded-lg shadow-sm"
          >
            {deciding === 'reject' ? (
              <HugeiconsIcon icon={Loading01Icon} className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <HugeiconsIcon icon={Cancel01Icon} className="h-3.5 w-3.5" />
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
            className="bg-success text-success-foreground hover:bg-success/90 font-semibold h-8 text-[11px] px-3 flex items-center gap-1.5 flex-1 justify-center rounded-lg shadow-sm"
          >
            {deciding === 'approve' ? (
              <HugeiconsIcon icon={Loading01Icon} className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <HugeiconsIcon icon={Tick02Icon} className="h-3.5 w-3.5" />
            )}
            Aprobar
          </Button>
        </div>
      )}
    </div>
  )
}
