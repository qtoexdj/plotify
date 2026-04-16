'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'

export function BackendStatusBadge() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health')
        if (response.ok) {
          setStatus('ok')
        } else {
          setStatus('error')
        }
      } catch {
        setStatus('error')
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 30000) // Check every 30s

    return () => clearInterval(interval)
  }, [])

  if (status === 'loading') {
    return <Badge variant="secondary">Conectando...</Badge>
  }

  if (status === 'error') {
    return <Badge variant="destructive">Backend desconectado</Badge>
  }

  return <Badge variant="default" className="bg-green-600">Backend activo</Badge>
}
