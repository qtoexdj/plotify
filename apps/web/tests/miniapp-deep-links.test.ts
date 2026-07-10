import { describe, expect, it } from 'vitest'

import { miniAppOrgId, miniAppUrl } from '@/lib/miniapp/routes'

describe('Mini App deep links', () => {
  it('prioritizes canonical org while accepting org_id during the migration', () => {
    expect(miniAppOrgId(new URLSearchParams('org=canonical&org_id=legacy'))).toBe('canonical')
    expect(miniAppOrgId(new URLSearchParams('org_id=legacy'))).toBe('legacy')
  })

  it('always emits canonical org query parameters', () => {
    expect(miniAppUrl('/mini/bandeja/approval-1', 'org-1', { tipo: 'reserva' })).toBe(
      '/mini/bandeja/approval-1?org=org-1&tipo=reserva'
    )
  })
})
