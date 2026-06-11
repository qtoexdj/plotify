'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  LEGAL_VARIABLE_STATE_LABELS,
  ROLE_MATCHING_STATUSES,
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
  deriveRoleInProcessText,
} from '@/lib/legal/variable-resolution-types'
import { LegalDocumentStatusPanel } from '@/components/projects/legal/legal-document-status-panel'
import { LegalVariableEditor } from '@/components/projects/legal/legal-variable-editor'
import { PlanoArchivePanel } from '@/components/projects/legal/plano-archive-panel'
import { SagArticleTwoPanel } from '@/components/projects/legal/sag-article-two-panel'
import { EscrituraReadinessPanel } from '@/components/projects/legal/escritura-readiness-panel'
import { TitleCasePanel } from '@/components/projects/legal/title-case-panel'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  File02Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  Refresh01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'

interface LegalControlCenterProps {
  projectId: string
  projectName: string
}

interface LegalDocumentsPayload {
  documents?: LegalDocument[]
}

interface RoleOverrideDraft {
  sii_unit_name: string
  sii_comuna: string
  sii_role_matrix: string
  sii_pre_role: string
  sii_definitive_role: string
  role_status: LotRoleStatus
  reason: string
}

const DEFAULT_ROLE_OVERRIDE_REASON = 'Validado por certificado SII y revision legal'
const ROLE_OVERRIDE_STATUS_OPTIONS: LotRoleStatus[] = [
  'rol_en_tramite',
  'definitive',
  'not_applicable',
  'missing',
]
const ROLE_FILTER_OPTIONS = ['all', ...ROLE_MATCHING_STATUSES] as const

type RoleFilter = (typeof ROLE_FILTER_OPTIONS)[number]

const BLOCKING_STATES = new Set<LegalVariableState>([
  'missing',
  'manual_review',
  'conflict',
  'proposed',
])
const SAG_RECALCULABLE_DOCUMENT_TYPES = new Set(['certificado_sag', 'plano_oficial'])
const SAG_RECALCULABLE_STATUSES = new Set([
  'failed',
  'needs_review',
  'text_extracted',
  'variables_proposed',
])

export function flattenVariableGroups(groups: VariableInventoryGroups): VariableInventoryItem[] {
  return Object.values(groups).flatMap((variables) => variables ?? [])
}

function countBlockingVariables(variables: VariableInventoryItem[]) {
  return variables.filter((variable) => BLOCKING_STATES.has(variable.state)).length
}

function RoleOverrideForm({
  lot,
  draft,
  isSaving,
  onChange,
  onSave,
}: {
  lot: LotRoleMatch
  draft: RoleOverrideDraft
  isSaving: boolean
  onChange: (patch: Partial<RoleOverrideDraft>) => void
  onSave: () => void
}) {
  const lotLabel = lot.lot_number ?? lot.lot_id

  return (
    <div className="grid gap-3">
      <Input
        aria-label={`Unidad SII lote ${lotLabel}`}
        value={draft.sii_unit_name}
        placeholder="Unidad SII"
        onChange={(event) => onChange({ sii_unit_name: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          aria-label={`Comuna SII lote ${lotLabel}`}
          value={draft.sii_comuna}
          placeholder="Comuna"
          onChange={(event) => onChange({ sii_comuna: event.target.value })}
        />
        <Input
          aria-label={`Rol matriz SII lote ${lotLabel}`}
          value={draft.sii_role_matrix}
          placeholder="Rol matriz"
          onChange={(event) => onChange({ sii_role_matrix: event.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          aria-label={`Pre-rol lote ${lotLabel}`}
          value={draft.sii_pre_role}
          placeholder="Pre-rol"
          onChange={(event) => onChange({ sii_pre_role: event.target.value })}
        />
        <Input
          aria-label={`Rol definitivo lote ${lotLabel}`}
          value={draft.sii_definitive_role}
          placeholder="Rol definitivo"
          onChange={(event) => onChange({ sii_definitive_role: event.target.value })}
        />
      </div>
      <select
        aria-label={`Estado rol lote ${lotLabel}`}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={draft.role_status}
        onChange={(event) => onChange({ role_status: event.target.value as LotRoleStatus })}
      >
        {ROLE_OVERRIDE_STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {ROLE_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <Textarea
        aria-label={`Razon ajuste manual lote ${lotLabel}`}
        value={draft.reason}
        placeholder={DEFAULT_ROLE_OVERRIDE_REASON}
        onChange={(event) => onChange({ reason: event.target.value })}
      />
      <Button type="button" variant="outline" disabled={isSaving} onClick={onSave}>
        Guardar ajuste
      </Button>
    </div>
  )
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
  const [isRecalculatingSag, setIsRecalculatingSag] = useState(false)
  const [savingRoleLotId, setSavingRoleLotId] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [selectedRoleLotId, setSelectedRoleLotId] = useState<string | null>(null)
  const [roleOverrideDrafts, setRoleOverrideDrafts] = useState<Record<string, RoleOverrideDraft>>(
    {}
  )
  const [documentsError, setDocumentsError] = useState<string | null>(null)
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
  const filteredRoleLots = useMemo(() => {
    const rawLots =
      roleFilter === 'all'
        ? (roleInventory?.lots ?? [])
        : (roleInventory?.lots ?? []).filter((lot) => lot.matching_status === roleFilter)

    return [...rawLots].sort((a, b) => {
      const numA = parseInt((a.lot_number || '').replace(/\D/g, ''), 10) || 0
      const numB = parseInt((b.lot_number || '').replace(/\D/g, ''), 10) || 0
      if (numA !== numB) {
        return numA - numB
      }
      return (a.lot_number || '').localeCompare(b.lot_number || '', undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    })
  }, [roleFilter, roleInventory?.lots])
  const selectedRoleLot =
    (roleInventory?.lots ?? []).find((lot) => lot.lot_id === selectedRoleLotId) ??
    filteredRoleLots[0] ??
    null
  const activeLotId = selectedRoleLot?.lot_id || roleInventory?.lots[0]?.lot_id || ''
  const certificateSummary = roleInventory?.certificate_summary
  const recalculableSagDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          SAG_RECALCULABLE_DOCUMENT_TYPES.has(document.document_type) &&
          SAG_RECALCULABLE_STATUSES.has(document.extraction_status)
      ),
    [documents]
  )

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
      console.error(error)
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

        if (variablesResponse.ok) {
          applyInventory(variablesPayload)
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

  const approveVariable = (variable: VariableInventoryItem) =>
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

  const roleOverrideDraftFor = (lot: LotRoleMatch) =>
    roleOverrideDrafts[lot.lot_id] ?? {
      sii_unit_name: lot.sii_unit_name ?? '',
      sii_comuna: lot.sii_comuna ?? '',
      sii_role_matrix: lot.sii_role_matrix ?? '',
      sii_pre_role: lot.sii_pre_role ?? '',
      sii_definitive_role: lot.sii_definitive_role ?? '',
      role_status: lot.role_status,
      reason: '',
    }

  const defaultRoleOverrideDraftFor = (lot: LotRoleMatch) => ({
    sii_unit_name: lot.sii_unit_name ?? '',
    sii_comuna: lot.sii_comuna ?? '',
    sii_role_matrix: lot.sii_role_matrix ?? '',
    sii_pre_role: lot.sii_pre_role ?? '',
    sii_definitive_role: lot.sii_definitive_role ?? '',
    role_status: lot.role_status,
    reason: '',
  })

  const updateRoleOverrideDraft = (lot: LotRoleMatch, patch: Partial<RoleOverrideDraft>) => {
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

    const siiUnitName = draft.sii_unit_name?.trim() || null
    const siiComuna = draft.sii_comuna?.trim() || null
    const siiRoleMatrix = draft.sii_role_matrix?.trim() || null
    const siiPreRole = draft.sii_pre_role?.trim() || null
    const siiDefinitiveRole = draft.sii_definitive_role?.trim() || null

    const derivedText =
      draft.role_status === 'rol_en_tramite' && siiPreRole && siiComuna
        ? deriveRoleInProcessText(siiPreRole, siiComuna)
        : null

    const payload: LegalRoleMatchUpdatePayload = {
      sii_unit_name: siiUnitName,
      sii_lot_number_normalized: lot.sii_lot_number_normalized ?? null,
      sii_comuna: siiComuna,
      sii_role_matrix: siiRoleMatrix,
      sii_pre_role: siiPreRole,
      sii_role_in_process_text: derivedText,
      sii_definitive_role: siiDefinitiveRole,
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
      await Promise.all([loadDocuments(), loadVariables()])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error al reintentar extracción legal'
      toast.error(message)
    }
  }

  const recalculateSagDocuments = async () => {
    if (recalculableSagDocuments.length === 0) {
      toast.error('No hay certificado SAG o plano listo para recalcular')
      return
    }
    setIsRecalculatingSag(true)
    try {
      await Promise.all(recalculableSagDocuments.map(queueDocumentExtraction))
      toast.success('Extracción SAG reencolada')
      await Promise.all([loadDocuments(), loadVariables()])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al recalcular datos SAG'
      toast.error(message)
    } finally {
      setIsRecalculatingSag(false)
    }
  }

  return (
    <section className="space-y-6" aria-label="Centro de Control Legal">
      {/* Cabecera Premium Limpia */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Centro de Control Legal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Variables, evidencia y brechas de escritura para {projectName}.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadVariables}
          className="self-start md:self-auto flex items-center gap-1.5 transition-all duration-200"
        >
          <HugeiconsIcon icon={Refresh01Icon} className="w-4 h-4" />
          Actualizar variables
        </Button>
      </div>

      {/* Bento Grid Superior de 3 Columnas para KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card text-card-foreground p-4 shadow-sm flex items-center justify-between transition-all duration-200 hover:border-primary/50">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total variables
            </p>
            <h3 className="text-2xl font-bold mt-1 text-foreground">{totalCount}</h3>
          </div>
          <div className="p-3 bg-muted rounded-lg text-muted-foreground">
            <HugeiconsIcon icon={File02Icon} className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card text-card-foreground p-4 shadow-sm flex items-center justify-between transition-all duration-200 hover:border-emerald-500/50">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Aprobadas
            </p>
            <h3 className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
              {approvedCount}
            </h3>
          </div>
          <div className="p-3 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-lg text-emerald-600 dark:text-emerald-400">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card text-card-foreground p-4 shadow-sm flex items-center justify-between transition-all duration-200 hover:border-destructive/50">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Por revisar
            </p>
            <h3
              className={`text-2xl font-bold mt-1 ${blockingCount > 0 ? 'text-destructive' : 'text-foreground'}`}
            >
              {blockingCount}
            </h3>
          </div>
          <div
            className={`p-3 rounded-lg ${blockingCount > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}
          >
            <HugeiconsIcon icon={AlertCircleIcon} className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Bento Grid Principal de 12 Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda (col-span-4): Estado Documentos y Readiness */}
        <div className="lg:col-span-4 space-y-6">
          <LegalDocumentStatusPanel
            documents={documents}
            isLoading={isLoadingDocuments}
            error={documentsError}
            onRetryDocument={retryDocumentExtraction}
          />

          <EscrituraReadinessPanel projectId={projectId} lotId={activeLotId} />
        </div>

        {/* Columna Derecha (col-span-8): Título, SAG, Plano y Roles */}
        <div className="lg:col-span-8 space-y-6">
          <TitleCasePanel projectId={projectId} />

          <SagArticleTwoPanel
            variables={variables}
            isLoading={isLoadingVariables}
            isRecalculating={isRecalculatingSag}
            canRecalculate={recalculableSagDocuments.length > 0}
            onRecalculate={recalculateSagDocuments}
            onEditVariable={openEditor}
            onApproveVariable={approveVariable}
            onViewEvidence={setSelectedVariable}
          />

          <PlanoArchivePanel
            variables={variables}
            isLoading={isLoadingVariables}
            onEditVariable={openEditor}
            onApproveVariable={approveVariable}
          />

          {/* Roles SII por lote */}
          <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-muted/10">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  Roles SII por lote
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Asociación de roles, pre-roles y Rol de avalúo en trámite.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]"
                >
                  {roleInventory?.summary.matched ?? 0} asociados
                </Badge>
                <Badge
                  variant={roleBlockingCount > 0 ? 'destructive' : 'outline'}
                  className="text-[10px]"
                >
                  {roleBlockingCount} por revisar
                </Badge>
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/20 text-[10px]"
                >
                  {roleInventory?.summary.manual_override ?? 0} manuales
                </Badge>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Resumen del Certificado */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3 hover:border-primary/30 transition-colors">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                    Certificado
                  </p>
                  <p className="mt-1 text-xs font-medium truncate text-foreground">
                    {certificateSummary?.source_legal_document_ids[0] ?? 'Sin documento'}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3 hover:border-primary/30 transition-colors">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                    Comuna
                  </p>
                  <p className="mt-1 text-xs font-medium truncate text-foreground">
                    {certificateSummary?.comunas.join(', ') || 'Pendiente'}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3 hover:border-primary/30 transition-colors">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                    Rol matriz
                  </p>
                  <p className="mt-1 text-xs font-medium truncate text-foreground">
                    {certificateSummary?.role_matrices.join(', ') || 'Pendiente'}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3 hover:border-primary/30 transition-colors">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">
                    Extracción
                  </p>
                  <p className="mt-1 text-xs font-medium truncate text-foreground">
                    {certificateSummary?.extracted_unit_count ?? 0} filas ·{' '}
                    {certificateSummary?.text_source ?? 'sin texto'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border pt-4">
                <div className="flex flex-wrap gap-1.5" aria-label="Filtrar roles SII">
                  {ROLE_FILTER_OPTIONS.map((status) => (
                    <Button
                      key={status}
                      type="button"
                      variant={roleFilter === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRoleFilter(status)}
                      className="h-8 text-xs transition-all duration-150"
                    >
                      {status === 'all' ? 'Todos' : ROLE_MATCHING_STATUS_LABELS[status]}
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadRoles}
                  className="h-8 text-xs flex items-center gap-1.5 transition-all duration-200"
                >
                  <HugeiconsIcon icon={Refresh01Icon} className="w-3.5 h-3.5" />
                  Actualizar roles
                </Button>
              </div>

              {rolesError ? (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20 flex items-center gap-2">
                  <HugeiconsIcon icon={AlertCircleIcon} className="w-4 h-4 flex-shrink-0" />
                  <span>{rolesError}</span>
                </div>
              ) : null}

              {isLoadingRoles ? (
                <div className="py-8 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <HugeiconsIcon
                    icon={Refresh01Icon}
                    className="w-6 h-6 animate-spin text-primary"
                  />
                  <p className="text-xs">Cargando roles...</p>
                </div>
              ) : null}

              {!isLoadingRoles && !rolesError && (roleInventory?.lots.length ?? 0) === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg">
                  <HugeiconsIcon icon={File02Icon} className="w-8 h-8 opacity-30 mb-2" />
                  <p className="text-xs">No hay roles SII asociados.</p>
                </div>
              ) : null}

              {!isLoadingRoles && roleInventory?.lots.length ? (
                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                  <div className="overflow-hidden border border-border rounded-lg bg-muted/5">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/20 border-b border-border text-left uppercase text-muted-foreground">
                          <tr>
                            <th className="py-2.5 px-3 font-semibold">Lote</th>
                            <th className="py-2.5 px-3 font-semibold">Unidad SII</th>
                            <th className="py-2.5 px-3 font-semibold">Pre-rol / rol</th>
                            <th className="py-2.5 px-3 font-semibold">Evidencia</th>
                            <th className="py-2.5 px-3 font-semibold">Matching</th>
                            <th className="py-2.5 px-3 text-right font-semibold">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {filteredRoleLots.map((lot) => {
                            const isSelected = selectedRoleLot?.lot_id === lot.lot_id
                            return (
                              <tr
                                key={lot.lot_id}
                                className={`align-middle hover:bg-muted/10 transition-colors ${
                                  isSelected ? 'bg-primary/5' : ''
                                }`}
                              >
                                <td className="py-2.5 px-3 font-medium text-foreground">
                                  {lot.lot_number ?? lot.lot_id}
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  {lot.sii_unit_name ?? 'Sin unidad'}
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-foreground">
                                  {lot.sii_definitive_role ?? lot.sii_pre_role ?? 'Sin rol'}
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[120px]">
                                  {lot.source_document_label ?? 'Sin evidencia'}
                                </td>
                                <td className="py-2.5 px-3">
                                  <Badge
                                    variant={
                                      lot.matching_status === 'ambiguous' ||
                                      lot.matching_status === 'missing'
                                        ? 'destructive'
                                        : lot.matching_status === 'manual_override'
                                          ? 'default'
                                          : 'outline'
                                    }
                                    className="text-[9px] px-1.5 py-0"
                                  >
                                    {ROLE_MATCHING_STATUS_LABELS[lot.matching_status]}
                                  </Badge>
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <Button
                                    type="button"
                                    variant={isSelected ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setSelectedRoleLotId(lot.lot_id)}
                                    className="h-7 text-xs px-2.5 transition-all duration-150"
                                  >
                                    {isSelected ? 'Seleccionado' : 'Ajustar'}
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selectedRoleLot ? (
                    <div className="rounded-lg border border-border bg-muted/5 p-4 flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                        <div>
                          <h4 className="text-xs font-semibold text-foreground">
                            Lote {selectedRoleLot.lot_number ?? selectedRoleLot.lot_id}
                          </h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {ROLE_STATUS_LABELS[selectedRoleLot.role_status]} ·{' '}
                            {ROLE_MATCHING_STATUS_LABELS[selectedRoleLot.matching_status]}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          {selectedRoleLot.source_document_label ?? 'Ajuste manual'}
                        </Badge>
                      </div>
                      <RoleOverrideForm
                        lot={selectedRoleLot}
                        draft={roleOverrideDraftFor(selectedRoleLot)}
                        isSaving={savingRoleLotId === selectedRoleLot.lot_id}
                        onChange={(patch) => updateRoleOverrideDraft(selectedRoleLot, patch)}
                        onSave={() => persistRoleOverride(selectedRoleLot)}
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/80 bg-muted/5 p-6 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[220px]">
                      <HugeiconsIcon
                        icon={Settings02Icon}
                        className="w-6 h-6 opacity-30 mb-2 animate-pulse"
                      />
                      <p className="text-[11px]">
                        Selecciona un lote de la tabla para realizar ajustes manuales.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

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
