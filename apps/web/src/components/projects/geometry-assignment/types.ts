import type { ParsedFeature } from '@/types/onboarding.types'
import type { GeometryType } from '@/types/database.types'
import type { Lot } from '@/types/database.types'

export interface GeometryAssignmentProps {
  projectId: string
  parsedFeatures: ParsedFeature[]
  sourceType: 'kmz' | 'kml' | 'dxf' | 'dwg'
  onFeatureAssigned: (tempId: string) => void
  onAssignmentComplete: () => void
}

export type FilterType = 'all' | GeometryType
export type AssignAsType = 'lot' | 'road' | 'common_area'

/** Colors used for assignment layers (features don't yet have estado) */
export const ASSIGNMENT_COLORS = {
  lot: { fill: '#cbd5e1', stroke: '#64748b' },
  road: { fill: 'transparent', stroke: '#f59e0b' },
  common_area: { fill: '#a78bfa', stroke: '#7c3aed' },
} as const

export type { Lot, GeometryType, ParsedFeature }
