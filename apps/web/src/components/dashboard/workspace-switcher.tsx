'use client'

import { useTransition } from 'react'

import { selectWorkspaceAction } from '@/actions/select-workspace.action'
import type { WorkspaceOption } from '@/lib/services/workspace.service'

interface WorkspaceSwitcherProps {
  options: WorkspaceOption[]
  activeOrganizationId?: string
}

export function WorkspaceSwitcher({ options, activeOrganizationId }: WorkspaceSwitcherProps) {
  const [pending, startTransition] = useTransition()
  if (options.length < 2) return null

  return (
    <form action={selectWorkspaceAction} aria-label="Seleccionar workspace">
      <label className="sr-only" htmlFor="active-workspace">
        Workspace activo
      </label>
      <select
        id="active-workspace"
        name="organizationId"
        value={activeOrganizationId ?? ''}
        disabled={pending}
        className="h-8 max-w-52 rounded-md border border-border bg-background px-2 text-sm"
        onChange={(event) => {
          const form = event.currentTarget.form
          if (form) startTransition(() => form.requestSubmit())
        }}
      >
        {!activeOrganizationId && <option value="">Selecciona un workspace</option>}
        {options.map((option) => (
          <option key={option.organizationId} value={option.organizationId}>
            {option.organizationName}
          </option>
        ))}
      </select>
    </form>
  )
}
