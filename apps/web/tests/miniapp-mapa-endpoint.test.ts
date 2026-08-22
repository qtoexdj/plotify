import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * El mapa de la mini app debe consumir el endpoint de proyectos de la mini app
 * (GET /api/v1/miniapp/proyectos vía proxy), no el endpoint del CRM web
 * (/api/projects) que autentica con cookies de Supabase — dentro de Telegram
 * no existen esas cookies y el mapa quedaba en error 401.
 */

const PAGE = path.resolve(__dirname, '..', 'src', 'app', 'mini', 'mapa', 'page.tsx')
const PROXY = path.resolve(__dirname, '..', 'src', 'app', 'api', 'miniapp', 'proyectos', 'route.ts')

describe('Mapa miniapp usa el endpoint correcto de proyectos', () => {
  it('la página consulta /api/miniapp/proyectos y no /api/projects', () => {
    const source = fs.readFileSync(PAGE, 'utf-8')
    expect(source).toContain('/api/miniapp/proyectos')
    expect(source).not.toMatch(/fetch\(['"`]\/api\/projects['"`]/)
  })

  it('existe el proxy Next hacia el microservicio', () => {
    const source = fs.readFileSync(PROXY, 'utf-8')
    expect(source).toContain('/api/v1/miniapp/proyectos')
  })

  it('el contenedor del mapa permanece montado en el DOM y se sincroniza reactivamente con mapInstance', () => {
    const source = fs.readFileSync(PAGE, 'utf-8')
    expect(source).toContain('mapContainerRef')
    expect(source).toContain('setMapInstance')
    expect(source).toContain('styledata')
    // No debe haber un early return que desmonte el contenedor del mapa
    expect(source).not.toMatch(/if\s*\([^)]*loading[^)]*\)\s*return\s*\(<div[^>]*>[\s\S]*?Cargando visor/)
  })

  it('la política CSP incluye demotiles.maplibre.org en connect-src para permitir fuentes y glifos', () => {
    const cspSource = fs.readFileSync(
      path.resolve(__dirname, '..', 'src', 'lib', 'security', 'content-security-policy.ts'),
      'utf-8'
    )
    expect(cspSource).toContain('https://demotiles.maplibre.org')
  })
})

