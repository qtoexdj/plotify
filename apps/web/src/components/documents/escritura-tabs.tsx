import Link from 'next/link'
import { cn } from '@/lib/utils'

export type EscrituraTabKey = 'mesa' | 'historial' | 'plantillas'

export const ESCRITURA_TABS: { key: EscrituraTabKey; title: string; href: string }[] = [
  { key: 'mesa', title: 'Mesa', href: '/documentos' },
  { key: 'historial', title: 'Historial', href: '/documentos/historial' },
  { key: 'plantillas', title: 'Plantillas', href: '/documentos/plantillas' },
]

export function EscrituraTabs({ active }: { active: EscrituraTabKey }) {
  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="Secciones de Escrituras">
      {ESCRITURA_TABS.map((tab) => (
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
