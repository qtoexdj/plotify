import Link from 'next/link'
import { cn } from '@/lib/utils'

export type AgenteTabKey = 'chat' | 'skills' | 'integraciones'

export const AGENTE_TABS: { key: AgenteTabKey; title: string; href: string }[] = [
  { key: 'chat', title: 'Chat', href: '/agente' },
  { key: 'skills', title: 'Skills', href: '/agente/skills' },
  { key: 'integraciones', title: 'Integraciones', href: '/agente/integrations' },
]

export function AgenteTabs({ active }: { active: AgenteTabKey }) {
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="Secciones del Agente">
      {AGENTE_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          role="tab"
          aria-selected={tab.key === active}
          className={cn(
            '-mb-px flex min-h-11 items-center border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            tab.key === active
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.title}
        </Link>
      ))}
    </div>
  )
}
