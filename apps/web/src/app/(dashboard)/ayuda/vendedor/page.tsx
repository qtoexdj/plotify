import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, FileText, Landmark, ShieldCheck } from 'lucide-react'

export default function SafeDocsPage() {
  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-slate-100 flex items-center gap-2">
          <BookOpen className="h-8 w-8 text-primary" />
          Centro de Ayuda y Operación para Vendedores
        </h1>
        <p className="text-gray-500 dark:text-slate-400">
          Encuentra manuales, directrices de cumplimiento legal y flujos operativos oficiales de
          Plotify.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-muted bg-muted/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Operaciones de Venta y Reserva
            </CardTitle>
            <CardDescription>
              Directrices paso a paso para el proceso de ingreso en la plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Como vendedor asignado, cuentas con acceso a la gestión de lotes y reservas en tiempo
              real. Asegúrate siempre de:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 font-medium">
              <li>Verificar la disponibilidad del lote antes de prometer la reserva.</li>
              <li>Ingresar el RUN y datos del cliente exactamente como figuran en la cédula.</li>
              <li>Confirmar el monto pactado del lote antes de enviar la solicitud.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-muted bg-muted/40 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Landmark className="h-5 w-5 text-blue-600" />
              Aspectos Legales y Firmas
            </CardTitle>
            <CardDescription>Cumplimiento normativo y coordinación de notarías.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Todas las promesas y escrituras de venta deben cumplir rigurosamente con los deslindes
              y cabezas calculadas de forma geométrica por el sistema.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 font-medium">
              <li>
                El borrador legal se genera de forma 100% automática tras la aprobación del
                administrador.
              </li>
              <li>
                Las firmas notariales se coordinan de forma preestablecida según el proyecto
                asignado.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-muted bg-muted/40 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Descarga de Plantillas Oficiales
          </CardTitle>
          <CardDescription>
            Recursos listos para su uso y entrega a clientes finales.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" className="h-9 px-4 text-xs font-semibold rounded-lg shadow-sm">
            Ficha de Reserva estándar (PDF)
          </Button>
          <Button variant="outline" className="h-9 px-4 text-xs font-semibold rounded-lg shadow-sm">
            Manual de Preguntas Frecuentes v2.1
          </Button>
          <Button variant="outline" className="h-9 px-4 text-xs font-semibold rounded-lg shadow-sm">
            Checklist de Recopilación de Antecedentes
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
