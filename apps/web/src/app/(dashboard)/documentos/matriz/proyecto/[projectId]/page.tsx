import { PageShell } from '@/components/dashboard/page-shell'
import { MesaEscritura } from '@/components/documents/mesa/mesa-escritura'

type ProyectoMatrizPageProps = {
  params: Promise<{ projectId: string }>
}

export default async function ProyectoMatrizPage({ params }: ProyectoMatrizPageProps) {
  const { projectId } = await params

  return (
    <PageShell className="max-w-[1500px]">
      <MesaEscritura projectId={projectId} />
    </PageShell>
  )
}
