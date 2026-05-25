'use client'

import { useState, useTransition, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { PromptVersion } from '@/types/v2'

interface SandboxMessage {
  role: 'user' | 'agent'
  content: string
  timestamp: string
}

interface PromptSandboxProps {
  promptId: string
  activeVersion: PromptVersion | null
  organizations: { id: string; name: string }[]
  accessToken: string
}

export function PromptSandbox({ activeVersion, organizations, accessToken }: PromptSandboxProps) {
  const [promptContent, setPromptContent] = useState(activeVersion?.content ?? '')
  const [testMessage, setTestMessage] = useState('')
  const [role, setRole] = useState<string>('lead')
  const [orgId, setOrgId] = useState<string>(organizations[0]?.id ?? '')
  const [history, setHistory] = useState<SandboxMessage[]>([])
  const [isPending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  async function handleTest() {
    if (!testMessage.trim()) {
      toast.error('Escribe un mensaje de prueba')
      return
    }
    if (!orgId) {
      toast.error('Selecciona una organización')
      return
    }

    const userMsg: SandboxMessage = {
      role: 'user',
      content: testMessage,
      timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    }
    setHistory((prev) => [...prev, userMsg])
    setTestMessage('')

    startTransition(async () => {
      try {
        const res = await fetch('/api/prompt-ops/sandbox/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            prompt_content: promptContent,
            test_message: userMsg.content,
            role,
            organization_id: orgId,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? 'Error en sandbox')
        }

        const { response } = await res.json()
        const agentMsg: SandboxMessage = {
          role: 'agent',
          content: response,
          timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        }
        setHistory((prev) => [...prev, agentMsg])

        setTimeout(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
        }, 50)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error inesperado')
      }
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Editor de prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prompt del sandbox</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">
            Edita el prompt para probarlo sin publicar. Los cambios aquí no afectan la versión
            activa.
          </p>
          <Textarea
            value={promptContent}
            onChange={(e) => setPromptContent(e.target.value)}
            className="min-h-80 font-mono text-sm resize-none"
            placeholder="Pega o escribe el prompt a probar..."
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPromptContent(activeVersion?.content ?? '')}
            disabled={!activeVersion}
          >
            Restablecer a v{activeVersion?.version ?? '—'}
          </Button>
        </CardContent>
      </Card>

      {/* Chat de prueba */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Chat de prueba</CardTitle>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="space-y-1">
              <Label className="text-xs">Rol del remitente</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="vendor">Vendedor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Organización</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="flex flex-col flex-1 pt-3 pb-3 gap-3">
          <ScrollArea className="flex-1 h-64 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div ref={scrollRef} className="space-y-3">
              {history.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">
                  Escribe un mensaje para probar el prompt
                </p>
              )}
              {history.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col gap-0.5 ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-800'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                </div>
              ))}
              {isPending && (
                <div className="flex items-start">
                  <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400 italic">
                    Pensando…
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Input
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isPending) {
                  e.preventDefault()
                  handleTest()
                }
              }}
              placeholder="Escribe un mensaje de prueba..."
              className="text-sm"
              disabled={isPending}
            />
            <Button onClick={handleTest} disabled={isPending || !testMessage.trim()}>
              Probar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
