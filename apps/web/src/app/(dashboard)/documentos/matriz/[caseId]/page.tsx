import { PageShell } from '@/components/dashboard/page-shell'
import { MesaEscritura } from '@/components/documents/mesa/mesa-escritura'

type MesaPageProps = {
  params: Promise<{ caseId: string }>
}

export default async function MesaPage({ params }: MesaPageProps) {
  const { caseId } = await params

  return (
    <PageShell className="max-w-[1500px]">
      <MesaEscritura caseId={caseId} />
    </PageShell>
  )
}
