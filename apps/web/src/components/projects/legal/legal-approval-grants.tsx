'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Grant = {
  id: string
  grantee_user_id: string
  active: boolean
  granted_at: string | null
  expires_at: string | null
}

export function grantExpiryLabel(expiresAt: string | null, now = new Date()): string {
  if (!expiresAt) return 'Sin vencimiento'
  const expiry = new Date(expiresAt)
  if (expiry.getTime() <= now.getTime()) return 'Vencida'
  return `Vence ${expiry.toLocaleString('es-CL')}`
}

export function LegalApprovalGrants({ projectId }: { projectId: string }) {
  const [grants, setGrants] = useState<Grant[]>([])
  const [grantee, setGrantee] = useState('')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/legal-approval-grants`)
    const payload = await response.json()
    if (response.ok) setGrants(payload.grants ?? [])
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/projects/${projectId}/legal-approval-grants`)
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) setGrants(payload.grants ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  async function delegate() {
    setError(null)
    const evidence = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${projectId}:${grantee}:${reason}`)
    )
    const evidenceFingerprint = Array.from(new Uint8Array(evidence), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')
    const response = await fetch(`/api/projects/${projectId}/legal-approval-grants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grantee_user_id: grantee,
        reason,
        expires_at: expiresAt || null,
        evidence_fingerprint: evidenceFingerprint,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setError(payload.error ?? 'No se pudo delegar la revisión jurídica')
      return
    }
    setGrantee('')
    setReason('')
    setExpiresAt('')
    await load()
  }

  async function revoke(grantId: string) {
    const revokeReason = window.prompt('Motivo de revocación')?.trim()
    if (!revokeReason) return
    const response = await fetch(
      `/api/projects/${projectId}/legal-approval-grants/${grantId}/revoke`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: revokeReason }),
      }
    )
    if (!response.ok) setError('No se pudo revocar la delegación')
    else await load()
  }

  return (
    <section className="rounded-xl border p-4" aria-label="Delegaciones de revisión jurídica">
      <h2 className="font-semibold">Delegaciones de revisión jurídica</h2>
      <p className="text-sm text-muted-foreground">
        Autoriza a otra persona a aprobar comparecientes. No se permite autodelegación y la
        evidencia interna no se muestra en esta vista.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="grant-user">ID del revisor</Label>
          <Input id="grant-user" value={grantee} onChange={(e) => setGrantee(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="grant-expiry">Vencimiento</Label>
          <Input
            id="grant-expiry"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <Label htmlFor="grant-reason">Motivo</Label>
          <Textarea id="grant-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <Button
        className="mt-3"
        type="button"
        disabled={!grantee.trim() || !reason.trim()}
        onClick={delegate}
      >
        Delegar revisión
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ul className="mt-4 space-y-2">
        {grants.map((grant) => (
          <li
            key={grant.id}
            className="flex items-center justify-between rounded-lg border p-3 text-sm"
          >
            <span>
              {grant.grantee_user_id} ·{' '}
              {grant.active ? grantExpiryLabel(grant.expires_at) : 'Revocada'}
            </span>
            {grant.active ? (
              <Button type="button" variant="outline" size="sm" onClick={() => revoke(grant.id)}>
                Revocar
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
