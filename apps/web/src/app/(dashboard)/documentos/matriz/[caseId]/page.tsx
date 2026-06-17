import { PageHeader } from '@/components/dashboard/page-header'
import { PageShell } from '@/components/dashboard/page-shell'
import { MesaEscritura } from '@/components/documents/mesa/mesa-escritura'

type MesaPageProps = {
  params: Promise<{ caseId: string }>
}

export default async function MesaPage({ params }: MesaPageProps) {
  const { caseId } = await params

  return (
    <PageShell>
      <PageHeader
        title="Mesa de escritura"
        description="Revisa la escritura del caso con sus datos, su respaldo y sus pendientes."
      />
      <MesaEscritura caseId={caseId} />
    </PageShell>
  )
}
