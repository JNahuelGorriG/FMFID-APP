import { describe, expect, it } from 'vitest'
import { STAT_NAMES, characterSheet, loseTemporaryTraining, lostPoints, previewTrainingLoss, setTraining, trainingOf, trainingTotals, validateCharacter } from './index'
import type { Character, StatName } from './index'
import { edward } from './fixtures'

/** Edward con estos puntos temporales (el resto de su entrenamiento queda como estaba). */
const withTemp = (temps: Partial<Record<StatName, number>>): Character => {
  const sources = { ...edward.sources }
  for (const [stat, temp] of Object.entries(temps)) sources[stat as StatName] = { ...sources[stat as StatName], entrenamientoTemp: temp }
  return { ...edward, sources }
}

describe('entrenamiento permanente y temporal', () => {
  it('un personaje sin dato temporal tiene 0 temporal, y el permanente es el de siempre', () => {
    expect(trainingOf(edward, 'fuerza')).toEqual({ permanent: edward.sources.fuerza.entrenamiento, temporary: 0 })
    expect(trainingTotals(edward).temporary).toBe(0)
  })

  it('suma los dos tipos en los 7 stats', () => {
    const c = withTemp({ fuerza: 10, destreza: 5, carisma: 3 })
    expect(trainingTotals(c).temporary).toBe(18)
    expect(trainingTotals(c).permanent).toBe(STAT_NAMES.reduce((s, n) => s + edward.sources[n].entrenamiento, 0))
  })

  it('los dos suman al stat sin multiplicador', () => {
    const before = characterSheet(edward).totals.fuerza
    const after = characterSheet(withTemp({ fuerza: 12 })).totals.fuerza
    expect(after - before).toBeCloseTo(12, 6) // plano: no lo multiplica el N
  })

  it('el entrenamiento no puede ser negativo', () => {
    const bad = { ...edward, sources: { ...edward.sources, fuerza: { ...edward.sources.fuerza, entrenamientoTemp: -1 } } }
    expect(validateCharacter(bad).join(' ')).toMatch(/entrenamiento de fuerza no puede ser negativo/)
    expect(validateCharacter(withTemp({ fuerza: 0 }))).toEqual([])
  })
})

describe('perder puntos temporales', () => {
  it('la primera mitad quita la mitad (si es impar queda el punto de más) y "todo" quita todo', () => {
    expect([10, 5, 4, 1, 0].map((n) => lostPoints(n, 'mitad'))).toEqual([5, 2, 2, 0, 0])
    expect([10, 5, 1, 0].map((n) => lostPoints(n, 'todo'))).toEqual([10, 5, 1, 0])
    expect(lostPoints(-3, 'mitad')).toBe(0)
    expect(lostPoints(-3, 'todo')).toBe(0)
  })

  it('la vista previa solo lista los stats que cambian', () => {
    const c = withTemp({ fuerza: 10, destreza: 5, percepcion: 1 })
    expect(previewTrainingLoss(c, 'mitad')).toEqual([
      { stat: 'fuerza', before: 10, after: 5 },
      { stat: 'destreza', before: 5, after: 3 },
    ]) // con 1 punto, la mitad es 0: no cambia
    expect(previewTrainingLoss(c, 'todo').map((p) => p.stat)).toEqual(['fuerza', 'destreza', 'percepcion'])
    expect(previewTrainingLoss(edward, 'todo')).toEqual([])
  })

  it('la primera mitad actúa en los 7 stats y no toca el permanente ni nada más', () => {
    const c = withTemp({ fuerza: 10, destreza: 5, carisma: 8 })
    const after = loseTemporaryTraining(c, 'mitad')
    expect(trainingOf(after, 'fuerza').temporary).toBe(5)
    expect(trainingOf(after, 'destreza').temporary).toBe(3)
    expect(trainingOf(after, 'carisma').temporary).toBe(4)
    for (const stat of STAT_NAMES) {
      expect(trainingOf(after, stat).permanent).toBe(trainingOf(c, stat).permanent)
      expect({ ...after.sources[stat], entrenamientoTemp: 0 }).toEqual({ ...c.sources[stat], entrenamientoTemp: 0 })
    }
    expect(trainingOf(c, 'fuerza').temporary).toBe(10) // el original no cambia
  })

  it('"todo" deja los temporales en 0 y los stats bajan exactamente lo perdido', () => {
    const c = withTemp({ fuerza: 10, destreza: 5 })
    const before = characterSheet(c).totals
    const after = characterSheet(loseTemporaryTraining(c, 'todo')).totals
    expect(trainingTotals(loseTemporaryTraining(c, 'todo')).temporary).toBe(0)
    expect(before.fuerza - after.fuerza).toBeCloseTo(10, 6)
    expect(before.destreza - after.destreza).toBeCloseTo(5, 6)
    expect(after.carisma).toBeCloseTo(before.carisma, 6)
  })

  it('primero la mitad y después todo pierde todo, y repetir la mitad sigue bajando', () => {
    const c = withTemp({ fuerza: 10 })
    const half = loseTemporaryTraining(c, 'mitad')
    expect(trainingOf(half, 'fuerza').temporary).toBe(5)
    expect(trainingOf(loseTemporaryTraining(half, 'todo'), 'fuerza').temporary).toBe(0)
    expect(trainingOf(loseTemporaryTraining(half, 'mitad'), 'fuerza').temporary).toBe(3)
  })

  it('sin puntos temporales no cambia nada', () => {
    expect(loseTemporaryTraining(edward, 'todo').sources).toEqual(edward.sources)
  })
})

describe('cargar el entrenamiento', () => {
  it('cambia solo lo que cambió y no inventa el dato temporal cuando sigue en 0', () => {
    const next = setTraining(edward, { fuerza: { permanent: 60, temporary: 0 }, destreza: { permanent: edward.sources.destreza.entrenamiento, temporary: 7 } })
    expect(next.sources.fuerza.entrenamiento).toBe(60)
    expect('entrenamientoTemp' in next.sources.fuerza).toBe(false) // seguía en 0: no se agrega
    expect(next.sources.destreza.entrenamientoTemp).toBe(7)
    expect(next.sources.carisma).toBe(edward.sources.carisma) // lo que no se tocó es el mismo objeto
  })

  it('puede cambiar solo un tipo', () => {
    const next = setTraining(withTemp({ fuerza: 4 }), { fuerza: { temporary: 9 } })
    expect(trainingOf(next, 'fuerza')).toEqual({ permanent: edward.sources.fuerza.entrenamiento, temporary: 9 })
  })
})
