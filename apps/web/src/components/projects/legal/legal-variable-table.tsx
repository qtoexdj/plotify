'use client'

import { type MouseEvent, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  LEGAL_VARIABLE_GROUP_LABELS,
  LEGAL_VARIABLE_GROUPS,
  LEGAL_VARIABLE_SOURCE_TYPE_LABELS,
  LEGAL_VARIABLE_STATE_LABELS,
  LEGAL_VARIABLE_STATES,
  type LegalVariableGroup,
  type LegalVariableState,
  type VariableInventoryItem,
} from '@/lib/legal/variable-resolution-types'

interface LegalVariableTableProps {
  variables: VariableInventoryItem[]
  selectedVariableId?: string | null
  isLoading?: boolean
  error?: string | null
  onSelectVariable?: (variable: VariableInventoryItem) => void
  onEditVariable?: (variable: VariableInventoryItem) => void
  onApproveVariable?: (variable: VariableInventoryItem) => void
  onMarkNotApplicable?: (variable: VariableInventoryItem) => void
  onViewEvidence?: (variable: VariableInventoryItem) => void
}

const ALL_STATES = 'all'
const ALL_GROUPS = 'all'
const ALL_DOCUMENTS = 'all'

const stateClassName: Record<LegalVariableState, string> = {
  missing: 'border-red-200 bg-red-50 text-red-700',
  proposed: 'border-sky-200 bg-sky-50 text-sky-700',
  resolved: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  manual_review: 'border-amber-200 bg-amber-50 text-amber-700',
  conflict: 'border-orange-200 bg-orange-50 text-orange-700',
  derived: 'border-violet-200 bg-violet-50 text-violet-700',
  not_applicable: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  superseded: 'border-slate-200 bg-slate-50 text-slate-600',
}

function formatValue(variable: VariableInventoryItem) {
  if (variable.value_text) return variable.value_text
  if (variable.value_json !== null && variable.value_json !== undefined) {
    return JSON.stringify(variable.value_json)
  }
  return '--'
}

function formatConfidence(confidence: number | null) {
  if (confidence === null || confidence === undefined) return '--'
  return `${Math.round(confidence * 100)}%`
}

function getPrimaryEvidence(variable: VariableInventoryItem) {
  return variable.evidence[0]
}

function EvidenceSummary({ name, page }: { name?: string; page?: number | null }) {
  return (
    <div className="text-sm">
      <div className="truncate">{name ?? 'Documento'}</div>
      <div className="text-xs text-muted-foreground">Pagina {page ?? '--'}</div>
    </div>
  )
}

function RowButton({
  label,
  variant = 'outline',
  disabled = false,
  onClick,
}: {
  label: string
  variant?: 'outline' | 'secondary' | 'ghost'
  disabled?: boolean
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <Button type="button" variant={variant} size="sm" disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  )
}

export function LegalVariableTable({
  variables,
  selectedVariableId = null,
  isLoading = false,
  error = null,
  onSelectVariable,
  onEditVariable,
  onApproveVariable,
  onMarkNotApplicable,
  onViewEvidence,
}: LegalVariableTableProps) {
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<string>(ALL_STATES)
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS)
  const [documentFilter, setDocumentFilter] = useState<string>(ALL_DOCUMENTS)

  const documentNames = useMemo(() => {
    return Array.from(
      new Set(
        variables
          .flatMap((variable) => variable.evidence.map((evidence) => evidence.document_name))
          .filter((name): name is string => Boolean(name))
      )
    ).sort((a, b) => a.localeCompare(b, 'es-CL'))
  }, [variables])

  const filteredVariables = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return variables.filter((variable) => {
      const matchesSearch =
        !normalizedSearch ||
        variable.variable_key.toLowerCase().includes(normalizedSearch) ||
        (variable.label ?? '').toLowerCase().includes(normalizedSearch) ||
        formatValue(variable).toLowerCase().includes(normalizedSearch)
      const matchesState = stateFilter === ALL_STATES || variable.state === stateFilter
      const matchesGroup = groupFilter === ALL_GROUPS || variable.variable_group === groupFilter
      const matchesDocument =
        documentFilter === ALL_DOCUMENTS ||
        variable.evidence.some((evidence) => evidence.document_name === documentFilter)
      return matchesSearch && matchesState && matchesGroup && matchesDocument
    })
  }, [documentFilter, groupFilter, search, stateFilter, variables])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventario de variables</CardTitle>
        <CardDescription>
          Variables canonicas extraidas, corregidas o pendientes de revision legal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_190px_220px]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar variable, valor o clave"
            aria-label="Buscar variables legales"
          />
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATES}>Todos los estados</SelectItem>
              {LEGAL_VARIABLE_STATES.map((state) => (
                <SelectItem key={state} value={state}>
                  {LEGAL_VARIABLE_STATE_LABELS[state]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger aria-label="Filtrar por grupo">
              <SelectValue placeholder="Grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GROUPS}>Todos los grupos</SelectItem>
              {LEGAL_VARIABLE_GROUPS.map((group) => (
                <SelectItem key={group} value={group}>
                  {LEGAL_VARIABLE_GROUP_LABELS[group]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={documentFilter} onValueChange={setDocumentFilter}>
            <SelectTrigger aria-label="Filtrar por documento">
              <SelectValue placeholder="Documento fuente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DOCUMENTS}>Todos los documentos</SelectItem>
              {documentNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Cargando variables legales...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : filteredVariables.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            No hay variables que coincidan con los filtros actuales.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variable</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fuente</TableHead>
                <TableHead>Evidencia</TableHead>
                <TableHead className="text-right">Confianza</TableHead>
                <TableHead className="text-right">Accion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVariables.map((variable) => {
                const evidence = getPrimaryEvidence(variable)
                return (
                  <TableRow
                    key={variable.id}
                    data-state={selectedVariableId === variable.id ? 'selected' : undefined}
                    className={cn(onSelectVariable && 'cursor-pointer')}
                    onClick={() => onSelectVariable?.(variable)}
                  >
                    <TableCell className="max-w-72">
                      <div className="font-medium">{variable.label ?? variable.variable_key}</div>
                      <div className="text-xs text-muted-foreground">{variable.variable_key}</div>
                      <div className="mt-1">
                        <Badge variant="outline">
                          {LEGAL_VARIABLE_GROUP_LABELS[
                            variable.variable_group as LegalVariableGroup
                          ] ?? variable.variable_group}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-80">
                      <div className="truncate">{formatValue(variable)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={stateClassName[variable.state]}>
                        {LEGAL_VARIABLE_STATE_LABELS[variable.state]}
                      </Badge>
                    </TableCell>
                    <TableCell>{LEGAL_VARIABLE_SOURCE_TYPE_LABELS[variable.source_type]}</TableCell>
                    <TableCell className="max-w-56">
                      {evidence ? (
                        <EvidenceSummary
                          name={evidence.document_name}
                          page={evidence.page_number}
                        />
                      ) : (
                        <span className="text-muted-foreground">Sin evidencia</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatConfidence(variable.confidence)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {onViewEvidence ? (
                          <RowButton
                            label="Evidencia"
                            onClick={(event) => {
                              event.stopPropagation()
                              onViewEvidence(variable)
                            }}
                          />
                        ) : null}
                        {onEditVariable ? (
                          <RowButton
                            label="Editar"
                            onClick={(event) => {
                              event.stopPropagation()
                              onEditVariable(variable)
                            }}
                          />
                        ) : null}
                        {onApproveVariable ? (
                          <RowButton
                            label="Aprobar"
                            variant="secondary"
                            disabled={variable.state === 'approved'}
                            onClick={(event) => {
                              event.stopPropagation()
                              onApproveVariable(variable)
                            }}
                          />
                        ) : null}
                        {onMarkNotApplicable ? (
                          <RowButton
                            label="No aplica"
                            variant="ghost"
                            disabled={variable.state === 'not_applicable'}
                            onClick={(event) => {
                              event.stopPropagation()
                              onMarkNotApplicable(variable)
                            }}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
