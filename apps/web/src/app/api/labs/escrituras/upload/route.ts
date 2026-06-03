import { createHash, randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { fileTypeFromBuffer } from 'file-type'
import { createServiceClient } from '@/lib/supabase/server'
import { requireSuperAdminRoute } from '@/lib/auth/require-super-admin-route'
import { logger } from '@/lib/logger'
import {
  LAB_ESCRITURAS_BUCKET,
  LAB_SUPPORTED_UPLOADS,
  isLabDocumentType,
  type LabSourceFormat,
  sanitizeFileName,
} from '@/lib/labs/escrituras'
import { disabledEscriturasLabResponse, isEscriturasLabEnabled } from '@/lib/labs/escrituras.guard'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_TOTAL_FILE_SIZE = 250 * 1024 * 1024

type UploadFailure = {
  filename: string
  error: string
}

type ValidatedUpload = {
  file: File
  safeName: string
  buffer: Buffer
  sourceFormat: LabSourceFormat
  contentType: string
  sha256: string
}

function extensionFor(fileName: string) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match?.[1]?.toLowerCase() ?? ''
}

function hasDocSignature(buffer: Buffer) {
  const docMagic = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  return buffer.subarray(0, docMagic.length).equals(docMagic)
}

function hasRtfSignature(buffer: Buffer) {
  return buffer.subarray(0, 5).toString('ascii') === '{\\rtf'
}

export async function validateLabUploadFile(file: File): Promise<ValidatedUpload | UploadFailure> {
  const safeName = sanitizeFileName(file.name) || 'document'

  if (file.size > MAX_FILE_SIZE) {
    return { filename: safeName, error: 'El archivo excede el limite de 50MB.' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const extension = extensionFor(safeName)
  const typeInfo = await fileTypeFromBuffer(buffer.subarray(0, 8192))

  let sourceFormat: LabSourceFormat | null = null
  if (extension === 'pdf' && typeInfo?.mime === 'application/pdf') {
    sourceFormat = 'pdf'
  } else if (
    extension === 'docx' &&
    typeInfo?.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    sourceFormat = 'docx'
  } else if (extension === 'doc' && hasDocSignature(buffer)) {
    sourceFormat = 'doc'
  } else if (extension === 'rtf' && hasRtfSignature(buffer)) {
    sourceFormat = 'rtf'
  }

  if (!sourceFormat) {
    return { filename: safeName, error: 'Solo se permiten PDF, DOCX, DOC o RTF validos.' }
  }

  return {
    file,
    safeName,
    buffer,
    sourceFormat,
    contentType: LAB_SUPPORTED_UPLOADS[sourceFormat].contentType,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }
}

export async function POST(request: NextRequest) {
  if (!isEscriturasLabEnabled()) return disabledEscriturasLabResponse()

  const auth = await requireSuperAdminRoute(request)
  if ('response' in auth) return auth.response

  try {
    const contentLength = request.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_TOTAL_FILE_SIZE) {
      return NextResponse.json(
        { error: 'La carga excede el limite total de 250MB.' },
        { status: 413 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files').filter((value): value is File => value instanceof File)
    const legacyFile = formData.get('file')
    if (legacyFile instanceof File) files.push(legacyFile)

    const rawDocumentType = formData.get('documentType') as string | null

    if (files.length === 0 || !rawDocumentType) {
      return NextResponse.json(
        { error: 'Datos incompletos. Se requiere al menos un documento y documentType.' },
        { status: 400 }
      )
    }

    if (!isLabDocumentType(rawDocumentType)) {
      return NextResponse.json({ error: 'Tipo documental no permitido.' }, { status: 400 })
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_TOTAL_FILE_SIZE) {
      return NextResponse.json(
        { error: 'La carga excede el limite total de 250MB.' },
        { status: 413 }
      )
    }

    const service = createServiceClient()
    const lab = service.schema('lab_escrituras')
    const prevalidated = await Promise.all(files.map((file) => validateLabUploadFile(file)))
    const validUploads = prevalidated.filter(
      (result): result is ValidatedUpload => 'buffer' in result
    )
    const initialFailures = prevalidated.filter(
      (result): result is UploadFailure => !('buffer' in result)
    )

    if (validUploads.length === 0) {
      return NextResponse.json(
        { error: 'No se pudo subir ningun documento valido.', failures: initialFailures },
        { status: 400 }
      )
    }

    const runId = randomUUID()

    const { error: runError } = await lab.from('analysis_runs').insert({
      id: runId,
      run_type: 'upload',
      status: 'pending',
      parameters: { source: 'super-admin-upload', file_count: files.length },
      created_by: auth.user.id,
    })

    if (runError) {
      logger.error({ runError }, 'lab_escrituras_create_run_failed')
      return NextResponse.json(
        {
          error:
            'No se pudo registrar el run del laboratorio. Revisa bootstrap SQL y exposicion del schema lab_escrituras.',
        },
        { status: 500 }
      )
    }

    const documents = []
    const failures: UploadFailure[] = [...initialFailures]

    for (const upload of validUploads) {
      const documentId = randomUUID()
      const storagePath = `documents/${runId}/${documentId}/original.${upload.sourceFormat}`

      const { error: uploadError } = await service.storage
        .from(LAB_ESCRITURAS_BUCKET)
        .upload(storagePath, upload.buffer, {
          contentType: upload.contentType,
          upsert: false,
        })

      if (uploadError) {
        logger.error({ uploadError }, 'lab_escrituras_upload_failed')
        failures.push({
          filename: upload.safeName,
          error: 'No se pudo subir al bucket del laboratorio.',
        })
        continue
      }

      const { data: document, error: documentError } = await lab
        .from('source_documents')
        .insert({
          id: documentId,
          run_id: runId,
          original_filename: upload.safeName,
          document_type: rawDocumentType,
          source_format: upload.sourceFormat,
          content_type: upload.contentType,
          size_bytes: upload.file.size,
          sha256: upload.sha256,
          storage_bucket: LAB_ESCRITURAS_BUCKET,
          storage_path: storagePath,
          processing_status: 'uploaded',
          uploaded_by: auth.user.id,
          layout_metadata: {
            upload: {
              source_format: upload.sourceFormat,
              content_type: upload.contentType,
              original_extension: extensionFor(upload.safeName),
            },
          },
        })
        .select()
        .single()

      if (documentError) {
        logger.error({ documentError }, 'lab_escrituras_create_document_failed')
        await service.storage.from(LAB_ESCRITURAS_BUCKET).remove([storagePath])
        failures.push({ filename: upload.safeName, error: 'No se pudo registrar el documento.' })
        continue
      }

      documents.push(document)
    }

    if (documents.length === 0) {
      return NextResponse.json(
        { error: 'No se pudo subir ningun documento.', failures },
        { status: 400 }
      )
    }

    return NextResponse.json({ documents, failures })
  } catch (error) {
    logger.error({ error }, 'lab_escrituras_upload_unhandled')
    return NextResponse.json({ error: 'Error interno al subir documento.' }, { status: 500 })
  }
}
