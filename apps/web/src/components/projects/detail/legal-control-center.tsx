'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type {
  LegalDocument,
  LegalRoleMatchesResponse,
} from '@/lib/legal/variable-resolution-types'
import { LegalDocumentStatusPanel } from '@/components/projects/legal/legal-document-status-panel'
import { EscrituraReadinessPanel } from '@/components/projects/legal/escritura-readiness-panel'
import { TitleCasePanel } from '@/components/projects/legal/title-case-panel'
import { VariableMatrix } from '@/components/projects/legal/variable-matrix/variable-matrix'

/**
 * SDD 013 US4 — Centro de Control Legal unificado. La matriz de variables por
 * productor (`VariableMatrix`) es la superficie principal; los antiguos paneles
 * a medida (SAG, Plano, Roles SII) se reemplazaron por completo (su detalle y
 * el override por lote viven ahora dentro de la matriz). Conserva el estado de
 * documentos y la preparacion como contexto, y enlaza a la matriz de escritura.
 */

interface LegalControlCenterProps {
  projectId: string
  projectName: string
}

interface LegalDocumentsPayload {
  documents?: LegalDocument[]
}

export function LegalControlCenter({ projectId, projectName }: LegalControlCenterProps) {
  const [documents, setDocuments] = useState<LegalDocument[]>([])
  const [activeLotId, setActiveLotId] = useState('')
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const [documentsError, setDocumentsError] = useState<string | null>(null)

  const loadDocuments = useCallback(async () => {
    setIsLoadingDocuments(true)
    setDocumentsError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/legal-documents`)
      const payload = (await response.json()) as LegalDocumentsPayload & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Error al cargar documentos legales')
      setDocuments(payload.documents ?? [])
    } catch (error) {
      setDocumentsError(
        error instanceof Error ? error.message : 'Error al cargar documentos legales'
      )
    } finally {
      setIsLoadingDocuments(false)
    }
  }, [projectId])

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      try {
        const [documentsResponse, rolesResponse] = await Promise.all([
          fetch(`/api/projects/${projectId}/legal-documents`),
          fetch(`/api/projects/${projectId}/legal-roles`),
        ])
        const documentsPayload = (await documentsResponse.json()) as LegalDocumentsPayload & {
          error?: string
        }
        if (cancelled) return

        if (!documentsResponse.ok) {
          setDocumentsError(documentsPayload.error || 'Error al cargar documentos legales')
        } else {
          setDocuments(documentsPayload.documents ?? [])
          setDocumentsError(null)
        }

        if (rolesResponse.ok) {
          const rolesPayload = (await rolesResponse.json()) as LegalRoleMatchesResponse
          if (!cancelled) setActiveLotId(rolesPayload.lots?.[0]?.lot_id ?? '')
        }
      } catch (error) {
        if (!cancelled) {
          setDocumentsError(
            error instanceof Error ? error.message : 'Error al cargar datos legales'
          )
        }
      } finally {
        if (!cancelled) setIsLoadingDocuments(false)
      }
    }

    loadInitialData()

    return () => {
      cancelled = true
    }
  }, [projectId])

  const queueDocumentExtraction = async (document: { id: string }) => {
    const response = await fetch(`/api/projects/${projectId}/legal-documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legal_document_id: document.id }),
    })
    const result = (await response.json()) as { error?: string }
    if (!response.ok) {
      throw new Error(result.error || 'Error al reintentar extracción legal')
    }
  }

  const retryDocumentExtraction = async (document: { id: string }) => {
    try {
      await queueDocumentExtraction(document)
      toast.success('Extracción legal reencolada')
      await loadDocuments()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Error al reintentar extracción legal'
      )
    }
  }

  return (
    <section id="variables-legales" className="space-y-6" aria-label="Centro de Control Legal">
      <div className="flex flex-col gap-2 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Centro de Control Legal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Variables, evidencia y brechas de escritura para {projectName}.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" asChild className="self-start md:self-auto">
          <Link href={`/documentos/matriz/proyecto/${projectId}`}>
            <ExternalLink className="size-4" aria-hidden />
            Ver matriz de escritura
          </Link>
        </Button>
      </div>

      <VariableMatrix projectId={projectId} projectName={projectName} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-4">
          <LegalDocumentStatusPanel
            documents={documents}
            isLoading={isLoadingDocuments}
            error={documentsError}
            onRetryDocument={retryDocumentExtraction}
          />
          <EscrituraReadinessPanel projectId={projectId} lotId={activeLotId} />
        </div>
        <div className="space-y-6 lg:col-span-8">
          <TitleCasePanel projectId={projectId} />
        </div>
      </div>
    </section>
  )
}
