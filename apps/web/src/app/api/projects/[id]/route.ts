import { createRouteHandlerClient } from '@/lib/supabase/server'
import {
  getProjectById,
  deleteProject,
  updateProject,
  ProjectHasDependenciesError,
  ProjectDeleteConfirmationError,
  ProjectNotFoundError,
} from '@/lib/services/projects.service'
import { getProjectVendors } from '@/lib/services/vendors.service'
import { NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { projectPatchSchema, projectDeleteSchema } from '@/lib/validations/project.schema'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const project = await getProjectById(id, user.id, supabase)

    if (!project) {
      return Response.json({ error: 'Proyecto no encontrado' }, { status: 404 })
    }

    const vendors = await getProjectVendors(id, supabase)

    return Response.json({
      project: {
        ...project,
        vendors,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/projects/[id]:', error)
    return Response.json({ error: 'Error al obtener proyecto' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = projectDeleteSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: 'Falta la confirmación para eliminar el proyecto.', code: 'CONFIRMATION_REQUIRED' },
        { status: 400 }
      )
    }

    const result = await deleteProject(id, user.id, {
      confirmedName: parsed.data.confirmedName,
      acknowledgedExport: parsed.data.acknowledgedExport,
    })
    revalidatePath('/projects')
    return Response.json({ message: 'Proyecto eliminado', ...result })
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return Response.json({ error: error.message, code: error.code }, { status: 404 })
    }
    if (error instanceof ProjectDeleteConfirmationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 })
    }
    if (error instanceof ProjectHasDependenciesError) {
      return Response.json({ error: error.message, code: error.code }, { status: 409 })
    }
    console.error('Error in DELETE /api/projects/[id]:', error)
    return Response.json({ error: 'Error al eliminar proyecto' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createRouteHandlerClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = projectPatchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: 'PROTECTED_PROJECT_FIELD' }, { status: 400 })
    const project = await updateProject(id, user.id, parsed.data)

    revalidatePath(`/projects/${id}`)
    return Response.json({ project })
  } catch (error) {
    console.error('Error in PATCH /api/projects/[id]:', error)
    return Response.json({ error: 'Error al actualizar proyecto' }, { status: 500 })
  }
}
