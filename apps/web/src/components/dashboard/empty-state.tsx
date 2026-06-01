import Link from 'next/link'
import type { ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  action?: ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 border border-border bg-background rounded-2xl shadow-sm max-w-xl mx-auto py-14 space-y-5 animate-fade-in-up">
      {/* Icon Area decorated with subtle soft background */}
      <div className="p-4.5 rounded-full bg-accent/5 text-accent border border-accent/15 flex items-center justify-center shadow-inner">
        <HugeiconsIcon icon={Icon} className="w-12 h-12 stroke-[1.2]" />
      </div>

      {/* Texts area */}
      <div className="space-y-2">
        <h3 className="text-xl font-bold tracking-tight text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{description}</p>
      </div>

      {action ??
        (actionLabel ? (
          actionHref ? (
            <Link href={actionHref}>
              <Button size="lg" className="shadow-md">
                {actionLabel}
              </Button>
            </Link>
          ) : onAction ? (
            <Button size="lg" onClick={onAction} className="shadow-md">
              {actionLabel}
            </Button>
          ) : null
        ) : null)}
    </div>
  )
}
