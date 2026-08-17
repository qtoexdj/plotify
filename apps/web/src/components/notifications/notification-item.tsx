'use client'

import { useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon,
  Cancel01Icon,
  Task01Icon,
  UserIcon,
  Location01Icon,
  Calendar01Icon,
  SparklesIcon,
  NotificationOff01Icon,
} from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { NotificationItem as NotificationItemType } from '@/lib/services/notifications.service'

interface NotificationItemProps {
  item: NotificationItemType
  userRole: 'admin' | 'vendor'
  onMarkRead: (notificationId: string) => Promise<void>
  onDecide?: (approvalId: string, action: 'approve' | 'reject') => Promise<void>
  onDismiss: (notificationId: string) => Promise<void>
}

export function NotificationItem({
  item,
  userRole,
  onMarkRead,
  onDecide,
  onDismiss,
}: NotificationItemProps) {
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null)
  const [markingRead, setMarkingRead] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)

  const isSale = item.request_type === 'sale'
  const currentStatus = optimisticStatus || item.status
  const isPending = currentStatus === 'pending'
  const isApproved = currentStatus === 'approved'
  const isUnread = !item.read_at

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
    if (!isUnread || markingRead) return
    setMarkingRead(true)
    try {
      await onMarkRead(item.id)
    } finally {
      setMarkingRead(false)
    }
  }

  const handleItemKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isUnread) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      handleItemClick()
    }
  }

  const handleDismissClick = async () => {
    if (dismissing) return
    setDismissing(true)
    try {
      await onDismiss(item.id)
    } finally {
      setDismissing(false)
    }
  }

  const isVendor = userRole === 'vendor'

  const fallbackTitle = isVendor
    ? isSale
      ? 'Solicitud de Venta'
      : 'Solicitud de Reserva'
    : isSale
      ? 'Aprobación de Venta'
      : 'Aprobación de Reserva'
  const title = item.title || fallbackTitle

  const hasDestination = Boolean(item.deep_link && item.action_label)

  return (
    <div
      role="article"
      aria-label={`Notificación${isUnread ? ' sin leer' : ''}: ${title}`}
      onClick={handleItemClick}
      tabIndex={isUnread ? 0 : -1}
      onKeyDown={handleItemKeyDown}
      className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-3.5 shadow-sm text-left relative overflow-hidden group ${
        isUnread
          ? 'bg-accent/5 border-accent/15 hover:bg-accent/10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          : 'bg-background hover:bg-muted/40 border-border'
      }`}
    >
      {/* Sutil indicador estático para notificaciones no leídas */}
      {isUnread && <span className="absolute top-3.5 right-3.5 h-2 w-2 rounded-full bg-primary" />}

      {/* Control de marcar como leída (teclado accesible, solo no leídas) */}
      {isUnread && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleItemClick()
          }}
          disabled={markingRead}
          aria-label="Marcar como leída"
          title="Marcar como leída"
          className="absolute top-3 right-[4.5rem] h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-accent hover:bg-accent/10 transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {markingRead ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : (
            <HugeiconsIcon icon={Tick02Icon} className="h-3.5 w-3.5 stroke-[1.5]" />
          )}
        </button>
      )}

      {/* Control de descarte (soft-dismiss) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          handleDismissClick()
        }}
        disabled={dismissing}
        aria-label="Descartar notificación"
        title="Descartar notificación"
        className="absolute top-3 right-10 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dismissing ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <HugeiconsIcon icon={NotificationOff01Icon} className="h-3.5 w-3.5 stroke-[1.5]" />
        )}
      </button>

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
              <span className="font-semibold text-xs text-foreground">{title}</span>
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

      {/* Copy de contexto calculado por el servidor */}
      {item.message && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{item.message}</p>
      )}

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

      {/* Llamada a la acción con destino (1 clic) */}
      {hasDestination && (
        <div className="border-t border-border pt-3">
          <Link
            href={item.deep_link!}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 font-semibold h-8 text-[11px] px-3 shadow-sm"
          >
            <HugeiconsIcon icon={Task01Icon} className="h-3.5 w-3.5" />
            {item.action_label}
          </Link>
        </div>
      )}

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
              <Spinner className="h-3.5 w-3.5" />
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
              <Spinner className="h-3.5 w-3.5" />
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
