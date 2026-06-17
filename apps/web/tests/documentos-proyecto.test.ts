import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

function read(relative: string) {
  return fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf-8')
}

describe('T009 - Documentos por proyecto', () => {
  it('carga proyectos y expone accesos por proyecto a escritura y variables legales', () => {
    const source = read('src/app/(dashboard)/documentos/page.tsx')

    expect(source).toContain("fetch('/api/projects')")
    expect(source).toContain('aria-label="Cambiar proyecto"')
    expect(source).toContain('Matriz de escritura del proyecto')
    expect(source).toContain('Matriz de variables del proyecto')
    expect(source).toContain('/documentos/matriz/proyecto/')
    expect(source).toContain('?tab=legal#variables-legales')
    expect(source).toContain('No crea una entidad nueva de revisión.')
    expect(source).not.toContain('variable_resolutions')
    expect(source).not.toContain('legal-variable-editor')
  })

  it('monta la mesa de escritura desde la matriz del proyecto sin crear una vista paralela', () => {
    const page = read('src/app/(dashboard)/documentos/matriz/proyecto/[projectId]/page.tsx')
    const mesa = read('src/components/documents/mesa/mesa-escritura.tsx')
    const client = read('src/lib/documents/matriz-client.ts')
    const route = read('src/app/api/escritura-matrices/project/[projectId]/route.ts')

    expect(page).toContain('MesaEscritura')
    expect(page).toContain('projectId={projectId}')
    expect(mesa).toContain('getMatrizProject')
    expect(mesa).toContain('getMatrizCase')
    expect(client).toContain('/api/escritura-matrices/project/')
    expect(route).toContain('/api/v1/escritura-matrices/project/')
    expect(route).toContain('resolveProjectScope')
  })

  it('abre el Centro Legal existente al navegar con tab legal y ancla de variables', () => {
    const projectPage = read('src/app/(dashboard)/projects/[projectId]/page.tsx')
    const legalCenter = read('src/components/projects/detail/legal-control-center.tsx')

    expect(projectPage).toContain('useSearchParams')
    expect(projectPage).toContain("requestedTab === 'legal'")
    expect(legalCenter).toContain('id="variables-legales"')
  })

  it('ordena los subitems de Documentos como Escrituras, Historial y Plantillas', () => {
    const sidebar = read('src/components/app-sidebar.tsx')
    const documentos = sidebar.indexOf("title: 'Documentos'")
    const escrituras = sidebar.indexOf("title: 'Escrituras'", documentos)
    const historial = sidebar.indexOf("title: 'Historial'", documentos)
    const plantillas = sidebar.indexOf("title: 'Plantillas'", documentos)

    expect(documentos).toBeGreaterThanOrEqual(0)
    expect(escrituras).toBeGreaterThan(documentos)
    expect(historial).toBeGreaterThan(escrituras)
    expect(plantillas).toBeGreaterThan(historial)
  })
})
