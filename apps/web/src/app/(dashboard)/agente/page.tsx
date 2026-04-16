import { AiChat01Icon, ZapIcon, DatabaseIcon, Message01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getUserWithSuperAdmin } from "@/lib/auth/super-admin"
import { redirect } from "next/navigation"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function AgentePage() {
  const { user, isSuperAdmin } = await getUserWithSuperAdmin()

  if (!user) {
    redirect("/auth/login")
  }

  if (isSuperAdmin) {
    redirect("/super-admin")
  }

  return (
    <div className="p-6 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero Section Premium */}
      <div className="relative overflow-hidden rounded-[2rem] bg-linear-to-br from-slate-900 via-blue-950 to-slate-900 p-8 md:p-12 text-white shadow-2xl">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 space-y-6 text-center md:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-4 py-1.5 text-sm font-medium text-blue-300 backdrop-blur-sm border border-blue-500/30">
              <HugeiconsIcon icon={ZapIcon} size={16} />
              <span>Inteligencia Artificial Activa</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.1]">
              Tu copiloto de ventas <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-indigo-300">impulsado por IA</span>
            </h1>
            <p className="max-w-xl text-lg text-slate-300 leading-relaxed">
              Gestiona leads, automatiza respuestas y obtén insights valiosos de tus proyectos con el motor de inteligencia artificial de Plotify.
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-2">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 shadow-lg shadow-blue-600/30 transition-all hover:scale-105" asChild>
                <Link href="/agente/integrations">
                  Configurar Integraciones
                </Link>
              </Button>
            </div>
          </div>
          
          <div className="hidden md:block w-full max-w-sm">
            <div className="relative rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-md shadow-2xl">
              <div className="flex aspect-square items-center justify-center rounded-2xl bg-linear-to-br from-blue-600/20 to-indigo-600/20 border border-white/5">
                <HugeiconsIcon icon={AiChat01Icon} size={120} className="text-blue-400 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Funcionalidades */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="group border-none bg-linear-to-br from-blue-50 to-white dark:from-slate-900 dark:to-slate-950 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 border border-blue-100 dark:border-slate-800 overflow-hidden">
          <CardHeader>
            <div className="p-3 w-fit rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 mb-2">
                <HugeiconsIcon icon={ZapIcon} size={28} />
            </div>
            <CardTitle className="text-xl">Integraciones</CardTitle>
            <CardDescription className="text-blue-600/70 dark:text-blue-400/70 font-medium">Telegram, WhatsApp y más.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
               Conecta tu agente con canales de mensajería para recibir notificaciones y gestionar leads al instante.
            </p>
            <Button variant="outline" className="w-full border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-slate-800 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors" asChild>
              <Link href="/agente/integrations">
                Gestionar Integraciones
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="group border-none bg-linear-to-br from-indigo-50 to-white dark:from-slate-900 dark:to-slate-950 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 border border-indigo-100 dark:border-slate-800 overflow-hidden">
          <CardHeader>
            <div className="p-3 w-fit rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 mb-2">
                <HugeiconsIcon icon={Message01Icon} size={28} />
            </div>
            <CardTitle className="text-xl">Entrenamiento</CardTitle>
            <CardDescription className="text-indigo-600/70 dark:text-indigo-400/70 font-medium">Personaliza el conocimiento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
               Sube documentos y reglas de negocio para que tu IA responda exactamente como tú lo harías.
            </p>
            <Button variant="outline" className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-slate-800 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              Configurar Conocimiento
            </Button>
          </CardContent>
        </Card>

        <Card className="group border-none bg-linear-to-br from-purple-50 to-white dark:from-slate-900 dark:to-slate-950 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 border border-purple-100 dark:border-slate-800 overflow-hidden">
          <CardHeader>
            <div className="p-3 w-fit rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 mb-2">
                <HugeiconsIcon icon={DatabaseIcon} size={28} />
            </div>
            <CardTitle className="text-xl">Análisis AI</CardTitle>
            <CardDescription className="text-purple-600/70 dark:text-purple-400/70 font-medium">Insights con lenguaje natural.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
               Pregúntale a tu Agente sobre disponibilidad, precios y tendencias de ventas de tus proyectos.
            </p>
            <Button variant="outline" className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-slate-800 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              Explorar Datos
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
