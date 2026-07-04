import { AiChat01Icon, ZapIcon, DatabaseIcon, Message01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AgenteTabs } from '@/components/agente/agente-tabs'
import { PageHeader } from '@/components/dashboard/page-header'
import { PageShell } from '@/components/dashboard/page-shell'

export const dynamic = 'force-dynamic'

export default async function AgentePage() {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  if (isSuperAdmin) {
    redirect('/super-admin')
  }

  return (
    <PageShell>
      <PageHeader
        title="Agente"
        description="Automatiza respuestas, entrenamiento e integraciones desde un solo lugar."
      />
      <AgenteTabs active="chat" />
      <div className="relative overflow-hidden rounded-[2rem] bg-sidebar p-8 text-sidebar-foreground shadow-2xl md:p-12">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 h-96 w-96 rounded-full bg-primary/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-96 w-96 rounded-full bg-primary/10 blur-3xl"></div>

        <div className="relative z-10 flex flex-col items-center gap-10 md:flex-row">
          <div className="flex-1 space-y-6 text-center md:text-left">
            <div className="border-primary/30 bg-primary/20 text-sidebar-primary inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              <HugeiconsIcon icon={ZapIcon} size={16} />
              <span>Inteligencia Artificial Activa</span>
            </div>
            <h2 className="font-display text-4xl leading-[1.1] font-semibold tracking-tight md:text-6xl">
              Tu copiloto de ventas <span className="text-sidebar-primary">impulsado por IA</span>
            </h2>
            <p className="text-sidebar-foreground/70 max-w-xl text-lg leading-relaxed">
              Gestiona leads, automatiza respuestas y obtén insights valiosos de tus proyectos con
              el motor de inteligencia artificial de Plotify.
            </p>
            <div className="flex flex-wrap justify-center gap-4 pt-2 md:justify-start">
              <Button size="lg" className="px-8 shadow-lg" asChild>
                <Link href="/agente/integrations">Configurar Integraciones</Link>
              </Button>
            </div>
          </div>

          <div className="hidden w-full max-w-sm md:block">
            <div className="relative rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-md">
              <div className="bg-primary/15 flex aspect-square items-center justify-center rounded-2xl border border-white/5">
                <HugeiconsIcon
                  icon={AiChat01Icon}
                  size={120}
                  className="text-sidebar-primary animate-pulse"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Funcionalidades */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="group overflow-hidden shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
          <CardHeader>
            <div className="bg-info/15 text-info mb-2 w-fit rounded-xl p-3">
              <HugeiconsIcon icon={ZapIcon} size={28} />
            </div>
            <CardTitle className="text-xl">Integraciones</CardTitle>
            <CardDescription className="text-info/80 font-medium">
              Telegram, WhatsApp y más.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Conecta tu agente con canales de mensajería para recibir notificaciones y gestionar
              leads al instante.
            </p>
            <Button
              variant="outline"
              className="border-info/30 text-info hover:bg-info/10 group-hover:bg-info group-hover:text-info-foreground w-full transition-colors"
              asChild
            >
              <Link href="/agente/integrations">Gestionar Integraciones</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="group overflow-hidden shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
          <CardHeader>
            <div className="bg-success/15 text-success mb-2 w-fit rounded-xl p-3">
              <HugeiconsIcon icon={Message01Icon} size={28} />
            </div>
            <CardTitle className="text-xl">Entrenamiento</CardTitle>
            <CardDescription className="text-success/80 font-medium">
              Personaliza el conocimiento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Sube documentos y reglas de negocio para que tu IA responda exactamente como tú lo
              harías.
            </p>
            <Button
              variant="outline"
              className="border-success/30 text-success hover:bg-success/10 group-hover:bg-success group-hover:text-success-foreground w-full transition-colors"
            >
              Configurar Conocimiento
            </Button>
          </CardContent>
        </Card>

        <Card className="group overflow-hidden shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
          <CardHeader>
            <div className="bg-common-area/15 text-common-area mb-2 w-fit rounded-xl p-3">
              <HugeiconsIcon icon={DatabaseIcon} size={28} />
            </div>
            <CardTitle className="text-xl">Análisis AI</CardTitle>
            <CardDescription className="text-common-area/80 font-medium">
              Insights con lenguaje natural.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Pregúntale a tu Agente sobre disponibilidad, precios y tendencias de ventas de tus
              proyectos.
            </p>
            <Button
              variant="outline"
              className="border-common-area/30 text-common-area hover:bg-common-area/10 group-hover:bg-common-area group-hover:text-common-area-foreground w-full transition-colors"
            >
              Explorar Datos
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
