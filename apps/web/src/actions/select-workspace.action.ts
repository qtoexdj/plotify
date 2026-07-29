'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/services/workspace.service'
import { createClient } from '@/lib/supabase/server'

export async function selectWorkspaceAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId')
  if (typeof organizationId !== 'string' || !organizationId) {
    throw new Error('WORKSPACE_SELECTION_REQUIRED')
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('AUTHENTICATION_REQUIRED')

  const { data: membership, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error || !membership) throw new Error('WORKSPACE_MEMBERSHIP_REQUIRED')

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, membership.organization_id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  revalidatePath('/', 'layout')
}
