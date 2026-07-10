// @vitest-environment jsdom
import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MiniAppShell } from '@/lib/miniapp/mini-app-shell'

const push = vi.fn()
const webApp = {
  initDataUnsafe: { user: { id: 123 } },
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('org=org-1'),
}))

vi.mock('@/lib/miniapp/telegram', () => ({
  useTelegram: () => ({
    isAvailable: true,
    initData: 'auth_date=1&hash=telegram',
    webApp,
  }),
}))

vi.mock('@/lib/miniapp/session', () => ({
  getMiniappSession: () => null,
  setMiniappSession: vi.fn(),
  clearMiniappSession: vi.fn(),
  isSessionExpired: () => true,
}))

describe('MiniAppShell', () => {
  beforeEach(() => {
    push.mockReset()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'not_linked' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )
    )
  })

  it('deja de verificar antes de navegar al onboarding de un chat no vinculado', async () => {
    const view = render(
      <React.StrictMode>
        <MiniAppShell>
          <p>Vincular cuenta</p>
        </MiniAppShell>
      </React.StrictMode>
    )

    await waitFor(() => expect(push).toHaveBeenCalledWith('/mini/vincular?org=org-1&chat_id=123'))

    await act(async () => {})
    expect(screen.queryByText('Verificando sesión segura...')).toBeNull()
    expect(screen.getByText('Vincular cuenta')).toBeTruthy()

    view.rerender(
      <React.StrictMode>
        <MiniAppShell>
          <p>Vincular cuenta</p>
        </MiniAppShell>
      </React.StrictMode>
    )
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
