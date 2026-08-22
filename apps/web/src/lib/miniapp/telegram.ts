/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useRef, useState } from 'react'

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

export interface TelegramWebApp {
  ready(): void
  expand(): void
  close(): void
  initData: string
  initDataUnsafe: {
    query_id?: string
    user?: TelegramUser
    auth_date?: number
    hash?: string
    start_param?: string
  }
  themeParams: {
    bg_color?: string
    text_color?: string
    hint_color?: string
    link_color?: string
    button_color?: string
    button_text_color?: string
    secondary_bg_color?: string
  }
  MainButton: {
    text: string
    color: string
    textColor: string
    isVisible: boolean
    isActive: boolean
    setText(text: string): any
    show(): any
    hide(): any
    enable(): any
    disable(): any
    onClick(callback: () => void): any
    offClick(callback: () => void): any
  }
  BackButton: {
    isVisible: boolean
    show(): any
    hide(): any
    onClick(callback: () => void): any
    offClick(callback: () => void): any
  }
  onEvent(eventType: 'themeChanged' | 'backButtonClicked', callback: () => void): void
  offEvent(eventType: 'themeChanged' | 'backButtonClicked', callback: () => void): void
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
  enableClosingConfirmation(): void
  disableClosingConfirmation(): void
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp
    }
  }
}

export function useTelegram() {
  const [webApp] = useState<TelegramWebApp | null>(() => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      return window.Telegram.WebApp
    }
    return null
  })

  const [isAvailable] = useState<boolean>(() => {
    return typeof window !== 'undefined' && !!window.Telegram?.WebApp
  })

  const [themeParams, setThemeParams] = useState<TelegramWebApp['themeParams']>({})

  useEffect(() => {
    if (!webApp) return

    const applyTheme = () => {
      const theme = webApp.themeParams
      setThemeParams({ ...theme })
      const root = document.documentElement.style
      if (theme.bg_color) root.setProperty('--tg-theme-bg-color', theme.bg_color)
      if (theme.text_color) root.setProperty('--tg-theme-text-color', theme.text_color)
      if (theme.button_color) root.setProperty('--tg-theme-button-color', theme.button_color)
      if (theme.button_text_color)
        root.setProperty('--tg-theme-button-text-color', theme.button_text_color)
    }

    webApp.ready()
    webApp.expand()
    applyTheme()
    webApp.onEvent('themeChanged', applyTheme)
    return () => webApp.offEvent('themeChanged', applyTheme)
  }, [webApp])

  const user = webApp?.initDataUnsafe?.user || null
  const initData = webApp?.initData || ''

  const ready = () => {
    webApp?.ready()
  }

  const expand = () => {
    webApp?.expand()
  }

  const close = () => {
    webApp?.close()
  }

  const startParam = webApp?.initDataUnsafe?.start_param || null

  const haptic = {
    impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
      try {
        webApp?.HapticFeedback?.impactOccurred(style)
      } catch {
        // safe fallback
      }
    },
    notification: (type: 'error' | 'success' | 'warning') => {
      try {
        webApp?.HapticFeedback?.notificationOccurred(type)
      } catch {
        // safe fallback
      }
    },
    selection: () => {
      try {
        webApp?.HapticFeedback?.selectionChanged()
      } catch {
        // safe fallback
      }
    },
  }

  return {
    webApp,
    isAvailable,
    user,
    initData,
    startParam,
    ready,
    expand,
    close,
    themeParams,
    haptic,
  }
}

export function useTelegramBackButton(onBack: () => void, enabled = true) {
  const { webApp } = useTelegram()
  const callbackRef = useRef(onBack)

  useEffect(() => {
    callbackRef.current = onBack
  }, [onBack])

  useEffect(() => {
    if (!webApp || !enabled) return
    const handleBack = () => callbackRef.current()
    webApp.BackButton.show()
    webApp.BackButton.onClick(handleBack)
    return () => {
      webApp.BackButton.offClick(handleBack)
      webApp.BackButton.hide()
    }
  }, [webApp, enabled])
}
