'use client'

import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { Folder02Icon, UserGroupIcon, UserStar01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface OnboardingChecklistProps {
  hasProjects: boolean
  hasVendors: boolean
  hasClients: boolean
}

export function OnboardingChecklist({
  hasProjects,
  hasVendors,
  hasClients,
}: OnboardingChecklistProps) {
  const steps = [
    {
      id: 'projects',
      number: '1',
      title: 'Crea tu primer proyecto de loteo',
      description:
        'Define la ubicación, el plano y las características generales de tu desarrollo inmobiliario.',
      icon: Folder02Icon,
      href: '/onboarding/new',
      actionLabel: 'Crear Proyecto',
      completed: hasProjects,
    },
    {
      id: 'vendors',
      number: '2',
      title: 'Habilita a un vendedor de tu equipo',
      description:
        'Invita a tus asesores comerciales para que puedan ver los lotes libres, cotizar y reservar en tiempo real.',
      icon: UserStar01Icon,
      href: '/vendors',
      actionLabel: 'Invitar Vendedor',
      completed: hasVendors,
    },
    {
      id: 'clients',
      number: '3',
      title: 'Registra tu primer cliente o lead',
      description:
        'Agrega un prospecto interesado en uno de tus proyectos para iniciar su proceso comercial.',
      icon: UserGroupIcon,
      href: '/clients',
      actionLabel: 'Ver Leads',
      completed: hasClients,
    },
  ]

  const completedCount = steps.filter((s) => s.completed).length
  const progressPercentage = Math.round((completedCount / steps.length) * 100)

  return (
    <Card className="border border-border/80 bg-gradient-to-br from-background via-background to-accent/5 shadow-md overflow-hidden relative group">
      {/* Decorative Brand Gradient Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-brand-gradient" />

      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              ¡Bienvenido a Plotify!
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              Configura tu organización completando esta guía de inicio rápido y comienza a
              gestionar tus loteos de manera inteligente.
            </CardDescription>
          </div>

          {/* Progress Tracker */}
          <div className="flex items-center gap-3 bg-muted/50 border border-border/60 rounded-2xl px-4 py-2 self-start md:self-auto shrink-0 shadow-sm">
            <div className="text-right">
              <span className="text-xs text-muted-foreground block font-medium">Progreso</span>
              <span className="text-sm font-bold text-foreground">
                {completedCount} de {steps.length} completados
              </span>
            </div>
            <div className="relative w-12 h-12 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-muted/30 stroke-current"
                  strokeWidth="3"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-primary stroke-current transition-all duration-500 ease-out"
                  strokeWidth="3.2"
                  strokeDasharray={`${progressPercentage}, 100`}
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-[10px] font-bold text-foreground">
                {progressPercentage}%
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex flex-col justify-between p-5 rounded-2xl border transition-all duration-300 ${
                step.completed
                  ? 'bg-success/5 border-success/20 shadow-inner dark:bg-success/5 dark:border-success/15'
                  : 'bg-background hover:bg-muted/30 border-border/80 hover:border-border hover:shadow-sm'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold text-sm transition-colors ${
                      step.completed
                        ? 'bg-success text-success-foreground border-success shadow-sm'
                        : 'bg-muted/80 text-muted-foreground border-border/80'
                    }`}
                  >
                    {step.completed ? (
                      <HugeiconsIcon icon={Tick02Icon} className="w-5 h-5 stroke-[2.5]" />
                    ) : (
                      step.number
                    )}
                  </div>

                  <div
                    className={`p-2 rounded-xl border ${
                      step.completed
                        ? 'bg-success/10 text-success border-success/15'
                        : 'bg-accent/5 text-accent border-accent/15'
                    }`}
                  >
                    <HugeiconsIcon icon={step.icon} className="w-5 h-5" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h3
                    className={`text-base font-bold leading-snug tracking-tight ${
                      step.completed
                        ? 'text-foreground/80 line-through decoration-muted-foreground/30'
                        : 'text-foreground'
                    }`}
                  >
                    {step.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>

              {!step.completed && (
                <div className="mt-5 pt-3 border-t border-border/40">
                  <Link href={step.href} className="w-full block">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs font-semibold shadow-sm hover:bg-accent/10 hover:text-accent hover:border-accent/30 transition-colors"
                    >
                      {step.actionLabel}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
