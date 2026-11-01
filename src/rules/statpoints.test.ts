import { describe, expect, it } from 'vitest'
import { POINT_SOURCES, STAT_NAMES, characterSheet, commonPoints, raisePoints } from './index'
import { edward } from './fixtures'

const values = (c: typeof edward, source: (typeof POINT_SOURCES)[number]) => STAT_NAMES.map((s) => c.sources[s][source])

describe('subir puntos de stats', () => {
  it('se puede elegir entre mérito, despertar, regalo y otros', () => {
    expect([...POINT_SOURCES]).toEqual(['merito', 'despertar', 'regalo', 'otros'])
  })

  it('"sumar" suma lo mismo solo a los stats elegidos y a la fuente elegida', () => {
    const after = raisePoints(edward, 'merito', ['fuerza', 'carisma'], 5, 'sumar')
    expect(after.sources.fuerza.merito).toBe(edward.sources.fuerza.merito + 5)
    expect(after.sources.carisma.merito).toBe(edward.sources.carisma.merito + 5)
    // los otros stats y las otras fuentes no cambian
    expect(after.sources.destreza).toEqual(edward.sources.destreza)
    expect({ ...after.sources.fuerza, merito: 0 }).toEqual({ ...edward.sources.fuerza, merito: 0 })
    expect(edward.sources.fuerza.merito).not.toBe(after.sources.fuerza.merito) // no modifica el original
  })

  it('"poner" deja el mismo valor en los stats elegidos', () => {
    const after = raisePoints(edward, 'despertar', STAT_NAMES, 40, 'poner')
    expect(values(after, 'despertar')).toEqual(Array(7).fill(40))
  })

  it('funciona con las cuatro fuentes', () => {
    for (const source of POINT_SOURCES) {
      const after = raisePoints(edward, source, ['percepcion'], 7, 'sumar')
      expect(after.sources.percepcion[source]).toBe(edward.sources.percepcion[source] + 7)
    }
  })

  it('nunca baja de 0', () => {
    expect(values(raisePoints(edward, 'regalo', STAT_NAMES, -5, 'poner'), 'regalo')).toEqual(Array(7).fill(0))
    expect(values(raisePoints(raisePoints(edward, 'otros', STAT_NAMES, 10, 'poner'), 'otros', STAT_NAMES, -50, 'sumar'), 'otros')).toEqual(Array(7).fill(0))
  })

  it('sin stats elegidos no cambia nada', () => {
    expect(raisePoints(edward, 'merito', [], 99, 'sumar').sources).toEqual(edward.sources)
  })

  it('detecta si es el mismo valor en los stats elegidos', () => {
    const set = raisePoints(edward, 'despertar', STAT_NAMES, 30, 'poner')
    expect(commonPoints(set, 'despertar')).toBe(30)
    expect(commonPoints(raisePoints(set, 'despertar', ['fuerza'], 99, 'poner'), 'despertar')).toBeNull()
    expect(commonPoints(raisePoints(set, 'despertar', ['fuerza'], 99, 'poner'), 'despertar', ['destreza', 'carisma'])).toBe(30)
    expect(commonPoints(set, 'despertar', [])).toBeNull()
  })

  it('cada stat sube exactamente lo que se sumó: son fuentes planas, sin multiplicador', () => {
    const before = characterSheet(edward).totals
    for (const source of POINT_SOURCES) {
      const after = characterSheet(raisePoints(edward, source, ['fuerza', 'sabiduria'], 20, 'sumar')).totals
      expect(after.fuerza - before.fuerza).toBeCloseTo(20, 6)
      expect(after.sabiduria - before.sabiduria).toBeCloseTo(20, 6)
      expect(after.destreza).toBeCloseTo(before.destreza, 6)
    }
  })
})
