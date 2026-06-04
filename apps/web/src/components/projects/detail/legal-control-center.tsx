'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  LEGAL_VARIABLE_STATE_LABELS,
  type LegalDocument,
  type LegalVariableEditPayload,
  type LegalVariableState,
  type LegalVariableEditResponse,
  type VariableInventoryGroups,
  type VariableInventoryItem,
  type VariableInventoryResponse,
} from '@/lib/legal/variable-resolution-types'
import { LegalDocumentStatusPanel } from '@/components/projects/legal/legal-document-status-panel'
import { LegalEvidenceViewer } from '@/components/projects/legal/legal-evidence-viewer'
import { LegalVariableEditor } from '@/components/projects/legal/legal-variable-editor'
import { LegalVariableTable } from '@/components/projects/legal/legal-variable-table'

interface LegalControlCenterProps {
  projectId: string
  projectName: string
}

interface LegalDocumentsPayload {
  documents?: LegalDocument[]
}

const BLOCKING_STATES = new Set<LegalVariableState>([
  'missing',
  'manual_review',
  'conflict',
  'proposed',
])

export function flattenVariableGroups(groups: VariableInventoryGroups): VariableInventoryItem[] {
  return Object.values(groups).flatMap((variables) => variables ?? [])
}

function countBlockingVariables(variables: VariableInventoryItem[]) {
  return variables.filter((variable) => BLOCKING_STATES.has(variable.state)).length
}

export function LegalControlCenter({ projectId, projectName }: LegalControlCenterProps) {
  const [documents, setDocuments] = useState<LegalDocument[]>([])
  const [inventory, setInventory] = useState<VariableInventoryResponse | null>(null)
  const [selectedVariable, setSelectedVariable] = useState<VariableInventoryItem | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const [isLoadingVariables, setIsLoadingVariables] = useState(true)
  const [isSavingVariable, setIsSavingVariable] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [variablesError, setVariablesError] = useState<string | null>(null)

  const variables = useMemo(
    () => flattenVariableGroups(inventory?.groups ?? {}),
    [inventory?.groups]
  )

  const blockingCount = useMemo(() => countBlockingVariables(variables), [variables])
  const approvedCount = inventory?.summary.approved ?? 0
  const totalCount = inventory?.summary.total ?? variables.length

  const applyInventory = useCallback((nextInventory: VariableInventoryResponse) => {
    setInventory(nextInventory)
    setSelectedVariable((current) => {
      if (!current) return null
      return (
        flattenVariableGroups(nextInventory.groups).find(
          (variable) => variable.id === current.id
        ) ?? null
      )
    })
  }, [])

  const loadVariables = useCallback(async () => {
    setIsLoadingVariables(true)
    setVariablesError(null)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/legal-variables?include_evidence=true`
      )
      const payload = (await response.json()) as VariableInventoryResponse & { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || 'Error al cargar variables legales')
      }
      applyInventory(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar variables legales'
      setVariablesError(message)
    } finally {
      setIsLoadingVariables(false)
    }
  }, [applyInventory, projectId])

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      try {
        const [documentsResponse, variablesResponse] = await Promise.all([
          fetch(`/api/projects/${projectId}/legal-documents`),
          fetch(`/api/projects/${projectId}/legal-variables?include_evidence=true`),
        ])
        const documentsPayload = (await documentsResponse.json()) as LegalDocumentsPayload & {
          error?: string
        }
        const variablesPayload = (await variablesResponse.json()) as VariableInventoryResponse & {
          error?: string
        }

        if (cancelled) return

        if (!documentsResponse.ok) {
          setDocumentsError(documentsPayload.error || 'Error al cargar documentos legales')
        } else {
          setDocuments(documentsPayload.documents ?? [])
          setDocumentsError(null)
        }

        if (!variablesResponse.ok) {
          setVariablesError(variablesPayload.error || 'Error al cargar variables legales')
        } else {
          applyInventory(variablesPayload)
          setVariablesError(null)
        }
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Error al cargar datos legales'
        setDocumentsError(message)
        setVariablesError(message)
      } finally {
        if (!cancelled) {
          setIsLoadingDocuments(false)
          setIsLoadingVariables(false)
        }
      }
    }

    loadInitialData()

    return () => {
      cancelled = true
    }
  }, [applyInventory, projectId])

  const persistVariable = async (
    variable: VariableInventoryItem,
    payload: LegalVariableEditPayload,
    successMessage: string
  ) => {
    setIsSavingVariable(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/legal-variables/${variable.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as LegalVariableEditResponse & { error?: string }
      if (!response.ok) {
        throw new Error(result.error || 'Error al actualizar variable legal')
      }
      toast.success(successMessage)
      setIsEditorOpen(false)
      await loadVariables()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al actualizar variable legal'
      toast.error(message)
    } finally {
      setIsSavingVariable(false)
    }
  }

  const openEditor = (variable: VariableInventoryItem) => {
    setSelectedVariable(variable)
    setIsEditorOpen(true)
  }

  return (
    <section className="space-y-6" aria-label="Centro de Control Legal">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Centro de Control Legal</CardTitle>
            <CardDescription>
              Variables, evidencia y brechas de escritura para {projectName}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{totalCount} variables</Badge>
            <Badge variant="outline">{approvedCount} aprobadas</Badge>
            <Badge variant={blockingCount > 0 ? 'destructive' : 'outline'}>
              {blockingCount} por revisar
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              Corrige OCR, resuelve conflictos y aprueba valores antes de crear snapshots para
              minuta.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={loadVariables}>
              Actualizar variables
            </Button>
          </div>
        </CardContent>
      </Card>

      <LegalDocumentStatusPanel
        documents={documents}
        isLoading={isLoadingDocuments}
        error={documentsError}
      />

      <LegalVariableTable
        variables={variables}
        selectedVariableId={selectedVariable?.id ?? null}
        isLoading={isLoadingVariables}
        error={variablesError}
        onSelectVariable={setSelectedVariable}
        onEditVariable={openEditor}
        onApproveVariable={(variable) =>
          persistVariable(
            variable,
            {
              action: 'approve',
              value_text: variable.value_text,
              value_json: variable.value_json,
              state: 'approved',
              correction_reason: variable.correction_reason,
              evidence_policy: 'keep_existing',
            },
            'Variable legal aprobada'
          )
        }
        onMarkNotApplicable={(variable) => {
          setSelectedVariable(variable)
          setIsEditorOpen(true)
        }}
        onViewEvidence={setSelectedVariable}
      />

      <LegalEvidenceViewer evidence={selectedVariable?.evidence ?? []} />

      <LegalVariableEditor
        variable={selectedVariable}
        open={isEditorOpen}
        isSaving={isSavingVariable}
        onOpenChange={setIsEditorOpen}
        onSave={(variable, payload) =>
          persistVariable(variable, payload, 'Variable legal corregida')
        }
        onApprove={(variable, payload) =>
          persistVariable(variable, payload, 'Variable legal aprobada')
        }
        onMarkNotApplicable={(variable, payload) =>
          persistVariable(
            variable,
            payload,
            `${LEGAL_VARIABLE_STATE_LABELS.not_applicable}: ${variable.variable_key}`
          )
        }
      />
    </section>
  )
}
