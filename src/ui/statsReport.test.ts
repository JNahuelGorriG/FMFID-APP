import { describe, expect, it } from 'vitest'
import { edward } from '../rules/fixtures'
import { statsFileName, statsReport } from './statsReport'

const date = new Date('2026-10-25T12:00:00Z')
const off = { derived: false, techniques: false, breakdown: false, date }
const roy = { ...edward, id: 'roy', name: 'Roy', playerName: 'Marcos', className: 'Arquero' }

describe('informe de stats', () => {
  it('trae el nombre, el rango y los 7 stats del personaje', () => {
    const text = statsReport([edward], off)
    expect(text).toContain('FMFID APP · Stats de un personaje')
    expect(text).toContain('Generado el')
    expect(text).toContain('EDWARD')
    expect(text).toContain('Rango C+')
    for (const label of ['Fuerza', 'Destreza', 'Constitución', 'Percepción', 'Inteligencia', 'Sabiduría', 'Carisma']) {
      expect(text).toContain(`  ${label}:`)
    }
    expect(text).toContain('357,1') // Fuerza de Edward
    expect(text).toMatch(/Maná: 840 · Estamina: 2\.?290/)
    expect(text).toContain('Vida base: 10 leves · 7 medios · 3 letales')
  })

  it('muestra al jugador y la clase si los tiene', () => {
    expect(statsReport([roy], off)).toContain('Jugador: Marcos · Clase: Arquero')
  })

  it('solo incluye lo que se pide', () => {
    const base = statsReport([edward], off)
    expect(base).not.toContain('DAÑO Y DEFENSAS')
    expect(base).not.toContain('POTENCIACIONES')
    expect(base).not.toContain('DESGLOSE DE STATS')

    const derived = statsReport([edward], { ...off, derived: true })
    expect(derived).toContain('DAÑO Y DEFENSAS')
    expect(derived).toContain('Daño físico:')
    expect(derived).toContain('Defensa mágica:')

    const techniques = statsReport([edward], { ...off, techniques: true })
    expect(techniques).toContain('POTENCIACIONES')
    expect(techniques).toContain('Kyushu 25')

    const breakdown = statsReport([edward], { ...off, breakdown: true })
    expect(breakdown).toContain('DESGLOSE DE STATS')
    expect(breakdown).toContain('Fuerza = (Puntos iniciales')
    expect(breakdown).toContain('× 1,1')
  })

  it('con varios personajes los separa y cambia el título', () => {
    const text = statsReport([edward, roy], off)
    expect(text).toContain('FMFID APP · Stats de personajes')
    expect(text.indexOf('EDWARD')).toBeLessThan(text.indexOf('ROY'))
    expect(text.match(/STATS\n/g)?.length).toBe(2)
  })

  it('termina con un salto de línea', () => {
    expect(statsReport([edward], off).endsWith('\n')).toBe(true)
  })
})

describe('nombre del archivo', () => {
  it('con un personaje lleva su nombre, sin tildes ni símbolos', () => {
    expect(statsFileName([edward], date)).toBe('fmfid-stats-edward-2026-10-25.txt')
    expect(statsFileName([{ ...edward, name: 'Hernán el Sabio!' }], date)).toBe('fmfid-stats-hernan-el-sabio-2026-10-25.txt')
  })

  it('con varios lleva solo la fecha', () => {
    expect(statsFileName([edward, roy], date)).toBe('fmfid-stats-2026-10-25.txt')
  })
})
