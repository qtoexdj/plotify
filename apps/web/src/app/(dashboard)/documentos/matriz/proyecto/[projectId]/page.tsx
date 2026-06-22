import { PageHeader } from '@/components/dashboard/page-header'
import { PageShell } from '@/components/dashboard/page-shell'
import { MesaEscritura } from '@/components/documents/mesa/mesa-escritura'

type ProyectoMatrizPageProps = {
  params: Promise<{ projectId: string }>
}

export default async function ProyectoMatrizPage({ params }: ProyectoMatrizPageProps) {
  const { projectId } = await params

  return (
    <PageShell>
      <PageHeader
        title="Mesa de escritura"
        description="Matriz del proyecto con los datos revisados y los datos de venta pendientes."
      />
      <MesaEscritura projectId={projectId} />
    </PageShell>
  )
}
