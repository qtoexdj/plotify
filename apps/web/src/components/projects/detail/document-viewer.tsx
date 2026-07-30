'use client'

import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { ViewIcon } from '@hugeicons/core-free-icons'

interface DocumentViewerProps {
  url: string
  title: string
}

export function DocumentViewer({ url, title }: DocumentViewerProps) {
  if (!url) return null

  const previewUrl = `${url}${url.includes('?') ? '&' : '?'}preview=1#view=FitH`

  return (
    <Button variant="outline" size="sm" className="min-h-11" asChild>
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Vista previa de ${title} (abre en una pestaña nueva)`}
      >
        <HugeiconsIcon icon={ViewIcon} className="w-4 h-4 mr-2" />
        Vista previa
      </a>
    </Button>
  )
}
