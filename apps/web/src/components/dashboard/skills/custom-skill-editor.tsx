'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle02Icon,
  FloppyDiskIcon,
  Loading02Icon,
  PlusSignIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'

import {
  createCustomSkill,
  publishCustomSkill,
  validateCustomSkill,
  type CustomSkillApiResponse,
  type SkillValidationResult,
} from '@/actions/agent-skills.action'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApprovedToolsPicker, type ApprovedToolOption } from './approved-tools-picker'
import { SkillValidationPanel } from './skill-validation-panel'

const ROLE_OPTIONS = [
  { value: 'vendor', label: 'Vendedor' },
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'Usuario' },
  { value: 'lead', label: 'Lead' },
]

interface CustomSkillEditorProps {
  organizationId: string
  availableTools: ApprovedToolOption[]
}

export function CustomSkillEditor({ organizationId, availableTools }: CustomSkillEditorProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [definitionMarkdown, setDefinitionMarkdown] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [approvedTools, setApprovedTools] = useState<string[]>([])
  const [validation, setValidation] = useState<SkillValidationResult | null>(null)
  const [savedSkill, setSavedSkill] = useState<CustomSkillApiResponse | null>(null)
  const [isPending, startTransition] = useTransition()

  const canSave = useMemo(
    () => Boolean(name.trim() && slug.trim() && description.trim() && definitionMarkdown.trim()),
    [definitionMarkdown, description, name, slug]
  )

  function toggleRole(role: string, checked: boolean) {
    setSelectedRoles((current) =>
      checked ? [...new Set([...current, role])] : current.filter((item) => item !== role)
    )
    setApprovedTools([])
  }

  function buildPayload() {
    return {
      organizationId,
      skillId: savedSkill?.id ?? null,
      slug,
      name,
      description,
      definitionMarkdown,
      requiresRole: selectedRoles,
      approvedToolSlugs: approvedTools,
      requiresMcp: false,
      mcpProvider: null,
      changeSummary: savedSkill ? 'Actualizacion de skill custom' : 'Primer borrador',
    }
  }

  function handleValidate() {
    startTransition(async () => {
      const result = await validateCustomSkill(buildPayload())
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo validar')
        return
      }
      setValidation(result.validation ?? null)
    })
  }

  function handleSave() {
    startTransition(async () => {
      const result = await createCustomSkill(buildPayload())
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo guardar')
        return
      }
      setSavedSkill(result.skill ?? null)
      toast.success('Skill guardada')
      router.refresh()
    })
  }

  function handlePublish() {
    startTransition(async () => {
      let skillId = savedSkill?.id
      if (!skillId) {
        const saved = await createCustomSkill(buildPayload())
        if (!saved.success || !saved.skill) {
          toast.error(saved.error ?? 'No se pudo guardar')
          return
        }
        setSavedSkill(saved.skill)
        skillId = saved.skill.id
      }

      const published = await publishCustomSkill({
        organizationId,
        skillId,
        changeSummary: 'Publicacion desde admin skills',
      })
      if (!published.success) {
        toast.error(published.error ?? 'No se pudo publicar')
        return
      }
      setSavedSkill(published.skill ?? null)
      toast.success('Skill publicada')
      router.refresh()
    })
  }

  return (
    <section data-testid="custom-skill-editor" className="rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Skill personalizada</h2>
          <p className="text-sm text-muted-foreground">Markdown, roles y tools aprobadas.</p>
        </div>
        <Button type="button" onClick={() => setIsOpen((value) => !value)}>
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
          Nueva skill
        </Button>
      </div>

      {isOpen && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="custom-skill-name">Nombre</Label>
                <Input
                  id="custom-skill-name"
                  data-testid="custom-skill-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-skill-slug">Slug</Label>
                <Input
                  id="custom-skill-slug"
                  data-testid="custom-skill-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-skill-description">Descripcion</Label>
              <Input
                id="custom-skill-description"
                data-testid="custom-skill-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-3">
                {ROLE_OPTIONS.map((role) => (
                  <label
                    key={role.value}
                    className="flex items-center gap-2 rounded-full border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      aria-label={role.label}
                      data-testid={`custom-skill-role-${role.value}`}
                      checked={selectedRoles.includes(role.value)}
                      onCheckedChange={(checked) => toggleRole(role.value, checked === true)}
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-skill-markdown">Markdown</Label>
              <Textarea
                id="custom-skill-markdown"
                data-testid="custom-skill-markdown"
                className="min-h-48 font-mono"
                value={definitionMarkdown}
                onChange={(event) => setDefinitionMarkdown(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                data-testid="custom-skill-validate"
                disabled={!canSave || isPending}
                onClick={handleValidate}
              >
                <HugeiconsIcon
                  icon={isPending ? Loading02Icon : CheckmarkCircle02Icon}
                  className={isPending ? 'size-4 animate-spin' : 'size-4'}
                />
                Validar
              </Button>
              <Button
                type="button"
                variant="secondary"
                data-testid="custom-skill-save"
                disabled={!canSave || isPending}
                onClick={handleSave}
              >
                <HugeiconsIcon
                  icon={isPending ? Loading02Icon : FloppyDiskIcon}
                  className="size-4"
                />
                Guardar
              </Button>
              <Button
                type="button"
                data-testid="custom-skill-publish"
                disabled={!canSave || isPending}
                onClick={handlePublish}
              >
                <HugeiconsIcon icon={isPending ? Loading02Icon : Tick02Icon} className="size-4" />
                Publicar
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tools aprobadas</Label>
              <ApprovedToolsPicker
                tools={availableTools}
                selectedRoles={selectedRoles}
                value={approvedTools}
                onChange={setApprovedTools}
              />
            </div>
            <SkillValidationPanel validation={validation} />
          </div>
        </div>
      )}
    </section>
  )
}
