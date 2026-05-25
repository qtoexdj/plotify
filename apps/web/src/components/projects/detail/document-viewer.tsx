'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { ViewIcon } from '@hugeicons/core-free-icons'

interface DocumentViewerProps {
  url: string
  title: string
}

export function DocumentViewer({ url, title }: DocumentViewerProps) {
  if (!url) return null

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:flex">
          <HugeiconsIcon icon={ViewIcon} className="w-4 h-4 mr-2" />
          Ver
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl w-[90vw] h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 w-full bg-slate-100/50 dark:bg-slate-900/50">
          <iframe src={`${url}#view=FitH`} className="w-full h-full border-0 block" title={title} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
