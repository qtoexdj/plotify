// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useTelegram } from '@/lib/miniapp/telegram'
import {
  getMiniappSession,
  setMiniappSession,
  isSessionExpired,
  clearMiniappSession,
} from '@/lib/miniapp/session'

afterEach(cleanup)

// Componente helper para testear el hook en un entorno React
function TestHookComponent() {
  const { isAvailable, webApp, user, initData } = useTelegram()
  return (
    <div>
      <span data-testid="is-available">{isAvailable ? 'yes' : 'no'}</span>
      <span data-testid="has-webapp">{webApp ? 'yes' : 'no'}</span>
      <span data-testid="init-data">{initData}</span>
      <span data-testid="user-id">{user?.id || ''}</span>
    </div>
  )
}

describe('Telegram Web App SDK Hook (useTelegram)', () => {
  beforeEach(() => {
    // Mock global del objeto Telegram WebApp
    vi.stubGlobal('window', {
      Telegram: {
        WebApp: {
          ready: vi.fn(),
          expand: vi.fn(),
          close: vi.fn(),
          initData: 'query_id=AA&user=%7B%22id%22%3A123%7D&hash=xyz',
          initDataUnsafe: {
            query_id: 'AA',
            user: { id: 123 },
          },
          themeParams: {
            bg_color: '#ffffff',
            text_color: '#000000',
            button_color: '#2481cc',
            button_text_color: '#ffffff',
          },
          MainButton: {
            text: '',
            setText: vi.fn().mockReturnThis(),
            show: vi.fn().mockReturnThis(),
            hide: vi.fn().mockReturnThis(),
            onClick: vi.fn().mockReturnThis(),
            offClick: vi.fn().mockReturnThis(),
            enable: vi.fn().mockReturnThis(),
            disable: vi.fn().mockReturnThis(),
          },
          BackButton: {
            show: vi.fn().mockReturnThis(),
            hide: vi.fn().mockReturnThis(),
            onClick: vi.fn().mockReturnThis(),
            offClick: vi.fn().mockReturnThis(),
          },
          onEvent: vi.fn(),
          offEvent: vi.fn(),
          enableClosingConfirmation: vi.fn(),
          disableClosingConfirmation: vi.fn(),
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('debe resolver isAvailable como true e inicializar WebApp si está en window', () => {
    render(<TestHookComponent />)
    expect(screen.getByTestId('is-available').textContent).toBe('yes')
    expect(screen.getByTestId('has-webapp').textContent).toBe('yes')
    expect(screen.getByTestId('init-data').textContent).toBe(
      'query_id=AA&user=%7B%22id%22%3A123%7D&hash=xyz'
    )
    expect(screen.getByTestId('user-id').textContent).toBe('123')
    expect(window.Telegram?.WebApp.ready).toHaveBeenCalled()
    expect(window.Telegram?.WebApp.expand).toHaveBeenCalled()
    expect(window.Telegram?.WebApp.onEvent).toHaveBeenCalledWith(
      'themeChanged',
      expect.any(Function)
    )
  })

  it('debe resolver isAvailable como false y webApp null si window.Telegram no existe', () => {
    vi.stubGlobal('window', {})
    render(<TestHookComponent />)
    expect(screen.getByTestId('is-available').textContent).toBe('no')
    expect(screen.getByTestId('has-webapp').textContent).toBe('no')
    expect(screen.getByTestId('init-data').textContent).toBe('')
    expect(screen.getByTestId('user-id').textContent).toBe('')
  })
})

describe('Miniapp Session Helper (session.ts)', () => {
  let store: Record<string, string> = {}

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => {
        store[key] = value.toString()
      }),
      removeItem: vi.fn((key) => {
        delete store[key]
      }),
      clear: vi.fn(() => {
        store = {}
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('debe guardar y obtener la sesión desde localStorage', () => {
    const mockSession = {
      token: 'jwt-token-valido',
      role: 'admin',
      user: { id: 'uuid-1', nombre: 'Test Admin', org_id: 'uuid-org', org_nombre: 'Org Test' },
    }

    setMiniappSession(mockSession)

    const retrieved = getMiniappSession()
    expect(retrieved).toEqual(mockSession)
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'plotify_miniapp_session',
      JSON.stringify(mockSession)
    )
  })

  it('debe limpiar la sesión de localStorage', () => {
    store['plotify_miniapp_session'] = 'some-session'
    clearMiniappSession()
    expect(getMiniappSession()).toBeNull()
    expect(localStorage.removeItem).toHaveBeenCalledWith('plotify_miniapp_session')
  })

  it('debe validar si el token de sesión ha expirado', () => {
    // Mock de JWT expirado (fecha exp de claims en el pasado)
    const now = Math.floor(Date.now() / 1000)
    const payloadExpirado = {
      sub: 'user-id',
      exp: now - 3600, // Expiró hace 1 hora
    }
    // Codificar payload mockeado (en base64) para simular estructura JWT
    const tokenExpirado = `header.${btoa(JSON.stringify(payloadExpirado))}.signature`

    // Mock de JWT vigente
    const payloadVigente = {
      sub: 'user-id',
      exp: now + 3600, // Expira en 1 hora
    }
    const tokenVigente = `header.${btoa(JSON.stringify(payloadVigente))}.signature`

    expect(isSessionExpired(tokenExpirado)).toBe(true)
    expect(isSessionExpired(tokenVigente)).toBe(false)
  })

  it('debe retornar true (expirado) para tokens con formato inválido', () => {
    expect(isSessionExpired('token-invalido-sin-puntos')).toBe(true)
    expect(isSessionExpired(null)).toBe(true)
  })
})
