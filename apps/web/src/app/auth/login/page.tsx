import { LoginForm } from '@/components/auth/LoginForm'
import { ModeToggle } from '@/components/mode-toggle'
import Image from 'next/image'
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4 overflow-hidden">
      <InteractiveGridPattern
        className={cn('mask-[radial-gradient(600px_circle_at_center,white,transparent)]')}
        width={20}
        height={20}
        squares={[80, 80]}
        squaresClassName="hover:fill-blue-500"
      />

      <div className="absolute top-4 right-4 z-50">
        <ModeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex flex-col items-center justify-center text-center">
          <Image
            src="/plotify_logo_ligth.png"
            alt="Plotify Logo"
            width={200}
            height={75}
            className="mb-4 block dark:hidden"
            priority
          />
          <Image
            src="/plotify_logo_dark.png"
            alt="Plotify Logo"
            width={200}
            height={75}
            className="mb-4 hidden dark:block"
            priority
          />
          <p className="text-muted-foreground">Sistema de gestión de loteos</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
