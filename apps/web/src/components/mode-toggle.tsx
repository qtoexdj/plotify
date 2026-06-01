'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Switch } from '@/components/ui/switch'
import { HugeiconsIcon } from '@hugeicons/react'
import { Sun01Icon, Moon01Icon } from '@hugeicons/core-free-icons'

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Prevent hydration mismatch by rendering a placeholder until mounted
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-muted/40 border border-sidebar-border h-9 w-20 justify-center animate-pulse" />
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-muted/40 hover:bg-muted/60 transition-all duration-300 border border-sidebar-border/80 shadow-xs h-9">
      <HugeiconsIcon
        icon={Sun01Icon}
        className={`h-4 w-4 transition-all duration-300 ${
          !isDark
            ? 'text-amber-500 scale-110 drop-shadow-[0_0_4px_rgba(245,158,11,0.2)]'
            : 'text-muted-foreground/50'
        }`}
      />
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        aria-label="Cambiar tema"
        size="sm"
      />
      <HugeiconsIcon
        icon={Moon01Icon}
        className={`h-4 w-4 transition-all duration-300 ${
          isDark
            ? 'text-indigo-400 scale-110 drop-shadow-[0_0_4px_rgba(129,140,248,0.2)]'
            : 'text-muted-foreground/50'
        }`}
      />
    </div>
  )
}
