'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { miniAppOrgId, miniAppUrl } from '@/lib/miniapp/routes'

function VendedorRedirectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const orgId = miniAppOrgId(searchParams)
    router.replace(orgId ? miniAppUrl('/mini/ventas', orgId) : '/mini/ventas')
  }, [router, searchParams])

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#121212] text-white">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-2xl">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
      </div>
      <p className="mt-4 text-xs font-medium text-zinc-400">Redirigiendo a tus ventas...</p>
    </div>
  )
}

export default function VendedorRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col items-center justify-center bg-[#121212] text-white">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
        </div>
      }
    >
      <VendedorRedirectContent />
    </Suspense>
  )
}
