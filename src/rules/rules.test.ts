import { describe, expect, it } from 'vitest'
import {
  D20_RANGES,
  averageStats,
  differenceLevel,
  mana,
  rankFromAverage,
  resolveHit,
  splitEnergy,
  stamina,
  statTotal,
} from './index'
import type { StatSources, Stats, Tiers } from './index'

// Datos reales de Edward (Excel del GM), súper stat físico.
const src = (p: Partial<StatSources>): StatSources => ({
  puntosIniciales: 0, arbolHeroe: 0, heroe: 0, categoria: 0,
  despertar: 0, merito: 0, entrenamiento: 0, regalo: 0, drogasShoko: 0, otros: 0,
  ...p,
})

const edwardStats: Stats = {
  fuerza: 357.14,
  destreza: 253,
  constitucion: 447.64,
  percepcion: 297,
  inteligencia: 115.04,
  sabiduria: 158.04,
  carisma: 173,
}

const edwardTiers: Tiers = {
  fuerza: 1,
  constitucion: 1,
  destreza: 2,
  percepcion: 2,
  carisma: 2,
  inteligencia: 3,
  sabiduria: 3,
}

describe('stat total', () => {
  it('Fuerza de Edward (multiplicador 1,1)', () => {
    const s = src({
      puntosIniciales: 103, arbolHeroe: 26, heroe: 40, categoria: 48.4,
      despertar: 10, merito: 24, entrenamiento: 50, regalo: 34,
    })
    expect(statTotal(s, 1.1)).toBeCloseTo(357.14, 6)
  })

  it('Constitución de Edward (multiplicador 1,4)', () => {
    const s = src({
      puntosIniciales: 117, arbolHeroe: 44, heroe: 40, categoria: 61.6,
      despertar: 10, merito: 10, entrenamiento: 50, regalo: 10,
    })
    expect(statTotal(s, 1.4)).toBeCloseTo(447.64, 6)
  })

  it('Sabiduría de Edward (multiplicador 0,6)', () => {
    const s = src({
      puntosIniciales: 40, arbolHeroe: 22, heroe: 40, categoria: 26.4,
      despertar: 10, merito: 15, entrenamiento: 20, regalo: 36,
    })
    expect(statTotal(s, 0.6)).toBeCloseTo(158.04, 6)
  })
})

describe('energía', () => {
  it('maná de Edward = 840', () => {
    expect(mana(edwardStats, { base: 1, bonus: 110 })).toBe(840)
  })

  it('estamina de Edward corregida = 2290', () => {
    expect(stamina(edwardStats, { base: 300, bonus: 165 })).toBe(2290)
  })

  it('divide mitad natural y mitad renovable', () => {
    expect(splitEnergy(840)).toEqual({ natural: 420, renovable: 420 })
  })
})

describe('rango', () => {
  it('promedio de stats de Edward coincide con el Excel', () => {
    expect(averageStats(edwardStats, edwardTiers)).toBeCloseTo(477.3243556, 4)
  })

  it('Edward es rango C+', () => {
    const rank = rankFromAverage(averageStats(edwardStats, edwardTiers))
    expect(rank?.name).toBe('C+')
    expect(rank?.group).toBe('medio')
  })

  it('límites de la escala', () => {
    expect(rankFromAverage(59.9)).toBeNull()
    expect(rankFromAverage(60)?.name).toBe('E')
    expect(rankFromAverage(2250)?.name).toBe('SSS+')
    expect(rankFromAverage(9999)?.name).toBe('SSS+')
  })

  it('exige 2 primarios, 3 secundarios y 2 terciarios', () => {
    const malos: Tiers = { ...edwardTiers, carisma: 1 }
    expect(() => averageStats(edwardStats, malos)).toThrow()
  })
})

describe('umbrales de diferencia', () => {
  it('rango bajo: bordes de cada banda', () => {
    expect(differenceLevel(50, 'bajo')).toBe('normal')
    expect(differenceLevel(-50, 'bajo')).toBe('normal')
    expect(differenceLevel(51, 'bajo')).toBe('mayor')
    expect(differenceLevel(125, 'bajo')).toBe('mayor')
    expect(differenceLevel(126, 'bajo')).toBe('mayor-plus')
    expect(differenceLevel(200, 'bajo')).toBe('mayor-plus')
    expect(differenceLevel(201, 'bajo')).toBe('exito-asegurado')
  })

  it('el signo negativo favorece al defensor', () => {
    expect(differenceLevel(-51, 'bajo')).toBe('menor')
    expect(differenceLevel(-126, 'bajo')).toBe('menor-plus')
    expect(differenceLevel(-201, 'bajo')).toBe('fallo-inmune')
  })

  it('la misma diferencia pesa distinto según el rango del defensor', () => {
    expect(differenceLevel(60, 'bajo')).toBe('mayor')
    expect(differenceLevel(60, 'medio')).toBe('normal')
    expect(differenceLevel(60, 'divino')).toBe('normal')
  })
})

describe('d20', () => {
  it('cada fila cubre del 1 al 20 sin huecos ni solapes', () => {
    for (const ranges of Object.values(D20_RANGES)) {
      expect(ranges[0][0]).toBe(1)
      expect(ranges[ranges.length - 1][1]).toBe(20)
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i][0]).toBe(ranges[i - 1][1] + 1)
      }
    }
  })

  it('nivel normal', () => {
    expect(resolveHit('normal', 2)).toBe('fallo-critico')
    expect(resolveHit('normal', 5)).toBe('fallo-mayor')
    expect(resolveHit('normal', 10)).toBe('fallo')
    expect(resolveHit('normal', 11)).toBe('exito')
    expect(resolveHit('normal', 18)).toBe('exito-mayor')
    expect(resolveHit('normal', 19)).toBe('exito-critico')
  })

  it('resultado automático sin tirar', () => {
    expect(resolveHit('fallo-inmune')).toBe('fallo-automatico')
    expect(resolveHit('exito-asegurado')).toBe('exito-automatico')
  })

  it('rechaza un d20 inválido', () => {
    expect(() => resolveHit('normal', 0)).toThrow()
    expect(() => resolveHit('normal', 21)).toThrow()
    expect(() => resolveHit('normal')).toThrow()
  })
})
