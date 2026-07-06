import { cn } from '@/lib/utils'
import { BrandMarkPaths } from '@/components/ui/brand-mark-paths'

/**
 * Isotipo estático de marca (sin animación) para sidebar, login y otros
 * usos fijos de la app. Para estados de carga usar `Spinner`/`BrandLoader`.
 */
function BrandMark({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn('text-foreground', className)}
      {...props}
    >
      <BrandMarkPaths dataFill="currentColor" />
    </svg>
  )
}

export { BrandMark }
