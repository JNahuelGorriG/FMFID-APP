import { describe, expect, it } from 'vitest'
import { defaultEnemyProfile, enemySheet } from './index'
import type { EnemyProfile } from './index'

// Valores calculados por la hoja "Stat Enemigo" del Excel del GM: rango C+,
// curvas 1,1,2,2,3,2,3, arma física grande, mágica pequeña, armadura pesada.
const sample: EnemyProfile = { ...defaultEnemyProfile('C+') }

describe('calculadora de enemigos (contra el Excel)', () => {
  const sheet = enemySheet(sample)

  it('stats de cada curva', () => {
    expect(sheet.stats).toEqual({
      fuerza: 350, destreza: 350, constitucion: 250, percepcion: 250,
      inteligencia: 200, sabiduria: 250, carisma: 200,
    })
  })

  it('energías', () => {
    expect(sheet.mana).toBe(980)
    expect(sheet.stamina).toBe(1430)
  })

  it('daño y defensas', () => {
    expect(sheet.physDamageWithWeapon).toBe(430)
    expect(sheet.magicDamageWithWeapon).toBe(250)
    expect(sheet.physDefenseCA).toBe(250)
    expect(sheet.physDefenseSA).toBe(380)
    expect(sheet.magicDefenseCA).toBe(250)
    expect(sheet.magicDefenseSA).toBe(380)
  })

  it('velocidad y alcance', () => {
    expect(sheet.speed).toBeCloseTo(101.75, 2)
    expect(sheet.physReach).toBe(115)
    expect(sheet.magicReach).toBe(60)
  })
})

describe('perfil de enemigo', () => {
  it('los valores puestos a mano reemplazan a la curva y arrastran los derivados', () => {
    const sheet = enemySheet({ ...sample, overrides: { fuerza: 500 } })
    expect(sheet.stats.fuerza).toBe(500)
    expect(sheet.physDamageWithWeapon).toBe(535) // 0,7·500 + 0,3·350 + 80 = 535
    expect(sheet.physDefenseCA).toBe(250)
  })

  it('cambiar la curva de un stat cambia su valor', () => {
    const sheet = enemySheet({ ...sample, tiers: { ...sample.tiers, inteligencia: 1 } })
    expect(sheet.stats.inteligencia).toBe(350)
  })

  it('el rango E usa los bonos del "rango F" de la hoja', () => {
    const sheet = enemySheet(defaultEnemyProfile('E'))
    expect(sheet.stats.fuerza).toBe(60)
    expect(sheet.physDefenseSA - sheet.physDefenseCA).toBe(12) // armadura pesada F
  })

  it('rechaza un rango desconocido y usa E si el rango de la lista no sirve', () => {
    expect(() => enemySheet({ ...sample, rank: 'Z' })).toThrow()
    expect(defaultEnemyProfile('-').rank).toBe('E')
  })

  it('los 16 rangos se pueden calcular', () => {
    for (const rank of ['E', 'E+', 'D', 'D+', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS', 'SS+', 'SSS', 'SSS+']) {
      expect(enemySheet(defaultEnemyProfile(rank)).stats.destreza).toBeGreaterThan(0)
    }
  })
})
