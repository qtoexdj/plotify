import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listTemplates } from '@/lib/services/documents.service'
import { GenerationWizard } from '@/components/dashboard/documents/generation-wizard'

export default async function GenerarDocumentoPage({
  params,
}: {
  params: Promise<{ lotId: string }>
}) {
  const { lotId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .single()

  if (!member) redirect('/')

  const { data: lotRaw } = await supabase
    .from('lots')
    .select(
      `
      id,
      numero_lote,
      m2,
      area_official_m2,
      servidumbre_m2,
      servidumbre_ancho_m,
      boundaries_official,
      servidumbre_analysis,
      precio,
      lot_records (
        cliente_nombre,
        cliente_run,
        cliente_direccion,
        cliente_estado_civil,
        cliente_ocupacion
      ),
      projects (
        name,
        commune,
        region,
        road_width_m
      )
    `
    )
    .eq('id', lotId)
    .single()

  if (!lotRaw) redirect('/projects')

  // Supabase returns projects as array for 1:many — normalise to single object
  const projectsRaw = lotRaw.projects as unknown
  const project = Array.isArray(projectsRaw) ? (projectsRaw[0] ?? null) : projectsRaw

  const lot = { ...lotRaw, projects: project } as Parameters<typeof GenerationWizard>[0]['lot']

  const templates = await listTemplates(member.organization_id)

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generar Documento</h1>
        <p className="text-muted-foreground">
          Lote {lot.numero_lote}
          {lot.projects?.name ? ` — ${lot.projects.name}` : ''}
        </p>
      </div>
      <GenerationWizard lot={lot} templates={templates} organizationId={member.organization_id} />
    </div>
  )
}
