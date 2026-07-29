import { createRouteHandlerClient } from '@/lib/supabase/server'
import { getProjectsWithMetrics, createProject } from '@/lib/services/projects.service'
import { NextRequest } from 'next/server'
import { createProjectSchema } from '@/lib/validations/project.schema'
import { getActiveWorkspace } from '@/lib/services/workspace.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const projects = await getProjectsWithMetrics(user.id, supabase)

    // Obtener el rol del usuario en su organización activa para el frontend
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    return Response.json({
      projects,
      role: membership?.role || 'user',
    })
  } catch (error) {
    console.error('Error in GET /api/projects:', error)
    return Response.json({ error: 'Error al obtener proyectos' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = createProjectSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'INVALID_PROJECT' },
        { status: 400 }
      )
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
    if (!idempotencyKey)
      return Response.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 })
    const workspace = await getActiveWorkspace(user.id)
    if (!workspace || workspace.role !== 'admin')
      return Response.json({ error: 'WORKSPACE_FORBIDDEN' }, { status: 403 })
    const result = await createProject(
      parsed.data,
      user.id,
      workspace.organization.id,
      idempotencyKey
    )

    return Response.json({
      project: result.project,
      lots: result.lots,
      message: `Proyecto creado con ${result.lots.length} lotes`,
    })
  } catch (error) {
    console.error('Error in POST /api/projects:', error)
    const code = error instanceof Error ? error.message : 'PROJECT_CREATE_FAILED'
    return Response.json({ error: code }, { status: code === 'IDEMPOTENCY_CONFLICT' ? 409 : 500 })
  }
}
