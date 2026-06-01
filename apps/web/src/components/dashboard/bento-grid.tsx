import React from 'react'
import { cn } from '@/lib/utils'

interface BentoGridProps {
  children: React.ReactNode
  className?: string
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:gap-6 md:grid-cols-12', className)}>
      {children}
    </div>
  )
}

interface BentoPanelProps {
  children: React.ReactNode
  className?: string
}

export function BentoPanel({ children, className }: BentoPanelProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  )
}
