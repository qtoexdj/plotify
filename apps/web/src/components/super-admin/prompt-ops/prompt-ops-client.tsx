'use client'

import { useEffect, useState } from 'react'
import type { PromptWithActiveVersion } from '@/types/v2'
import { PromptOpsTable } from './prompt-ops-table'

export function PromptOpsClient({ endpoint = '/api/prompt-ops' }: { endpoint?: string }) {
  const [prompts, setPrompts] = useState<PromptWithActiveVersion[]>([])
  useEffect(() => {
    void fetch(endpoint, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('denied'))))
      .then((payload: { prompts?: PromptWithActiveVersion[] }) => setPrompts(payload.prompts ?? []))
      .catch(() => setPrompts([]))
  }, [endpoint])
  return <PromptOpsTable prompts={prompts} />
}
