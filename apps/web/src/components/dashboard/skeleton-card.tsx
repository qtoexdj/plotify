import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function SkeletonCard() {
  return (
    <Card className="animate-pulse overflow-hidden flex flex-col border-slate-200 dark:border-slate-800">
      {/* Cover Image Placeholder */}
      <div className="relative aspect-video w-full bg-muted border-b border-border shrink-0" />

      <CardHeader className="pt-4 pb-2 space-y-2">
        <div className="h-5 w-3/4 bg-muted rounded" />
        <div className="h-4 w-1/2 bg-muted rounded" />
      </CardHeader>

      <CardContent className="space-y-5 flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="h-3 w-full bg-muted rounded" />
          <div className="h-3 w-5/6 bg-muted rounded" />

          {/* Avatars Group Placeholder */}
          <div className="mt-4 flex items-center gap-2 pt-2">
            <div className="flex -space-x-2">
              <div className="h-6 w-6 rounded-full bg-muted border-2 border-background" />
              <div className="h-6 w-6 rounded-full bg-muted border-2 border-background" />
              <div className="h-6 w-6 rounded-full bg-muted border-2 border-background" />
            </div>
            <div className="h-3 w-20 bg-muted rounded" />
          </div>
        </div>

        {/* KPIs Grid Placeholder */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/40 space-y-2">
            <div className="h-6 w-10 bg-muted rounded mx-auto" />
            <div className="h-3 w-12 bg-muted rounded mx-auto" />
          </div>
          <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/40 space-y-2">
            <div className="h-6 w-10 bg-muted rounded mx-auto" />
            <div className="h-3 w-12 bg-muted rounded mx-auto" />
          </div>
          <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/40 space-y-2">
            <div className="h-6 w-10 bg-muted rounded mx-auto" />
            <div className="h-3 w-12 bg-muted rounded mx-auto" />
          </div>
          <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/40 space-y-2">
            <div className="h-6 w-10 bg-muted rounded mx-auto" />
            <div className="h-3 w-12 bg-muted rounded mx-auto" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SkeletonTable() {
  return (
    <div className="w-full space-y-3.5 animate-pulse">
      <div className="flex items-center justify-between border-b border-border pb-3.5">
        <div className="h-4 w-1/4 bg-muted rounded" />
        <div className="h-4 w-1/6 bg-muted rounded" />
      </div>
      <div className="space-y-2.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between p-4 border border-border rounded-xl bg-background"
          >
            <div className="flex items-center gap-3 flex-1">
              <div className="h-9 w-9 rounded-full bg-muted" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-1/3 bg-muted rounded" />
                <div className="h-2.5 w-1/4 bg-muted rounded" />
              </div>
            </div>
            <div className="h-5 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
