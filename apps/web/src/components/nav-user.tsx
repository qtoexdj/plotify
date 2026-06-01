'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Switch } from '@/components/ui/switch'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon,
  Notification03Icon,
  ArrowUpDownIcon,
  CreditCardIcon,
  Logout01Icon,
  SparklesIcon,
  Sun01Icon,
  Moon01Icon,
} from '@hugeicons/core-free-icons'
import { useRouter } from 'next/navigation'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/client'

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const isDark = resolvedTheme === 'dark'
  const { isMobile, state } = useSidebar()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <SidebarMenu>
      {mounted &&
        (state === 'expanded' ? (
          <SidebarMenuItem className="px-3 py-2 mb-2 flex items-center justify-between rounded-xl bg-muted/30 border border-sidebar-border/40 transition-all duration-300 hover:bg-muted/50 hover:border-sidebar-border/60">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={isDark ? Moon01Icon : Sun01Icon}
                className={`h-4 w-4 transition-all duration-300 ${
                  isDark ? 'text-indigo-400 scale-105' : 'text-amber-500 scale-105'
                }`}
              />
              <span className="text-xs font-semibold text-muted-foreground">
                Tema {isDark ? 'Oscuro' : 'Claro'}
              </span>
            </div>
            <Switch
              checked={isDark}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              size="sm"
            />
          </SidebarMenuItem>
        ) : (
          <SidebarMenuItem className="flex justify-center mb-2">
            <SidebarMenuButton
              size="lg"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              tooltip={isDark ? 'Modo Claro' : 'Modo Oscuro'}
              className="size-8! p-2! rounded-lg border border-sidebar-border/60 hover:bg-muted/50 transition-all duration-300 flex items-center justify-center"
            >
              <HugeiconsIcon
                icon={isDark ? Moon01Icon : Sun01Icon}
                className={`h-4 w-4 transition-all duration-300 rotate-0 scale-100 hover:scale-110 active:scale-95 ${
                  isDark ? 'text-indigo-400' : 'text-amber-500'
                }`}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}

      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-12 border border-transparent hover:border-sidebar-border/40 hover:bg-muted/40 hover:shadow-xs transition-all duration-300 data-[state=open]:bg-muted/60 data-[state=open]:border-sidebar-border/60"
            >
              <Avatar className="h-8 w-8 rounded-lg border border-sidebar-border/80 shadow-xs shrink-0">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-foreground tracking-tight">
                  {user.name}
                </span>
                <span className="truncate text-xs text-muted-foreground/80">{user.email}</span>
              </div>
              <HugeiconsIcon
                icon={ArrowUpDownIcon}
                className="ml-auto size-4 text-muted-foreground/60 transition-colors"
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl p-1 shadow-md border-sidebar-border/60 bg-popover"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg border border-sidebar-border/80 shadow-xs">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-foreground">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground/80">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-sidebar-border/40" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="flex items-center justify-between pointer-events-auto"
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={isDark ? Moon01Icon : Sun01Icon}
                    className="h-4 w-4 text-muted-foreground"
                  />
                  <span className="text-sm font-medium">Tema {isDark ? 'Oscuro' : 'Claro'}</span>
                </div>
                <Switch
                  checked={isDark}
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                  size="sm"
                />
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-sidebar-border/40" />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <HugeiconsIcon icon={SparklesIcon} />
                Actualizar plan
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-sidebar-border/40" />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <HugeiconsIcon icon={Tick02Icon} />
                Mi cuenta
              </DropdownMenuItem>
              <DropdownMenuItem>
                <HugeiconsIcon icon={CreditCardIcon} />
                Facturación
              </DropdownMenuItem>
              <DropdownMenuItem>
                <HugeiconsIcon icon={Notification03Icon} />
                Notificaciones
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-sidebar-border/40" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <HugeiconsIcon icon={Logout01Icon} />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
