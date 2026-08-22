import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

import { miniAppOrgId, miniAppUrl, resolveMiniAppOrgId } from '@/lib/miniapp/routes'

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

  it('usa start_param como org solo cuando no es un deep link de lote', () => {
    expect(resolveMiniAppOrgId(null, 'org-abc')).toBe('org-abc')
    expect(resolveMiniAppOrgId(null, 'lot_123')).toBeNull()
    expect(resolveMiniAppOrgId('org-query', 'lot_123')).toBe('org-query')
  })
})

describe('Deep link de lote redirige conservando la org', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'app', 'mini', 'page.tsx'),
    'utf-8'
  )

  it('el redirect al mapa usa miniAppUrl (con org) y no una ruta cruda', () => {
    expect(source).toContain("miniAppUrl('/mini/mapa'")
    expect(source).not.toMatch(/router\.replace\(`\/mini\/mapa\?/)
  })
})
