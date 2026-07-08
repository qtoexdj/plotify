import { describe, expect, it } from 'vitest'
import {
  LotEstadoTransitionError,
  isReleaseTransition,
  isValidLotEstadoTransition,
} from '@/lib/models/lot-transitions'

describe('isValidLotEstadoTransition (FR-018, data-model §2)', () => {
  it('permite las 5 transiciones válidas de la tabla', () => {
    expect(isValidLotEstadoTransition('disponible', 'reservado')).toBe(true)
    expect(isValidLotEstadoTransition('disponible', 'vendido')).toBe(true)
    expect(isValidLotEstadoTransition('reservado', 'vendido')).toBe(true)
    expect(isValidLotEstadoTransition('reservado', 'disponible')).toBe(true)
    expect(isValidLotEstadoTransition('vendido', 'disponible')).toBe(true)
  })

  it('permite el no-op (mismo estado)', () => {
    expect(isValidLotEstadoTransition('disponible', 'disponible')).toBe(true)
    expect(isValidLotEstadoTransition('reservado', 'reservado')).toBe(true)
    expect(isValidLotEstadoTransition('vendido', 'vendido')).toBe(true)
  })

  it('rechaza transiciones fuera de la tabla', () => {
    expect(isValidLotEstadoTransition('vendido', 'reservado')).toBe(false)
  })
})

describe('isReleaseTransition', () => {
  it('identifica reservado/vendido -> disponible como liberación', () => {
    expect(isReleaseTransition('reservado', 'disponible')).toBe(true)
    expect(isReleaseTransition('vendido', 'disponible')).toBe(true)
  })

  it('no marca el no-op ni otras transiciones como liberación', () => {
    expect(isReleaseTransition('disponible', 'disponible')).toBe(false)
    expect(isReleaseTransition('disponible', 'reservado')).toBe(false)
  })
})

describe('LotEstadoTransitionError', () => {
  it('incluye el origen y destino en el mensaje', () => {
    const error = new LotEstadoTransitionError('vendido', 'reservado')
    expect(error.message).toContain('vendido')
    expect(error.message).toContain('reservado')
  })
})
