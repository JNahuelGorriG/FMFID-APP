import { describe, expect, it } from 'vitest'
import {
  RANKS,
  applyWounds,
  armorBonus,
  armorUses,
  derivedStats,
  mitigateWithArmor,
  rankFromAverage,
  rankIndex,
  resistanceResult,
  shiftRank,
  techniqueLevel,
  weaponBonus,
  woundCategory,
  woundsFromTable,
} from './index'
import type { DerivedConfig, Stats } from './index'

// Tabla de equipo del Excel (valores calculados), por rango:
// [armadura ligera, mediana, pesada, arma pequeña, mediana, grande, pesada]
const EQUIPMENT_TABLE: Record<string, number[]> = {
  'SSS+': [450, 675, 900, 340, 450, 565, 900],
  SSS: [380, 570, 760, 285, 380, 475, 760],
  'SS+': [320, 480, 640, 240, 320, 400, 640],
  SS: [270, 400, 535, 200, 270, 335, 535],
  'S+': [225, 335, 445, 170, 225, 280, 445],
  S: [190, 280, 375, 140, 190, 235, 375],
  'A+': [160, 240, 320, 120, 160, 200, 320],
  A: [135, 205, 270, 105, 135, 170, 270],
  'B+': [115, 175, 230, 90, 115, 145, 230],
  B: [100, 145, 195, 75, 100, 120, 195],
  'C+': [80, 120, 160, 60, 80, 100, 160],
  C: [65, 100, 130, 50, 65, 80, 130],
  'D+': [50, 75, 100, 40, 50, 65, 100],
  D: [40, 55, 75, 30, 40, 45, 75],
  'E+': [25, 40, 50, 20, 25, 30, 50],
  E: [15, 20, 25, 10, 15, 15, 25],
}

describe('equipo', () => {
  it('bonos de armas y armaduras coinciden con la tabla del Excel en los 16 rangos', () => {
    for (const rank of RANKS) {
      const expected = EQUIPMENT_TABLE[rank.name]
      expect(
        [
          armorBonus(rank, 'ligera'),
          armorBonus(rank, 'mediana'),
          armorBonus(rank, 'pesada'),
          weaponBonus(rank, 'pequena'),
          weaponBonus(rank, 'mediana'),
          weaponBonus(rank, 'grande'),
          weaponBonus(rank, 'pesada'),
        ],
        rank.name,
      ).toEqual(expected)
    }
  })

  it('usos de armadura', () => {
    expect(armorUses('S', 'ligera')).toEqual({ total: 19, medio: 19, fuerte: 10, letal: 6 })
    expect(armorUses('E', 'pesada')).toEqual({ total: 8, medio: 8, fuerte: 4, letal: 3 })
    expect(armorUses('A+', 'ligera')).toBeNull()
  })

  it('desplazamiento de rango', () => {
    const a = RANKS[rankIndex('A')]
    expect(shiftRank(a, 1).name).toBe('A+')
    expect(shiftRank(a, -1).name).toBe('B+')
    expect(shiftRank(RANKS[0], -3).name).toBe('E')
    expect(shiftRank(RANKS[15], 2).name).toBe('SSS+')
  })

  it('nivel Y de potenciaciones', () => {
    expect(techniqueLevel(null)).toBe(0)
    expect(techniqueLevel(RANKS[rankIndex('E')])).toBe(1)
    expect(techniqueLevel(RANKS[rankIndex('C+')])).toBe(3)
    expect(techniqueLevel(RANKS[rankIndex('SSS+')])).toBe(8)
  })
})

describe('stats derivados de Edward (súper stat físico, rango C+)', () => {
  const stats: Stats = {
    fuerza: 357.14,
    destreza: 253,
    constitucion: 447.64,
    percepcion: 297,
    inteligencia: 115.04,
    sabiduria: 158.04,
    carisma: 173,
  }
  const config: DerivedConfig = {
    physDamageWeapon: { kind: 'pesada', rankSteps: 0 },
    magicDamageWeapon: null,
    physDefenseArmor: { kind: 'pesada', rankSteps: -1 },
    magicDefenseArmor: { kind: 'ligera', rankSteps: -2 },
    magicDefenseWeights: { constitucion: 0.1, sabiduria: 0.9 },
    agilityStat: 'fuerza',
  }
  const rank = rankFromAverage(477.3243556)
  const d = derivedStats(stats, rank, config)

  it('daño físico', () => {
    expect(d.physDamage).toBeCloseTo(325.898, 3)
    expect(d.physDamageWithWeapon).toBeCloseTo(485.898, 3)
    expect(d.magicDamageWithWeapon).toBeNull()
  })

  it('defensas CA y SA', () => {
    expect(d.physDefenseCA).toBeCloseTo(447.64, 2)
    expect(d.physDefenseSA).toBeCloseTo(577.64, 2)
    expect(d.magicDefenseCA).toBeCloseTo(187, 2)
    expect(d.magicDefenseSA).toBeCloseTo(237, 2)
  })

  it('velocidad y alcance', () => {
    expect(d.speed).toBeCloseTo(56.9263, 4)
    expect(d.physReach).toBeCloseTo(103.9090147, 4)
  })

  it('potenciaciones', () => {
    expect(d.techniques.ki).toBe(47)
    expect(d.techniques.haKi).toBe(80)
    expect(d.techniques.esencia).toBe(34)
    expect(d.techniques.eReinforced).toBe(66)
    expect(d.techniques.reiatsuOverride).toBe(302)
  })
})

describe('categoría de herida', () => {
  it('rango medio: depende de cuánto supera el daño a la defensa', () => {
    expect(woundCategory(100, 100, 'medio')).toBe('leve')
    expect(woundCategory(175, 100, 'medio')).toBe('leve') // +75, borde de normal
    expect(woundCategory(176, 100, 'medio')).toBe('medio')
    expect(woundCategory(250, 100, 'medio')).toBe('medio')
    expect(woundCategory(251, 100, 'medio')).toBe('fuerte')
    expect(woundCategory(400, 100, 'medio')).toBe('fuerte')
    expect(woundCategory(401, 100, 'medio')).toBe('letal')
  })

  it('si la defensa es mayor, el golpe es leve', () => {
    expect(woundCategory(10, 500, 'medio')).toBe('leve')
    expect(woundCategory(10, 5000, 'divino')).toBe('leve')
  })

  it('el rango del defensor cambia la escala', () => {
    expect(woundCategory(160, 100, 'bajo')).toBe('medio') // +60 supera el normal de 50
    expect(woundCategory(160, 100, 'alto')).toBe('leve') // +60 está dentro del normal de 100
    expect(woundCategory(240, 100, 'bajo')).toBe('fuerte') // +140 está entre 126 y 200
    expect(woundCategory(310, 100, 'bajo')).toBe('letal') // +210 supera 200
  })
})

describe('armadura', () => {
  it('baja la categoría un nivel y gasta usos', () => {
    expect(mitigateWithArmor('letal', 10)).toEqual({ applied: 'fuerte', usesSpent: 3 })
    expect(mitigateWithArmor('fuerte', 10)).toEqual({ applied: 'medio', usesSpent: 2 })
    expect(mitigateWithArmor('medio', 10)).toEqual({ applied: 'leve', usesSpent: 1 })
  })

  it('el leve no cambia ni gasta usos', () => {
    expect(mitigateWithArmor('leve', 10)).toEqual({ applied: 'leve', usesSpent: 0 })
  })

  it('sin usos no mitiga, y con pocos usos gasta los que tenga', () => {
    expect(mitigateWithArmor('letal', 0)).toEqual({ applied: 'letal', usesSpent: 0 })
    expect(mitigateWithArmor('letal', 2)).toEqual({ applied: 'fuerte', usesSpent: 2 })
  })
})

describe('resistencia y tabla de daños', () => {
  it('d8 + 6 en el caso normal', () => {
    expect(resistanceResult(2)).toBe(8)
    expect(resistanceResult(7)).toBe(13)
  })

  it('extremos con d6', () => {
    expect(resistanceResult(8, 6)).toBe(20)
    expect(resistanceResult(8, 1)).toBe(15)
    expect(resistanceResult(1, 6)).toBe(1)
    expect(resistanceResult(1, 1)).toBe(6)
    expect(() => resistanceResult(8)).toThrow()
    expect(() => resistanceResult(1)).toThrow()
  })

  it('celdas de la tabla', () => {
    expect(woundsFromTable('leve', 20)).toEqual({ leve: 0, medio: 0, letal: 0 })
    expect(woundsFromTable('fuerte', 12)).toEqual({ leve: 2, medio: 1, letal: 0 })
    expect(woundsFromTable('letal', 3)).toEqual({ leve: 0, medio: 1, letal: 1 })
    expect(woundsFromTable('medio', 8)).toEqual({ leve: 2, medio: 1, letal: 0 })
  })
})

describe('vida de los jugadores', () => {
  it('pierde 2 medios con 1 medio y muchos leves: 1 medio y 3 leves', () => {
    const r = applyWounds({ leve: 8, medio: 1, letal: 2 }, { leve: 0, medio: 2, letal: 0 })
    expect(r.health).toEqual({ leve: 5, medio: 0, letal: 2 })
    expect(r.critical).toBe(false)
  })

  it('pierde 1 leve sin leves: rompe un medio y recibe 2 leves de cambio', () => {
    const r = applyWounds({ leve: 0, medio: 5, letal: 2 }, { leve: 1, medio: 0, letal: 0 })
    expect(r.health).toEqual({ leve: 2, medio: 4, letal: 2 })
  })

  it('un golpe normal descuenta de cada reserva', () => {
    const r = applyWounds({ leve: 8, medio: 5, letal: 2 }, { leve: 2, medio: 1, letal: 0 })
    expect(r.health).toEqual({ leve: 6, medio: 4, letal: 2 })
  })

  it('sin letales, un letal se paga con medios y leves (9 puntos)', () => {
    const r = applyWounds({ leve: 3, medio: 2, letal: 0 }, { leve: 0, medio: 0, letal: 1 })
    expect(r.unpaid.letal).toBe(0) // 2 medios + 3 leves = 9, alcanza para un letal
    expect(r.health).toEqual({ leve: 0, medio: 0, letal: 0 })
    expect(r.critical).toBe(true)
  })

  it('agotar los letales deja estado crítico', () => {
    const r = applyWounds({ leve: 8, medio: 5, letal: 1 }, { leve: 0, medio: 0, letal: 1 })
    expect(r.health.letal).toBe(0)
    expect(r.critical).toBe(true)
  })

  it('no baja de cero y informa lo que no pudo pagar', () => {
    const r = applyWounds({ leve: 0, medio: 0, letal: 0 }, { leve: 1, medio: 0, letal: 0 })
    expect(r.health).toEqual({ leve: 0, medio: 0, letal: 0 })
    expect(r.unpaid.leve).toBe(1)
  })
})
