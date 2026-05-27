import type { VerifiedStatus } from '@/types/database.types'

export interface LotReadinessResult {
  isReady: boolean
  errors: string[]
}

export interface MinimalBoundary {
  label: string
  distance?: number | null
  colinda?: string | null
}

export interface MinimalLotForReadiness {
  id?: string
  verified_status?: VerifiedStatus | null
  area_official_m2?: number | null
  boundaries_official?: MinimalBoundary[] | null
  perimeter_official_m?: number | null
}

/**
 * Valida si un lote cumple con los requisitos de la User Story 1 para estar
 * "Listo para Documentos" (Document Readiness).
 *
 * Requisitos:
 * 1. verified_status debe ser 'verified_exact' o 'verified_override'.
 * 2. area_official_m2 debe estar definido y ser mayor a 0.
 * 3. boundaries_official debe tener al menos un deslinde, y todos deben ser válidos
 *    (orientación no vacía y distancia > 0).
 */
export function validateLotDocumentReadiness(lot: MinimalLotForReadiness): LotReadinessResult {
  const errors: string[] = []

  // 1. Validar verified_status
  if (!lot.verified_status || lot.verified_status === 'draft') {
    errors.push('El lote debe estar verificado (verified_exact o verified_override)')
  }

  // 2. Validar area_official_m2
  if (lot.area_official_m2 === undefined || lot.area_official_m2 === null) {
    errors.push('La superficie oficial es requerida')
  } else if (lot.area_official_m2 <= 0) {
    errors.push('La superficie oficial debe ser mayor a 0')
  }

  // 2.5. Validar perimeter_official_m
  if (lot.perimeter_official_m === undefined || lot.perimeter_official_m === null) {
    errors.push('El perímetro oficial es requerido')
  } else if (lot.perimeter_official_m <= 0) {
    errors.push('El perímetro oficial debe ser mayor a 0')
  }

  // 3. Validar boundaries_official
  if (
    !lot.boundaries_official ||
    !Array.isArray(lot.boundaries_official) ||
    lot.boundaries_official.length === 0
  ) {
    errors.push('Los deslindes oficiales son requeridos')
  } else {
    const invalidBoundaries = lot.boundaries_official.filter(
      (b) =>
        !b.label ||
        b.label.trim() === '' ||
        b.distance === undefined ||
        b.distance === null ||
        b.distance <= 0
    )
    if (invalidBoundaries.length > 0) {
      errors.push('Todos los deslindes oficiales deben tener orientación y una distancia mayor a 0')
    }
  }

  return {
    isReady: errors.length === 0,
    errors,
  }
}
