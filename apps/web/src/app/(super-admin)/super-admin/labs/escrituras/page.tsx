import { EscriturasLabClient } from './escrituras-lab-client'
import { getEscriturasLabPayload } from '@/lib/labs/escrituras.server'
import { isEscriturasLabEnabled } from '@/lib/labs/escrituras.guard'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function EscriturasLabPage() {
  if (!isEscriturasLabEnabled()) {
    notFound()
  }

  const initialPayload = await getEscriturasLabPayload()
  return <EscriturasLabClient initialPayload={initialPayload} />
}
