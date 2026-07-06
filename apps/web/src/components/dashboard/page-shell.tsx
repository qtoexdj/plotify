import React from 'react'
import { cn } from '@/lib/utils'

interface PageShellProps {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  id?: string
}

export function PageShell({ children, className, contentClassName, id }: PageShellProps) {
  return (
    <section
      id={id}
      className={cn('mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8', className)}
    >
      <div className={cn('space-y-6 animate-fade-in-up', contentClassName)}>{children}</div>
    </section>
  )
}
