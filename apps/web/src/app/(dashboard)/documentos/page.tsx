import { redirect } from 'next/navigation'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { DocumentosClient } from './documentos-client'

export const metadata = {
  title: 'Documentos legales | Plotify',
}

export default async function DocumentosPage() {
  const { user } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  const workspace = await getActiveWorkspace(user.id)

  // Guard server-side: si no tiene workspace o no es administrador, redirigir
  if (!workspace || workspace.role !== 'admin') {
    redirect('/dashboard')
  }

  return <DocumentosClient />
}
