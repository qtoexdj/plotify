'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VariableMatrix } from '@/components/projects/legal/variable-matrix/variable-matrix'

/**
 * SDD 013 US4 — Centro de Control Legal unificado. La matriz de variables por
 * productor (`VariableMatrix`) es la superficie principal. Los antiguos paneles
 * tecnicos quedan fuera de esta vista para que el abogado apruebe el molde sin
 * navegar ruido de diagnostico.
 */

interface LegalControlCenterProps {
  projectId: string
  projectName: string
}

export function LegalControlCenter({ projectId, projectName }: LegalControlCenterProps) {
  return (
    <section id="variables-legales" className="space-y-6" aria-label="Centro de Control Legal">
      <div className="flex flex-col gap-2 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Centro de Control Legal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Variables, evidencia y brechas de escritura para {projectName}.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          asChild
          className="self-start md:self-auto"
        >
          <Link href={`/documentos/matriz/proyecto/${projectId}`}>
            <ExternalLink className="size-4" aria-hidden />
            Ver matriz de escritura
          </Link>
        </Button>
      </div>

      <VariableMatrix projectId={projectId} projectName={projectName} />
    </section>
  )
}
