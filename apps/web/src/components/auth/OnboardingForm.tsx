'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeOnboarding } from '@/actions/complete-onboarding.action'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function OnboardingForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    try {
      const result = await completeOnboarding(formData)

      // Si completeOnboarding tiene éxito, llamará redirect() internamente
      // Solo llegamos aquí si hay error
      if (!result.success) {
        setError(result.error || 'Error al completar el registro')
        setLoading(false)
      }
    } catch {
      // redirect() lanza un error especial de Next.js
      // Si llega aquí, podría ser un redirect exitoso o un error real
      router.push('/projects')
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Completa tu Registro</CardTitle>
        <CardDescription>
          Establece tu contraseña y completa tu perfil para empezar a usar Plotify
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nombre</Label>
              <Input
                id="firstName"
                name="firstName"
                placeholder="Juan"
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Apellido</Label>
              <Input
                id="lastName"
                name="lastName"
                placeholder="Pérez"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+56 9 1234 5678"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Repite tu contraseña"
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded p-3">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Guardando...' : 'Completar Registro'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
