import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * El deep link de compartir lote debe usar el bot_username real de la
 * organización (entregado por la sesión), nunca un nombre hardcodeado.
 * Además la lista de ventas no debe renderizar blockers vacíos.
 */

const LOT_SHEET = path.resolve(__dirname, '..', 'src', 'app', 'mini', 'mapa', 'lot-sheet.tsx')
const VENTAS = path.resolve(__dirname, '..', 'src', 'app', 'mini', 'ventas', 'page.tsx')

describe('Compartir lote usa el bot de la org', () => {
  const source = fs.readFileSync(LOT_SHEET, 'utf-8')

  it('construye el link con bot_username de la sesión', () => {
    expect(source).toContain('bot_username')
    expect(source).toContain('t.me/')
  })

  it('no hardcodea ningún nombre de bot', () => {
    expect(source).not.toContain('PlotifyBot')
    expect(source).not.toContain("const botUsername = '")
  })
})

describe('Lista de ventas no renderiza blockers vacíos', () => {
  const source = fs.readFileSync(VENTAS, 'utf-8')

  it('accede al primer blocker humanizado de forma segura', () => {
    expect(source).toMatch(/blockers_humanizados\??\.\[0\]/)
    expect(source).not.toContain('{venta.blockers_humanizados[0]}')
  })
})
