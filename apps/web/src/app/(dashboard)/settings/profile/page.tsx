import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from './actions'
import { ProfileSettingsForm } from '@/components/dashboard/profile-settings-form'

export const metadata = {
    title: 'Perfil de Usuario | Plotify',
}

export default async function ProfileSettingsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    const profile = await getProfile(user.id)

    if (!profile) {
        return (
            <div className="p-6 max-w-4xl mx-auto space-y-6">
                <h1 className="text-3xl font-bold text-slate-900">Perfil</h1>
                <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
                    <p className="text-sm text-yellow-800">
                        No se encontró el perfil para tu cuenta. Por favor, contacta a soporte.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Perfil de Usuario</h1>
                <p className="text-slate-600 mt-1">
                    Gestiona tu información personal y datos de contacto.
                </p>
            </div>

            <ProfileSettingsForm profile={profile} email={user.email || ""} />
        </div>
    )
}
