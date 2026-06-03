import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { requireSuperAdminRoute } from '@/lib/auth/require-super-admin-route'
import { getEscriturasLabPayload } from '@/lib/labs/escrituras.server'
import { disabledEscriturasLabResponse, isEscriturasLabEnabled } from '@/lib/labs/escrituras.guard'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!isEscriturasLabEnabled()) return disabledEscriturasLabResponse()

  const auth = await requireSuperAdminRoute(request)
  if ('response' in auth) return auth.response

  return NextResponse.json(await getEscriturasLabPayload())
}
