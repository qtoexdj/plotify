'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  LEGAL_VARIABLE_STATE_LABELS,
  ROLE_MATCHING_STATUS_LABELS,
  ROLE_STATUS_LABELS,
  type LegalDocument,
  type LegalRoleMatchesResponse,
  type LegalRoleMatchUpdatePayload,
  type LegalVariableEditPayload,
  type LegalVariableState,
  type LegalVariableEditResponse,
  type LotRoleStatus,
  type LotRoleMatch,
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

const DEFAULT_ROLE_OVERRIDE_REASON = 'Validado por certificado SII y revision legal'
const ROLE_OVERRIDE_STATUS_OPTIONS: LotRoleStatus[] = [
  'rol_en_tramite',
  'definitive',
  'not_applicable',
  'missing',
]

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
  const [roleInventory, setRoleInventory] = useState<LegalRoleMatchesResponse | null>(null)
  const [selectedVariable, setSelectedVariable] = useState<VariableInventoryItem | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true)
  const [isLoadingVariables, setIsLoadingVariables] = useState(true)
  const [isLoadingRoles, setIsLoadingRoles] = useState(true)
  const [isSavingVariable, setIsSavingVariable] = useState(false)
  const [savingRoleLotId, setSavingRoleLotId] = useState<string | null>(null)
  const [roleOverrideDrafts, setRoleOverrideDrafts] = useState<
    Record<
      string,
      {
        sii_unit_name: string
        sii_pre_role: string
        sii_definitive_role: string
        role_status: LotRoleStatus
        reason: string
      }
    >
  >({})
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [variablesError, setVariablesError] = useState<string | null>(null)
  const [rolesError, setRolesError] = useState<string | null>(null)

  const variables = useMemo(
    () => flattenVariableGroups(inventory?.groups ?? {}),
    [inventory?.groups]
  )

  const blockingCount = useMemo(() => countBlockingVariables(variables), [variables])
  const approvedCount = inventory?.summary.approved ?? 0
  const totalCount = inventory?.summary.total ?? variables.length
  const roleBlockingCount =
    (roleInventory?.summary.ambiguous ?? 0) + (roleInventory?.summary.missing ?? 0)

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

  const loadRoles = useCallback(async () => {
    setIsLoadingRoles(true)
    setRolesError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/legal-roles`)
      const payload = (await response.json()) as LegalRoleMatchesResponse & { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || 'Error al cargar roles SII')
      }
      setRoleInventory(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar roles SII'
      setRolesError(message)
    } finally {
      setIsLoadingRoles(false)
    }
  }, [projectId])

  const loadDocuments = useCallback(async () => {
    setIsLoadingDocuments(true)
    setDocumentsError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/legal-documents`)
      const payload = (await response.json()) as LegalDocumentsPayload & { error?: string }
      if (!response.ok) {
        throw new Error(payload.error || 'Error al cargar documentos legales')
      }
      setDocuments(payload.documents ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar documentos legales'
      setDocumentsError(message)
    } finally {
      setIsLoadingDocuments(false)
    }
  }, [projectId])

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      try {
        const [documentsResponse, variablesResponse, rolesResponse] = await Promise.all([
          fetch(`/api/projects/${projectId}/legal-documents`),
          fetch(`/api/projects/${projectId}/legal-variables?include_evidence=true`),
          fetch(`/api/projects/${projectId}/legal-roles`),
        ])
        const documentsPayload = (await documentsResponse.json()) as LegalDocumentsPayload & {
          error?: string
        }
        const variablesPayload = (await variablesResponse.json()) as VariableInventoryResponse & {
          error?: string
        }
        const rolesPayload = (await rolesResponse.json()) as LegalRoleMatchesResponse & {
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

        if (!rolesResponse.ok) {
          setRolesError(rolesPayload.error || 'Error al cargar roles SII')
        } else {
          setRoleInventory(rolesPayload)
          setRolesError(null)
        }
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Error al cargar datos legales'
        setDocumentsError(message)
        setVariablesError(message)
        setRolesError(message)
      } finally {
        if (!cancelled) {
          setIsLoadingDocuments(false)
          setIsLoadingVariables(false)
          setIsLoadingRoles(false)
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

  const roleOverrideDraftFor = (lot: LotRoleMatch) =>
    roleOverrideDrafts[lot.lot_id] ?? {
      sii_unit_name: lot.sii_unit_name ?? '',
      sii_pre_role: lot.sii_pre_role ?? '',
      sii_definitive_role: lot.sii_definitive_role ?? '',
      role_status: lot.role_status,
      reason: '',
    }

  const defaultRoleOverrideDraftFor = (lot: LotRoleMatch) => ({
    sii_unit_name: lot.sii_unit_name ?? '',
    sii_pre_role: lot.sii_pre_role ?? '',
    sii_definitive_role: lot.sii_definitive_role ?? '',
    role_status: lot.role_status,
    reason: '',
  })

  const updateRoleOverrideDraft = (
    lot: LotRoleMatch,
    patch: Partial<ReturnType<typeof roleOverrideDraftFor>>
  ) => {
    setRoleOverrideDrafts((current) => ({
      ...current,
      [lot.lot_id]: {
        ...(current[lot.lot_id] ?? defaultRoleOverrideDraftFor(lot)),
        ...patch,
      },
    }))
  }

  const persistRoleOverride = async (lot: LotRoleMatch) => {
    const draft = roleOverrideDraftFor(lot)
    const reason = draft.reason.trim()
    if (!reason.trim()) {
      toast.error('El ajuste manual requiere una razon')
      return
    }

    const payload: LegalRoleMatchUpdatePayload = {
      sii_unit_name: draft.sii_unit_name.trim() || null,
      sii_role_matrix: lot.sii_role_matrix ?? null,
      sii_pre_role: draft.sii_pre_role.trim() || null,
      sii_role_in_process_text: lot.sii_role_in_process_text ?? null,
      sii_definitive_role: draft.sii_definitive_role.trim() || null,
      role_status: draft.role_status,
      matching_status: 'manual_override',
      reason,
    }

    setSavingRoleLotId(lot.lot_id)
    try {
      const response = await fetch(`/api/projects/${projectId}/legal-roles/${lot.lot_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as LotRoleMatch & { error?: string }
      if (!response.ok) {
        throw new Error(result.error || 'Error al ajustar rol SII')
      }
      toast.success('Rol SII ajustado manualmente')
      setRoleOverrideDrafts((current) => {
        const next = { ...current }
        delete next[lot.lot_id]
        return next
      })
      await loadRoles()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al ajustar rol SII'
      toast.error(message)
    } finally {
      setSavingRoleLotId(null)
    }
  }

  const retryDocumentExtraction = async (document: { id: string }) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/legal-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legal_document_id: document.id }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(result.error || 'Error al reintentar extracción legal')
      }
      toast.success('Extracción legal reencolada')
      await Promise.all([loadDocuments(), loadVariables()])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al reintentar extracción legal'
      toast.error(message)
    }
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
        onRetryDocument={retryDocumentExtraction}
      />

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Roles SII por lote</CardTitle>
            <CardDescription>
              Estado de asociacion de roles, pre-roles y Rol de avaluo en tramite.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{roleInventory?.summary.matched ?? 0} asociados</Badge>
            <Badge variant={roleBlockingCount > 0 ? 'destructive' : 'outline'}>
              {roleBlockingCount} por revisar
            </Badge>
            <Badge variant="outline">
              {roleInventory?.summary.manual_override ?? 0} manual_override
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                Revisa coincidencias ambiguas o faltantes antes de usar variables sii.* y
                lote.rol_tramite en minuta.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={loadRoles}>
                Actualizar roles
              </Button>
            </div>
            {rolesError ? <p className="text-sm text-destructive">{rolesError}</p> : null}
            {isLoadingRoles ? (
              <p className="text-sm text-muted-foreground">Cargando roles...</p>
            ) : null}
            {!isLoadingRoles && !rolesError && (roleInventory?.lots.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No hay roles SII asociados.</p>
            ) : null}
            {!isLoadingRoles && roleInventory?.lots.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Lote</th>
                      <th className="py-2 pr-3 font-medium">Unidad SII</th>
                      <th className="py-2 pr-3 font-medium">Pre-rol / rol</th>
                      <th className="py-2 pr-3 font-medium">Estado</th>
                      <th className="py-2 pr-3 font-medium">Matching</th>
                      <th className="py-2 pr-3 font-medium">Ajuste manual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleInventory.lots.map((lot) => {
                      const draft = roleOverrideDraftFor(lot)
                      return (
                        <tr key={lot.lot_id} className="border-b align-top last:border-0">
                          <td className="py-3 pr-3 font-medium">{lot.lot_number ?? lot.lot_id}</td>
                          <td className="py-3 pr-3">{lot.sii_unit_name ?? 'Sin unidad'}</td>
                          <td className="py-3 pr-3">
                            {lot.sii_definitive_role ?? lot.sii_pre_role ?? 'Sin rol'}
                          </td>
                          <td className="py-3 pr-3">{ROLE_STATUS_LABELS[lot.role_status]}</td>
                          <td className="py-3 pr-3">
                            <Badge
                              variant={
                                lot.matching_status === 'ambiguous' ||
                                lot.matching_status === 'missing'
                                  ? 'destructive'
                                  : 'outline'
                              }
                            >
                              {ROLE_MATCHING_STATUS_LABELS[lot.matching_status]}
                            </Badge>
                          </td>
                          <td className="w-[360px] py-3 pr-3">
                            <div className="grid gap-2">
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  aria-label={`Unidad SII lote ${lot.lot_number ?? lot.lot_id}`}
                                  value={draft.sii_unit_name}
                                  placeholder="Unidad SII"
                                  onChange={(event) =>
                                    updateRoleOverrideDraft(lot, {
                                      sii_unit_name: event.target.value,
                                    })
                                  }
                                />
                                <Input
                                  aria-label={`Pre-rol lote ${lot.lot_number ?? lot.lot_id}`}
                                  value={draft.sii_pre_role}
                                  placeholder="Pre-rol"
                                  onChange={(event) =>
                                    updateRoleOverrideDraft(lot, {
                                      sii_pre_role: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="grid grid-cols-[1fr_auto] gap-2">
                                <select
                                  aria-label={`Estado rol lote ${lot.lot_number ?? lot.lot_id}`}
                                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  value={draft.role_status}
                                  onChange={(event) =>
                                    updateRoleOverrideDraft(lot, {
                                      role_status: event.target.value as LotRoleStatus,
                                    })
                                  }
                                >
                                  {ROLE_OVERRIDE_STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>
                                      {ROLE_STATUS_LABELS[status]}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={savingRoleLotId === lot.lot_id}
                                  onClick={() => persistRoleOverride(lot)}
                                >
                                  Guardar
                                </Button>
                              </div>
                              <Textarea
                                aria-label={`Razon ajuste manual lote ${
                                  lot.lot_number ?? lot.lot_id
                                }`}
                                value={draft.reason}
                                placeholder={DEFAULT_ROLE_OVERRIDE_REASON}
                                onChange={(event) =>
                                  updateRoleOverrideDraft(lot, {
                                    reason: event.target.value,
                                  })
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

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
