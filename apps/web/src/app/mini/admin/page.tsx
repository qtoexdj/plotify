'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { miniAppOrgId, miniAppUrl } from '@/lib/miniapp/routes'

function AdminRedirectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const orgId = miniAppOrgId(searchParams)
    router.replace(orgId ? miniAppUrl('/mini/bandeja', orgId) : '/mini/bandeja')
  }, [router, searchParams])

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
      <p className="mt-4 text-sm text-gray-400">Redirigiendo a tu bandeja...</p>
    </div>
  )
}

export default function AdminRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col items-center justify-center bg-[#17212b] text-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2481cc] border-t-transparent"></div>
          <p className="mt-4 text-sm text-gray-400">Cargando administrador...</p>
        </div>
      }
    >
      <AdminRedirectContent />
    </Suspense>
  )
}
