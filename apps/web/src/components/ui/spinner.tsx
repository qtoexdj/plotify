'use client'

import { useId } from 'react'
import { MARK_TRANSFORM, PLANE_PATH, DATA_PATHS } from './brand-mark-paths'

const PERIOD = 38

function DataLayer() {
  return (
    <g fill="currentColor">
      {DATA_PATHS.map((d) => (
        <path key={d.slice(0, 12)} d={d} />
      ))}
    </g>
  )
}

/**
 * Isotipo de marca usado como spinner (mark.svg inlined): el rombo superior
 * ("el plano") queda fijo en verde de marca, y las líneas discontinuas de
 * datos fluyen hacia arriba en loop y se desvanecen al acercarse al plano,
 * mientras nuevas líneas aparecen abajo.
 */
function Spinner({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  const uid = useId()
  const maskId = `spinner-fade-${uid}`
  const gradientId = `spinner-fade-gradient-${uid}`

  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className} {...props}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="22%" stopColor="white" stopOpacity="0" />
          <stop offset="38%" stopColor="white" stopOpacity="1" />
          <stop offset="90%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect x="0" y="0" width="64" height="64" fill={`url(#${gradientId})`} />
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        <g className="animate-spinner-conveyor">
          <g transform={MARK_TRANSFORM}>
            <DataLayer />
          </g>
          <g transform={`translate(0 ${PERIOD}) ${MARK_TRANSFORM}`}>
            <DataLayer />
          </g>
        </g>
      </g>

      <g transform={MARK_TRANSFORM}>
        <path fill="#16A34A" d={PLANE_PATH} />
      </g>
    </svg>
  )
}

export { Spinner }
