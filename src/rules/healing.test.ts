import { describe, expect, it } from 'vitest'
import { HEALING_TABLE, applyHealing, healingText, healingValue, initialPcState } from './index'
import type { PcState } from './index'
import { edward } from './fixtures'

const manual = { unit: 'manual' as const, remaining: 0 }
const hurt = (health: PcState['health']): PcState => ({ ...initialPcState(edward), health })
const max = edward.baseHealth // 10 / 7 / 3

describe('tabla de curaciones', () => {
  it('tiene 7 niveles con 1, 1, 2, 3, 3, 3 y 3 opciones', () => {
    expect(HEALING_TABLE.map((l) => l.rank)).toEqual(['E', 'D', 'C', 'B', 'A', 'S', 'SS'])
    expect(HEALING_TABLE.map((l) => l.options.length)).toEqual([1, 1, 2, 3, 3, 3, 3])
  })

  it('se escribe con la notación de la mesa', () => {
    const text = (level: number) => HEALING_TABLE[level - 1].options.map(healingText)
    expect(text(1)).toEqual(['3L'])
    expect(text(3)).toEqual(['8L', '2L 1M'])
    expect(text(4)).toEqual(['8L + 1Lb', '6L 1M', '1L 2M'])
    expect(text(5)).toEqual(['8L + 3Lb', '2L 3M', '1L 1M 1X'])
    expect(text(6)).toEqual(['8L + 4Mb', '5L 4M', '4L 3M 1X'])
    expect(text(7)).toEqual(['8L + 5Mb', '7L 5M + 2Xb', '7L 5M 2X'])
  })

  it('el valor en leves permite comparar las opciones (1 leve, 3 por un medio, 9 por un letal)', () => {
    const totals = HEALING_TABLE.map((l) => l.options.map((o) => healingValue(o).total))
    expect(totals).toEqual([[3], [6], [8, 5], [9, 9, 7], [11, 11, 13], [20, 17, 22], [23, 40, 40]])
  })
})

describe('aplicar una curación', () => {
  const options = { barrierDuration: manual, combatId: 'c1', saturate: false }

  it('sube la vida y no pasa del máximo', () => {
    const pc = hurt({ leve: 4, medio: 7, letal: 3 })
    const result = applyHealing(pc, max, HEALING_TABLE[2].options[0], options)
    expect(result.pc.health).toEqual({ leve: 10, medio: 7, letal: 3 }) // 8 leves pero solo había lugar para 6
    expect(result.healed).toEqual({ leve: 6, medio: 0, letal: 0 })
  })

  it('cura heridas de varios tipos', () => {
    const pc = hurt({ leve: 5, medio: 3, letal: 1 })
    const result = applyHealing(pc, max, HEALING_TABLE[4].options[2], options) // 1L 1M 1X
    expect(result.pc.health).toEqual({ leve: 6, medio: 4, letal: 2 })
  })

  it('agrega la barrera de la opción con su duración y su combate', () => {
    const pc = hurt({ leve: 10, medio: 7, letal: 3 })
    const result = applyHealing(pc, max, HEALING_TABLE[3].options[0], {
      ...options,
      barrierDuration: { unit: 'rondas', remaining: 3 },
    }) // 8L + 1Lb
    expect(result.healed).toEqual({ leve: 0, medio: 0, letal: 0 }) // ya estaba completo
    expect(result.barrier).toEqual({ leve: 1, medio: 0, letal: 0 })
    expect(result.pc.barriers).toHaveLength(1)
    expect(result.pc.barriers[0]).toMatchObject({
      wounds: { leve: 1, medio: 0, letal: 0 },
      duration: { unit: 'rondas', remaining: 3 },
      combatId: 'c1',
    })
  })

  it('una opción sin barrera no agrega ninguna', () => {
    const result = applyHealing(hurt({ leve: 1, medio: 7, letal: 3 }), max, HEALING_TABLE[0].options[0], options)
    expect(result.barrier).toBeNull()
    expect(result.pc.barriers).toEqual([])
  })

  it('con saturación, suma 1 % por leve, 3 % por medio y 9 % por letal realmente curados', () => {
    const pc = hurt({ leve: 5, medio: 3, letal: 1 })
    const result = applyHealing(pc, max, HEALING_TABLE[4].options[2], { ...options, saturate: true }) // 1L 1M 1X
    expect(result.pc.saturation).toBe(1 + 3 + 9)
    // si no se curó nada, no sube
    const full = applyHealing(hurt(max), max, HEALING_TABLE[0].options[0], { ...options, saturate: true })
    expect(full.pc.saturation).toBe(0)
  })

  it('sin saturación, la barra no se toca', () => {
    const pc = { ...hurt({ leve: 5, medio: 7, letal: 3 }), saturation: 20 }
    expect(applyHealing(pc, max, HEALING_TABLE[0].options[0], options).pc.saturation).toBe(20)
  })
})
