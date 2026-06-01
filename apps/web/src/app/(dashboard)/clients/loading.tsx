import { SkeletonTable } from '@/components/dashboard/skeleton-card'
import { Card, CardContent } from '@/components/ui/card'

export default function ClientsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2 w-1/3">
          <div className="h-9 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-10 w-32 bg-muted rounded animate-pulse" />
      </div>

      <Card className="border-sidebar-border overflow-hidden">
        <CardContent className="p-6">
          <SkeletonTable />
        </CardContent>
      </Card>
    </div>
  )
}
