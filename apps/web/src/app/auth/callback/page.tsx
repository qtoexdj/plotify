'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Auth Callback Page (Client-Side)
 * 
 * Maneja el flujo implícito de Supabase Auth para invitaciones.
 * El access_token viene en el hash fragment (#access_token=...)
 * que solo es accesible client-side.
 * 
 * Parsea manualmente el hash y establece la sesión con setSession().
 */
export default function AuthCallbackPage() {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const handleCallback = async () => {
            try {
                const supabase = createClient()
                const url = new URL(window.location.href)
                
                // 1. Manejar flujo PKCE (si hay un 'code' en el search query)
                const code = url.searchParams.get('code')
                if (code) {
                    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
                    if (exchangeError) {
                        console.error('Error intercambiando código:', exchangeError)
                        setError(`Error de autenticación: ${exchangeError.message}`)
                        setTimeout(() => router.push('/auth/login?error=exchange_error'), 2000)
                        return
                    }
                    console.log('Sesión establecida vía PKCE')
                    router.push('/auth/onboarding')
                    return
                }

                // 2. Manejar flujo implícito (si hay tokens en el hash fragment - Invitaciones)
                // El hash viene como #access_token=...&refresh_token=...
                const hash = window.location.hash.substring(1)
                const hashParams = new URLSearchParams(hash)
                
                const accessToken = hashParams.get('access_token')
                const refreshToken = hashParams.get('refresh_token')

                if (accessToken && refreshToken) {
                    console.log('Detectados tokens en hash fragment, estableciendo sesión...')
                    const { error: sessionError } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    })

                    if (sessionError) {
                        console.error('Error estableciendo sesión desde hash:', sessionError)
                        setError(`Error de sesión: ${sessionError.message}`)
                        setTimeout(() => router.push('/auth/login?error=session_error'), 2000)
                        return
                    }

                    console.log('Sesión establecida vía Hash Fragment (Invitación)')
                    router.push('/auth/onboarding')
                    return
                }

                // 3. Fallback: Ver si ya existe una sesión (por si ya se procesó o es un re-entry)
                const { data: { session } } = await supabase.auth.getSession()
                
                if (session) {
                    console.log('Sesión existente detectada')
                    router.push('/auth/onboarding')
                    return
                }

                // 4. Ninguno de los anteriores: Error
                console.warn('No se detectaron credenciales en el callback')
                setError('No se pudieron encontrar credenciales de autenticación en la URL.')
                setTimeout(() => router.push('/auth/login?error=no_credentials'), 3000)

            } catch (err) {
                console.error('Error fatal en callback:', err)
                setError('Ocurrió un error inesperado al procesar tu acceso.')
                setTimeout(() => router.push('/auth/login?error=unexpected'), 3000)
            }
        }

        handleCallback()
    }, [router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
            <div className="text-center space-y-4">
                {error ? (
                    <>
                        <div className="text-red-500 text-lg font-medium">
                            Error de autenticación
                        </div>
                        <p className="text-gray-500 text-sm">{error}</p>
                        <p className="text-gray-400 text-xs">Redirigiendo al login...</p>
                    </>
                ) : (
                    <>
                        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Verificando invitación...
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
