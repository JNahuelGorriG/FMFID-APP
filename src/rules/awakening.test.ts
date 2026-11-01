import { describe, expect, it } from 'vitest'
import { STAT_NAMES, addAwakening, characterSheet, commonAwakening, setAwakening } from './index'
import { edward } from './fixtures'

const flatAwakening = (c: typeof edward) => STAT_NAMES.map((s) => c.sources[s].despertar)

describe('despertar de todos los stats', () => {
  it('detecta si es el mismo en los 7 stats', () => {
    expect(commonAwakening(setAwakening(edward, 30))).toBe(30)
    const uneven = { ...edward, sources: { ...edward.sources, fuerza: { ...edward.sources.fuerza, despertar: 99 } } }
    expect(commonAwakening(setAwakening(uneven, 0))).toBe(0)
    expect(commonAwakening(uneven)).toBeNull()
  })

  it('"poner" deja el mismo valor en los 7 stats, sin tocar el resto de las fuentes', () => {
    const after = setAwakening(edward, 40)
    expect(flatAwakening(after)).toEqual(Array(7).fill(40))
    for (const stat of STAT_NAMES) {
      expect({ ...after.sources[stat], despertar: 0 }).toEqual({ ...edward.sources[stat], despertar: 0 })
    }
    expect(edward.sources.fuerza.despertar).not.toBe(40) // no modifica el original
  })

  it('"sumar" suma lo mismo a cada stat, aunque hoy tengan valores distintos', () => {
    const before = { ...edward, sources: { ...edward.sources, fuerza: { ...edward.sources.fuerza, despertar: 10 }, carisma: { ...edward.sources.carisma, despertar: 25 } } }
    const after = addAwakening(before, 20)
    expect(after.sources.fuerza.despertar).toBe(30)
    expect(after.sources.carisma.despertar).toBe(45)
    expect(after.sources.destreza.despertar).toBe(edward.sources.destreza.despertar + 20)
  })

  it('nunca baja de 0', () => {
    expect(flatAwakening(setAwakening(edward, -5))).toEqual(Array(7).fill(0))
    expect(flatAwakening(addAwakening(setAwakening(edward, 10), -50))).toEqual(Array(7).fill(0))
  })

  it('cada stat sube exactamente lo que se sumó: el despertar no lleva multiplicador', () => {
    const before = characterSheet(edward).totals
    const after = characterSheet(addAwakening(edward, 20)).totals
    for (const stat of STAT_NAMES) expect(after[stat] - before[stat]).toBeCloseTo(20, 6)
  })

  it('sube el promedio y puede subir el rango', () => {
    const before = characterSheet(edward)
    const after = characterSheet(addAwakening(edward, 100))
    expect(after.average).toBeGreaterThan(before.average + 90)
  })
})
