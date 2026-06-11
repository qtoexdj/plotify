import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { FileAttachmentIcon, LayoutLeftIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { BentoGrid, BentoPanel } from '@/components/dashboard/bento-grid'

const ACCESOS = [
  {
    title: 'Plantillas',
    description: 'Crea y administra las plantillas de escrituras con sus artículos.',
    href: '/documentos/plantillas',
    icon: LayoutLeftIcon,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    title: 'Historial',
    description: 'Minutas DOCX generadas desde matrices aprobadas.',
    href: '/documentos/historial',
    icon: FileAttachmentIcon,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
] as const

export default function DocumentosPage() {
  return (
    <PageShell>
      <PageHeader
        title="Documentos Legales"
        description="Orquestador de escrituras y contratos para tus lotes."
      />

      {/* ── Acceso rápido ────────────────────────────────────────────── */}
      <BentoGrid>
        {ACCESOS.map((item) => (
          <Link key={item.href} href={item.href} className="group md:col-span-6 xl:col-span-4">
            <BentoPanel className="h-full transition-shadow hover:shadow-md cursor-pointer">
              <CardHeader className="gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.bg}`}>
                  <HugeiconsIcon icon={item.icon} className={`w-5 h-5 ${item.color}`} />
                </div>
                <div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription className="text-sm mt-0.5">{item.description}</CardDescription>
                </div>
              </CardHeader>
            </BentoPanel>
          </Link>
        ))}

        {/* ── Acción principal ─────────────────────────────────────────── */}
        <div className="xl:col-span-12 border border-border rounded-xl p-6 bg-card text-card-foreground flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-2">
          <div>
            <p className="font-semibold text-foreground">¿Necesitas componer una matriz?</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Abre el caso de escritura desde el Centro de Control Legal y revisa su matriz.
            </p>
          </div>
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline shrink-0"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
            Ir a Proyectos
          </Link>
        </div>
      </BentoGrid>
    </PageShell>
  )
}
