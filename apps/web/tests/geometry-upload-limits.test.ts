import { describe, expect, it } from 'vitest'
import { GeometryLimitError, inspectKmlLimits } from '@/lib/services/kmz-parser.service'

describe('bounded geometry parsing', () => {
  it('rejects XML depth and coordinate bombs with stable codes', () => {
    expect(() => inspectKmlLimits('<a>'.repeat(40) + '</a>'.repeat(40))).toThrowError(
      expect.objectContaining({ code: 'XML_DEPTH_LIMIT' })
    )
    const coordinates = Array.from({ length: 200_001 }, () => '-70,-33').join(' ')
    expect(() => inspectKmlLimits(`<coordinates>${coordinates}</coordinates>`)).toThrowError(
      expect.objectContaining({ code: 'COORDINATE_LIMIT' })
    )
  })

  it('exports a typed stable limit error', () => {
    expect(new GeometryLimitError('FEATURE_DISABLED').code).toBe('FEATURE_DISABLED')
  })
})
