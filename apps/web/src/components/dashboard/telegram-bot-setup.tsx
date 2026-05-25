'use client'

import * as React from 'react'
import { useCallback, useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { BotIcon, ChevronRight, Loader2, Trash2, WebhookIcon } from 'lucide-react'

interface BotStatus {
  bot_username: string
  is_active: boolean
}

export function TelegramBotSetup({
  organizationId,
  onBotStatusChange,
}: {
  organizationId: string
  onBotStatusChange?: (hasBot: boolean) => void
}) {
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [token, setToken] = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`http://localhost:8005/api/v1/bots/${organizationId}`)
      if (res.ok) {
        const data = await res.json()
        if (data && data.bot_username) {
          setStatus(data)
          onBotStatusChange?.(true)
        } else {
          setStatus(null)
          onBotStatusChange?.(false)
        }
      } else {
        setStatus(null)
        onBotStatusChange?.(false)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [onBotStatusChange, organizationId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchStatus()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [fetchStatus])

  const handleRegister = async () => {
    if (!token.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`http://localhost:8005/api/v1/bots/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: token, organization_id: organizationId }),
      })
      if (!res.ok) {
        throw new Error('Token inválido o error al registrar.')
      }
      toast.success('Bot configurado exitosamente')
      setToken('')
      await fetchStatus()
    } catch (e) {
      const error = e as Error
      toast.error(error.message || 'Error al conectar el bot.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setIsSubmitting(true)
    try {
      const res = await fetch(`http://localhost:8005/api/v1/bots/${organizationId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success('Bot eliminado. Ya no recibirás notificaciones aquí.')
      await fetchStatus()
    } catch (e) {
      const error = e as Error
      toast.error(error.message || 'Error al eliminar el bot.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardContent className="flex justify-center items-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (status) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BotIcon className="h-5 w-5 text-primary" />
              <CardTitle>Bot Configurado</CardTitle>
            </div>
            <Badge
              variant="default"
              className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-2 animate-pulse" />
              Activo
            </Badge>
          </div>
          <CardDescription>
            Tu organización está utilizando el bot{' '}
            <span className="font-semibold text-foreground">@{status.bot_username}</span>.
          </CardDescription>
        </CardHeader>
        <CardFooter className="pt-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="w-full sm:w-auto">
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar Configuración
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este Bot?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se desconectará este bot y dejará de recibir notificaciones. Los usuarios tendrán
                  que volver a vincular sus cuentas si configuras uno nuevo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sí, eliminar bot'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold">
                1
              </div>
              <CardTitle className="text-lg">Crear Bot en Telegram</CardTitle>
            </div>
            <CardDescription>
              Sigue estos pasos en Telegram para obtener tu propio bot personalizado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <ol className="list-decimal pl-4 space-y-2">
              <li>
                Abre Telegram y busca <strong className="text-foreground">@BotFather</strong>
              </li>
              <li>
                Envíale el mensaje <code className="bg-muted px-1 py-0.5 rounded">/newbot</code>
              </li>
              <li>
                Elige un <strong>nombre</strong> para tu bot (Ej: <em>Inmobiliaria Plotify Bot</em>)
              </li>
              <li>
                Elige un <strong>username</strong> que termine en &quot;bot&quot; (Ej:{' '}
                <em>MiPlotifyBot</em>)
              </li>
              <li>
                Copia el <strong>API Token</strong> que te entregará.
              </li>
            </ol>
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => window.open('https://t.me/BotFather', '_blank')}
            >
              Ir a @BotFather
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/50 shadow-md ring-1 ring-primary/20 bg-background/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-primary/50 via-primary to-primary/50" />
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-[0_0_10px_rgba(var(--primary),0.5)]">
                2
              </div>
              <CardTitle className="text-lg">Conectar Bot</CardTitle>
            </div>
            <CardDescription>
              Pega el token copiado aquí para enlazar este bot con el sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="token" className="text-sm font-medium">
                Access Token
              </label>
              <Input
                id="token"
                type="password"
                placeholder="123456789:ABCDEF..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono bg-muted/50"
              />
              <p className="text-xs text-muted-foreground">
                Tus credenciales se cifrarán y almacenarán de forma segura.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={handleRegister}
              disabled={isSubmitting || !token.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validando...
                </>
              ) : (
                <>
                  <WebhookIcon className="h-4 w-4 mr-2" />
                  Validar y Conectar
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
