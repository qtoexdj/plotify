'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'
import { BrandMarkPaths } from './brand-mark-paths'

/**
 * Momento de marca para pantallas completas (splash, auth callback): el mark
 * queda fijo en baja opacidad mientras un barrido de luz lo recorre en loop,
 * evocando un escaneo/levantamiento del plano. Reservado para 1-2 lugares
 * grandes — para spinners chicos en botones/paneles usar `Spinner`.
 */
function BrandLoader({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  const uid = useId()
  const maskId = `brand-loader-mask-${uid}`
  const gradientId = `brand-loader-sweep-${uid}`

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn('text-foreground', className)}
      {...props}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <BrandMarkPaths dataFill="white" />
        </mask>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="50%" stopColor="white" stopOpacity="0.9" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g opacity="0.28">
        <BrandMarkPaths dataFill="currentColor" />
      </g>

      <g mask={`url(#${maskId})`}>
        <rect
          x="-32"
          y="0"
          width="24"
          height="64"
          fill={`url(#${gradientId})`}
          className="animate-brand-sweep"
        />
      </g>
    </svg>
  )
}

export { BrandLoader }
