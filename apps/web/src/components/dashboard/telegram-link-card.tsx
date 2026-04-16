"use client"

import { useEffect, useState, useRef } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Bot, Send, CheckCircle2, ChevronDown, ChevronUp, Loader2, Unplug } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { unlinkTelegramAction, checkTelegramStatusAction, generateTelegramTokenAction } from "@/app/(dashboard)/agente/integrations/actions"

interface TelegramLinkCardProps {
  profileId: string
  telegramChatId: string | null
  organizationId?: string
}

const CHAT_BASE_URL = process.env.NEXT_PUBLIC_PLOTIFY_CHAT_BASE_URL || "http://127.0.0.1:8005"

export function TelegramLinkCard({ profileId, telegramChatId, organizationId }: TelegramLinkCardProps) {
  const [currentChatId, setCurrentChatId] = useState<string | null>(telegramChatId)
  const [showQR, setShowQR] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [telegramLink, setTelegramLink] = useState<string | null>(null)

  useEffect(() => {
    setCurrentChatId(telegramChatId)
  }, [telegramChatId])

  useEffect(() => {
    // Escuchar el update por Realtime en lugar de usar polling cuando se activa el QR
    if (showQR && !currentChatId) {
      const supabase = createClient()
      
      const channel = supabase
        .channel(`profile-${profileId}-telegram-status`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${profileId}`
          },
          (payload) => {
            const newChatId = payload.new.telegram_chat_id
            if (newChatId) {
              setCurrentChatId(newChatId)
              setShowQR(false)
              toast.success("¡Tu cuenta ha sido vinculada exitosamente con Telegram!")
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [showQR, currentChatId, profileId])

  const generateLink = async () => {
    if (telegramLink) return // Ya se generó

    setIsLoading(true)
    try {
      const response = await generateTelegramTokenAction(profileId, organizationId)

      if (response.error || !response.success) {
        throw new Error(response.error || "Error al generar el token")
      }

      setTelegramLink(response.deep_link)
    } catch (error) {
      console.error(error)
      toast.error("Hubo un error al generar el código QR. Inténtalo de nuevo.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenLink = async () => {
    if (!telegramLink) {
      await generateLink()
    }
    // Después de que termine generateLink() si fue exitoso
    setTelegramLink((currentLink) => {
        if (currentLink) window.open(currentLink, "_blank")
        return currentLink
    });
  }

  const handleToggleQR = async () => {
    if (!showQR && !telegramLink) {
      await generateLink()
    }
    if (telegramLink || !showQR) {
        setShowQR(!showQR)
    }
  }

  const handleUnlink = async () => {
    setIsUnlinking(true)
    try {
      const result = await unlinkTelegramAction(profileId)
      if (result.error) {
        throw new Error(result.error)
      }
      toast.success("Cuenta de Telegram desvinculada exitosamente.")
    } catch (e) {
      const error = e as Error
      toast.error(error.message || "Error al desvincular.")
    } finally {
      setIsUnlinking(false)
    }
  }

  return (
    <Card className="border-muted bg-muted/40 overflow-hidden relative">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-5 w-5 text-[#2AABEE]" />
          Notificaciones de Telegram
          {currentChatId && (
            <Badge variant="secondary" className="ml-auto bg-green-500/10 text-green-600 hover:bg-green-500/20">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Vinculado
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {currentChatId
            ? "Tu cuenta ya está vinculada a Telegram. Recibirás notificaciones al instante."
            : "Vincula tu cuenta para recibir notificaciones en tiempo real sobre aprobaciones y alertas en tu dispositivo móvil."}
        </CardDescription>
      </CardHeader>
      
      {!currentChatId && (
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <Button 
                onClick={handleOpenLink} 
                disabled={isLoading}
                className="bg-[#2AABEE] hover:bg-[#229ED9] text-white w-full sm:w-auto"
            >
              {isLoading && !showQR ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
              Vincular en Dispositivo Actual
            </Button>
            
            <Button 
                variant="outline" 
                onClick={handleToggleQR}
                disabled={isLoading}
                className="w-full sm:w-auto"
            >
              {isLoading && showQR ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (
                  showQR ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />
              )}
              {showQR ? "Ocultar Código QR" : "Mostrar Código QR"}
            </Button>
          </div>

          {showQR && telegramLink && (
            <div className="mt-4 p-6 bg-white rounded-xl border border-border/50 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="bg-white p-2 rounded-lg shadow-sm border">
                  <QRCodeSVG 
                    value={telegramLink} 
                    size={200}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    level="Q"
                    className="rounded-md"
                  />
              </div>
              <div className="space-y-1">
                  <h4 className="font-medium text-slate-900">Escanea desde tu móvil</h4>
                  <p className="text-sm text-slate-500 max-w-sm">
                    Abre la cámara de tu teléfono, escanea el código y presiona &quot;INICIAR&quot; en Telegram.
                    <br />
                    <span className="text-xs text-orange-500">Este código es válido por 15 minutos.</span>
                  </p>
              </div>
            </div>
          )}
        </CardContent>
      )}

      {currentChatId && (
        <CardFooter className="pt-2">
            <Button 
                variant="outline" 
                onClick={handleUnlink}
                disabled={isUnlinking}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {isUnlinking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
              Desvincular Cuenta
            </Button>
        </CardFooter>
      )}
    </Card>
  )
}
