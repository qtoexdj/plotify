import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Calendar03Icon,
  SmartPhone01Icon,
  TelegramIcon,
  UserGroupIcon,
  WhatsappIcon,
} from '@hugeicons/core-free-icons'
import { EmptyState } from '@/components/dashboard/empty-state'
import { getUserWithSuperAdmin } from '@/lib/auth/super-admin'
import { getActiveWorkspace } from '@/lib/services/workspace.service'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'
import { PageShell } from '@/components/dashboard/page-shell'
import { PageHeader } from '@/components/dashboard/page-header'
import { BentoGrid, BentoPanel } from '@/components/dashboard/bento-grid'

type LeadRow = Database['public']['Tables']['leads']['Row']

const platformConfig: Record<
  string,
  { label: string; icon: typeof WhatsappIcon; className: string }
> = {
  whatsapp: {
    label: 'WhatsApp',
    icon: WhatsappIcon,
    className: 'bg-success/10 text-success border-success/20',
  },
  telegram: {
    label: 'Telegram',
    icon: TelegramIcon,
    className: 'bg-accent/10 text-accent border-accent/20',
  },
}

function getInitials(name: string | null, phone: string) {
  if (name) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return parts[0].substring(0, 2).toUpperCase()
  }

  return phone.slice(-2)
}

function formatLeadDate(date: string) {
  return new Date(date).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getPlatformConfig(platformName: string) {
  return (
    platformConfig[platformName.toLowerCase()] ?? {
      label: platformName,
      icon: SmartPhone01Icon,
      className: 'bg-muted text-muted-foreground border-border',
    }
  )
}

export default async function ClientsPage() {
  const { user } = await getUserWithSuperAdmin()

  if (!user) {
    redirect('/auth/login')
  }

  const workspace = await getActiveWorkspace(user.id)

  if (!workspace) {
    return (
      <PageShell>
        <Card>
          <CardHeader>
            <CardTitle>No hay Workspace activo</CardTitle>
            <CardDescription>
              Debes pertenecer a una organización para ver los leads.
            </CardDescription>
          </CardHeader>
        </Card>
      </PageShell>
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leads')
    .select('id, name, phone, platform, organization_id, created_at, updated_at')
    .eq('organization_id', workspace.organization.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error('No se pudieron cargar los leads.')
  }

  const leads = data ?? []

  return (
    <PageShell>
      <PageHeader title="Leads" description="Gestiona tus prospectos capturados." />

      {leads.length === 0 ? (
        <EmptyState
          icon={UserGroupIcon}
          title="No hay leads"
          description="Aún no tienes leads registrados. Comparte tus canales de contacto desde los proyectos activos para comenzar a capturar interesados."
          actionLabel="Ver Proyectos"
          actionHref="/projects"
        />
      ) : (
        <BentoGrid>
          <BentoPanel className="xl:col-span-12">
            <div className="bg-muted/30 border-b border-sidebar-border px-6 py-4 space-y-1.5">
              <h3 className="font-semibold text-lg leading-none tracking-tight">
                Cartera de Leads
              </h3>
              <p className="text-sm text-muted-foreground">
                Prospectos asociados a {workspace.organization.name}
              </p>
            </div>
            <CardContent className="p-0">
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-sidebar-border">
                      <TableHead className="w-16">Avatar</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Origen</TableHead>
                      <TableHead>Ingreso</TableHead>
                      <TableHead className="text-right w-24">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead: LeadRow) => {
                      const platform = getPlatformConfig(lead.platform)

                      return (
                        <TableRow key={lead.id} className="border-sidebar-border">
                          <TableCell>
                            <Avatar className="w-8 h-8">
                              <AvatarFallback className="bg-accent/10 text-accent font-semibold text-xs">
                                {getInitials(lead.name, lead.phone)}
                              </AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell className="font-bold text-foreground">
                            {lead.name || 'Lead sin nombre'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{lead.phone}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={platform.className}>
                              <HugeiconsIcon icon={platform.icon} className="w-3.5 h-3.5 mr-1" />
                              {platform.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatLeadDate(lead.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" asChild>
                              <a href={`tel:${lead.phone}`}>Llamar</a>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 gap-4 p-4 md:hidden">
                {leads.map((lead: LeadRow) => {
                  const platform = getPlatformConfig(lead.platform)

                  return (
                    <div
                      key={lead.id}
                      className="flex flex-col p-5 rounded-2xl border border-sidebar-border bg-background/50 hover:bg-muted/10 transition-colors shadow-sm space-y-4"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 border border-sidebar-border shadow-sm shrink-0">
                          <AvatarFallback className="bg-accent/10 text-accent font-bold text-xs">
                            {getInitials(lead.name, lead.phone)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <h4 className="font-bold text-base text-foreground leading-snug truncate">
                            {lead.name || 'Lead sin nombre'}
                          </h4>
                          <p className="text-xs text-muted-foreground truncate">{lead.phone}</p>
                        </div>

                        <Badge variant="outline" className={platform.className}>
                          <HugeiconsIcon icon={platform.icon} className="w-3.5 h-3.5" />
                          <span className="sr-only">{platform.label}</span>
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-sidebar-border text-xs leading-relaxed">
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                            Origen
                          </span>
                          <p className="text-foreground truncate font-medium">{platform.label}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                            Ingreso
                          </span>
                          <p className="text-foreground font-medium flex items-center gap-1">
                            <HugeiconsIcon icon={Calendar03Icon} className="w-3.5 h-3.5" />
                            {formatLeadDate(lead.created_at)}
                          </p>
                        </div>
                      </div>

                      <Button asChild variant="outline" size="sm" className="h-11 font-semibold">
                        <a href={`tel:${lead.phone}`}>Llamar</a>
                      </Button>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </BentoPanel>
        </BentoGrid>
      )}
    </PageShell>
  )
}
