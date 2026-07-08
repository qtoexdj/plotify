'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  updateEscrituraReviewPolicyAction,
  type EscrituraReviewPolicy,
} from '@/app/(dashboard)/settings/actions'
import { HugeiconsIcon } from '@hugeicons/react'
import { FloppyDiskIcon, StampIcon } from '@hugeicons/core-free-icons'
import { Spinner } from '@/components/ui/spinner'

const POLICY_LABELS: Record<EscrituraReviewPolicy, string> = {
  every_sale: 'Revisar cada venta',
  exceptions_only: 'Solo excepciones',
}

const POLICY_DESCRIPTIONS: Record<EscrituraReviewPolicy, string> = {
  every_sale:
    'Cada venta espera que un abogado apruebe o rechace la revisión jurídica del caso. Al aprobarla, la escritura se aprueba y se entrega sola — es el único acto humano del camino.',
  exceptions_only:
    'La escritura se aprueba y se entrega sola en cuanto la venta queda sin pendientes, sin esperar una revisión jurídica caso por caso. Solo pide atención cuando algo realmente falta.',
}

interface WorkspaceEscrituraReviewPolicyFormProps {
  orgId: string
  isAdmin: boolean
  initialPolicy: EscrituraReviewPolicy
}

export function WorkspaceEscrituraReviewPolicyForm({
  orgId,
  isAdmin,
  initialPolicy,
}: WorkspaceEscrituraReviewPolicyFormProps) {
  const router = useRouter()
  const [policy, setPolicy] = useState<EscrituraReviewPolicy>(initialPolicy)
  const [isPending, setIsPending] = useState(false)

  async function handleChange(next: EscrituraReviewPolicy) {
    if (!isAdmin || next === policy) return

    const previous = policy
    setPolicy(next)
    setIsPending(true)
    const result = await updateEscrituraReviewPolicyAction(orgId, next)
    setIsPending(false)

    if (result.error) {
      setPolicy(previous)
      toast.error(result.error)
      return
    }
    toast.success(`Política actualizada: ${POLICY_LABELS[next]}.`)
    router.refresh()
  }

  return (
    <Card className="shadow-xs border-border/60 bg-card/65 backdrop-blur-xs rounded-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
          <HugeiconsIcon icon={StampIcon} className="h-5 w-5 text-primary" />
          Aprobación de escrituras
        </CardTitle>
        <CardDescription className="text-muted-foreground/80">
          Decide cuánta supervisión legal quieres por venta. Aplica a las ventas siguientes, no a
          los casos ya en curso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          value={policy}
          onValueChange={(value) => handleChange(value as EscrituraReviewPolicy)}
          disabled={!isAdmin || isPending}
        >
          <SelectTrigger className="rounded-lg h-10 sm:max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="every_sale">{POLICY_LABELS.every_sale}</SelectItem>
            <SelectItem value="exceptions_only">{POLICY_LABELS.exceptions_only}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground/80 max-w-xl">{POLICY_DESCRIPTIONS[policy]}</p>
        {isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="h-3 w-3" />
            Guardando...
          </div>
        )}
        {!isAdmin && (
          <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
            <HugeiconsIcon icon={FloppyDiskIcon} className="h-3 w-3" />
            Solo un administrador puede cambiar esta política.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
