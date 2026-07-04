'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DashboardCircleIcon,
  Folder02Icon,
  File02Icon,
  UserGroupIcon,
  UserStar01Icon,
  AiChat01Icon,
  Settings01Icon,
  Sun01Icon,
  Moon01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

interface CommandPaletteContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const CommandPaletteContext = React.createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette() {
  const ctx = React.useContext(CommandPaletteContext)
  if (!ctx) {
    throw new Error('useCommandPalette debe usarse dentro de CommandPaletteProvider')
  }
  return ctx
}

/** Ítem "Buscar ⌘K" del sidebar — abre el command palette */
export function CommandPaletteTrigger() {
  const { setOpen } = useCommandPalette()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip="Buscar" onClick={() => setOpen(true)}>
        <HugeiconsIcon icon={Search01Icon} />
        <span>Buscar</span>
        <kbd className="ml-auto text-xs text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          ⌘K
        </kbd>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

const NAV_ITEMS = [
  { title: 'Panel', url: '/dashboard', icon: DashboardCircleIcon },
  { title: 'Proyectos', url: '/projects', icon: Folder02Icon },
  { title: 'Escrituras', url: '/documentos', icon: File02Icon },
  { title: 'Leads', url: '/clients', icon: UserGroupIcon },
  { title: 'Vendedores', url: '/vendors', icon: UserStar01Icon },
  { title: 'Agente', url: '/agente', icon: AiChat01Icon },
]

const SETTINGS_ITEMS = [
  { title: 'Perfil de usuario', url: '/settings/profile' },
  { title: 'Workspace', url: '/settings/workspace' },
]

interface ProjectResult {
  id: string
  name: string
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [projects, setProjects] = React.useState<ProjectResult[]>([])
  const loadedProjects = React.useRef(false)
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  React.useEffect(() => {
    if (!open || loadedProjects.current) return
    loadedProjects.current = true
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]))
  }, [open])

  const runCommand = React.useCallback((action: () => void) => {
    setOpen(false)
    action()
  }, [])

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar"
        description="Navega a cualquier sección, proyecto o acción"
      >
        <Command>
          <CommandInput placeholder="Buscar secciones, proyectos o acciones..." />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup heading="Navegación">
              {NAV_ITEMS.map((item) => (
                <CommandItem
                  key={item.url}
                  value={item.title}
                  onSelect={() => runCommand(() => router.push(item.url))}
                >
                  <HugeiconsIcon icon={item.icon} />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
              {SETTINGS_ITEMS.map((item) => (
                <CommandItem
                  key={item.url}
                  value={item.title}
                  onSelect={() => runCommand(() => router.push(item.url))}
                >
                  <HugeiconsIcon icon={Settings01Icon} />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {projects.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Proyectos">
                  {projects.map((project) => (
                    <CommandItem
                      key={project.id}
                      value={project.name}
                      onSelect={() => runCommand(() => router.push(`/projects/${project.id}`))}
                    >
                      <HugeiconsIcon icon={Folder02Icon} />
                      <span>{project.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            <CommandSeparator />
            <CommandGroup heading="Acciones">
              <CommandItem
                value="Cambiar tema"
                onSelect={() =>
                  runCommand(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))
                }
              >
                <HugeiconsIcon icon={resolvedTheme === 'dark' ? Sun01Icon : Moon01Icon} />
                <span>Cambiar tema</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </CommandPaletteContext.Provider>
  )
}
