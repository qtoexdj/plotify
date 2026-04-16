import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type { ProcessStage } from '@/types/database.types'

interface StageStepperProps {
    currentStage: ProcessStage
}

const STAGES = [
    { id: 'espera_firma_reserva', label: 'Reserva' },
    { id: 'reserva_firmada', label: 'Doc Reserva' },
    { id: 'espera_firma_escritura', label: 'Escritura' },
    { id: 'escritura_firmada', label: 'Escriturado' }
]

export function StageStepper({ currentStage }: StageStepperProps) {
    const currentIndex = STAGES.findIndex(s => s.id === currentStage)

    return (
        <div className="w-full space-y-4">
            <div className="relative flex flex-col gap-2">
                {STAGES.map((step, index) => {
                    const isCompleted = index < currentIndex
                    const isCurrent = index === currentIndex

                    return (
                        <div key={step.id} className="flex items-center gap-3">
                            <div className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                                isCompleted && "border-primary bg-primary text-primary-foreground",
                                isCurrent && "border-primary text-primary",
                                !isCompleted && !isCurrent && "border-muted text-muted-foreground"
                            )}>
                                {isCompleted ? (
                                    <HugeiconsIcon icon={Tick02Icon} className="h-4 w-4" />
                                ) : (
                                    <span>{index + 1}</span>
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className={cn(
                                    "text-sm font-medium",
                                    isCurrent && "text-foreground",
                                    !isCurrent && "text-muted-foreground"
                                )}>
                                    {step.label}
                                </span>
                                {isCurrent && (
                                    <span className="text-xs text-muted-foreground">En curso</span>
                                )}
                            </div>
                            {index !== STAGES.length - 1 && (
                                <div className="absolute left-4 top-8 h-full w-[2px] bg-border -z-10 hidden" />
                            )}
                        </div>
                    )
                })}
                {/* Visual connector line - Simplification: just vertical stack for now */}
            </div>
        </div>
    )
}
