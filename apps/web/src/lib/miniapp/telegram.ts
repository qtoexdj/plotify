/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useState } from 'react'

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

  useEffect(() => {
    if (webApp) {
      webApp.ready()
    }
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

  return {
    webApp,
    isAvailable,
    user,
    initData,
    startParam,
    ready,
    expand,
    close,
  }
}
