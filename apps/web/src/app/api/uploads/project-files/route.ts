import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fileTypeFromBuffer } from 'file-type'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_DOC_TYPES = ['application/pdf']
const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'El archivo excede el límite de 15MB' }, { status: 413 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const projectId = formData.get('projectId') as string | null
    const type = formData.get('type') as string | null

    if (!file || !projectId || !type) {
      return NextResponse.json(
        { error: 'Datos incompletos. Se requiere file, projectId y type.' },
        { status: 400 }
      )
    }

    // Validación Server-Side con Magic Bytes
    const chunk = file.slice(0, 4096)
    const headerBuffer = Buffer.from(await chunk.arrayBuffer())
    const typeInfo = await fileTypeFromBuffer(headerBuffer)

    if (!typeInfo) {
      logger.warn({ fileName: file.name }, 'upload_invalid_file_signature')
      return NextResponse.json(
        { error: 'El archivo no tiene un formato reconocido.' },
        { status: 400 }
      )
    }

    // Validación por type
    if (type === 'images') {
      if (!ALLOWED_IMAGE_TYPES.includes(typeInfo.mime)) {
        return NextResponse.json(
          { error: 'Formato de imagen inválido. Solo se permiten JPEG, PNG o WEBP.' },
          { status: 400 }
        )
      }
    } else if (type.startsWith('doc_')) {
      if (!ALLOWED_DOC_TYPES.includes(typeInfo.mime)) {
        return NextResponse.json(
          { error: 'Formato de documento inválido. Solo se permiten PDFs.' },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json({ error: 'Tipo de carga no reconocido.' }, { status: 400 })
    }

    // Proceder con la subida a Supabase
    const supabase = await createClient()
    const fileExt = file.name.split('.').pop()
    const fileName = `${type}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `${projectId}/docs/${fileName}`

    const { data, error } = await supabase.storage.from('project-files').upload(filePath, file)

    if (error) {
      logger.error({ projectId, error }, 'upload_supabase_storage_error')
      throw new Error('Error al subir a Storage')
    }

    // Actualizar la base de datos
    // Primero obtener el proyecto
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      throw fetchError || new Error('No se encontró el proyecto')
    }

    const updates =
      type === 'images' ? { images: [...(project.images || []), data.path] } : { [type]: data.path }

    const { data: updatedProject, error: dbError } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single()

    if (dbError) {
      logger.error({ projectId, error: dbError }, 'upload_db_update_error')
      throw dbError
    }

    return NextResponse.json({
      message: 'Archivo subido y validado exitosamente',
      project: updatedProject,
      path: data.path,
    })
  } catch (error) {
    logger.error({ error }, 'upload_project_file_error')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno al procesar archivo' },
      { status: 500 }
    )
  }
}
