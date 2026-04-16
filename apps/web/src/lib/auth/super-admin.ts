import { createClient } from '@/lib/supabase/server'

export async function getUserWithSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, isSuperAdmin: false }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  return { user, isSuperAdmin: profile?.is_super_admin === true }
}
