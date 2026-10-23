import { describe, expect, it } from 'vitest'
import {
  RANKS,
  categoryBonus,
  characterSheet,
  rankFromAverage,
  referenceWeaponBonus,
  tierMultipliers,
} from './index'
import { edward } from './fixtures'
import type { Tiers } from './index'

describe('hoja de personaje', () => {
  const sheet = characterSheet(edward)

  it('stats totales', () => {
    expect(sheet.totals.fuerza).toBeCloseTo(357.14, 6)
    expect(sheet.totals.destreza).toBeCloseTo(253, 6)
    expect(sheet.totals.constitucion).toBeCloseTo(447.64, 6)
    expect(sheet.totals.percepcion).toBeCloseTo(297, 6)
    expect(sheet.totals.inteligencia).toBeCloseTo(115.04, 6)
    expect(sheet.totals.sabiduria).toBeCloseTo(158.04, 6)
    expect(sheet.totals.carisma).toBeCloseTo(173, 6)
  })

  it('promedio y rango', () => {
    expect(sheet.average).toBeCloseTo(477.3243556, 4)
    expect(sheet.rank?.name).toBe('C+')
  })

  it('energías', () => {
    expect(sheet.mana).toBe(840)
    expect(sheet.stamina).toBe(2290)
  })

  it('derivados', () => {
    expect(sheet.derived.physDamageWithWeapon).toBeCloseTo(485.898, 3)
    expect(sheet.derived.physDefenseSA).toBeCloseTo(577.64, 2)
    expect(sheet.derived.magicDefenseSA).toBeCloseTo(237, 2)
    expect(sheet.derived.techniques.ki).toBe(47)
  })
})

describe('rangos de los promedios corregidos del GM', () => {
  const cases: [string, number, string][] = [
    ['Colt', 458, 'C+'],
    ['Saizo', 399, 'C'],
    ['Roy', 319, 'D+'],
    ['Edward', 477, 'C+'],
    ['Conrad', 367, 'C'],
    ['Hernán', 405, 'C+'],
    ['Ciro', 289, 'D+'],
  ]
  it.each(cases)('%s (%d) es rango %s', (_name, average, rank) => {
    expect(rankFromAverage(average)?.name).toBe(rank)
  })
})

describe('tiers y multiplicadores', () => {
  // Colt: Destreza y Percepción primarios (Percepción potenciada por clase),
  // Constitución y Sabiduría terciarios (Constitución según clase).
  const colt: Tiers = {
    destreza: 1, percepcion: 1,
    fuerza: 2, inteligencia: 2, carisma: 2,
    constitucion: 3, sabiduria: 3,
  }

  it('multiplicadores de Colt', () => {
    expect(tierMultipliers(colt, 'percepcion', 'constitucion')).toEqual({
      fuerza: 1, destreza: 1.05, constitucion: 0.95, percepcion: 1.1,
      inteligencia: 1, sabiduria: 0.9, carisma: 1,
    })
  })

  it('valida que la clase apunte a stats del tier correcto', () => {
    expect(() => tierMultipliers(colt, 'fuerza', 'constitucion')).toThrow()
    expect(() => tierMultipliers(colt, 'percepcion', 'carisma')).toThrow()
  })

  it('bono de Categoría: X, X/2 y X/4', () => {
    expect(categoryBonus(40, 1)).toBe(40)
    expect(categoryBonus(40, 2)).toBe(20)
    expect(categoryBonus(40, 3)).toBe(10)
  })
})

describe('"rango F" para armas', () => {
  const e = RANKS[0]
  it('un ajuste que baja del rango E usa los valores fijos', () => {
    expect(referenceWeaponBonus(e, { kind: 'pequena', rankSteps: -1 })).toBe(0)
    expect(referenceWeaponBonus(e, { kind: 'mediana', rankSteps: -1 })).toBe(5)
    expect(referenceWeaponBonus(e, { kind: 'grande', rankSteps: -3 })).toBe(8)
    expect(referenceWeaponBonus(e, { kind: 'pesada', rankSteps: -1 })).toBe(13)
  })

  it('sin bajar de E, usa la tabla normal', () => {
    expect(referenceWeaponBonus(e, { kind: 'mediana', rankSteps: 0 })).toBe(15)
    expect(referenceWeaponBonus(RANKS[1], { kind: 'mediana', rankSteps: -1 })).toBe(15)
  })
})
