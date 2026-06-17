import { PageHeader } from '@/components/dashboard/page-header'
import { PageShell } from '@/components/dashboard/page-shell'
import { MatrizBuilder } from '@/components/documents/matriz/matriz-builder'

type MatrizPageProps = {
  params: Promise<{ caseId: string }>
}

export default async function MatrizPage({ params }: MatrizPageProps) {
  const { caseId } = await params

  return (
    <PageShell>
      <PageHeader
        title="Creador de matriz"
        description="Compón la minuta desde el snapshot aprobado del caso y sus cláusulas versionadas."
      />
      <MatrizBuilder caseId={caseId} />
    </PageShell>
  )
}
