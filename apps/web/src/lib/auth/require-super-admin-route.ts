import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'

export async function requireSuperAdminRoute(request: NextRequest) {
  const supabase = createRouteHandlerClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single()

  if (profile?.is_super_admin !== true) {
    return { response: NextResponse.json({ error: 'Solo super admin' }, { status: 403 }) }
  }

  return { user }
}
