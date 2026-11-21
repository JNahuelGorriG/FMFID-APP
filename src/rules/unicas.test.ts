import { describe, expect, it } from 'vitest'
import { UNIQUE_DOTES, doteCategories, mergeDotes, suggestedCategory } from './index'

describe('dotes únicas de categoría', () => {
  it('son 7 categorías de 18, 3 por tier, todas únicas', () => {
    expect(UNIQUE_DOTES).toHaveLength(126)
    const cats = doteCategories(UNIQUE_DOTES.map((d) => ({ ...d })))
    expect(cats).toEqual(['Guerrero de Fuerza', 'Guerrero de Destreza', 'Tanque', 'Híbrido', 'Ranger', 'Healer', 'Esgrimago'])
    for (const c of cats) {
      const mine = UNIQUE_DOTES.filter((d) => d.category === c)
      expect(mine).toHaveLength(18)
      for (const t of ['E', 'D', 'C', 'B', 'A', 'S']) expect(mine.filter((d) => d.tier === t)).toHaveLength(3)
    }
    expect(new Set(UNIQUE_DOTES.map((d) => d.name)).size).toBe(126)
    expect(UNIQUE_DOTES.every((d) => d.type === 'unico' && d.use && d.description)).toBe(true)
    expect(UNIQUE_DOTES.some((d) => /[\\*]/.test(d.description + d.name + d.use))).toBe(false)
  })

  it('sugiere la categoría por nombre del personaje o por su categoría, sin limitar', () => {
    expect(suggestedCategory(UNIQUE_DOTES, { name: 'Edward' })).toBe('Tanque')
    expect(suggestedCategory(UNIQUE_DOTES, { name: 'hernan' })).toBe('Healer')
    expect(suggestedCategory(UNIQUE_DOTES, { name: 'Alguien', className: 'ranger' })).toBe('Ranger')
    expect(suggestedCategory(UNIQUE_DOTES, { name: 'Alguien', className: 'Mago' })).toBeNull()
  })

  it('cargarlas dos veces no duplica nada', () => {
    const first = mergeDotes([], UNIQUE_DOTES)
    expect(first.result.added).toBe(126)
    const again = mergeDotes(first.next, UNIQUE_DOTES)
    expect(again.result).toEqual({ added: 0, updated: 0, unchanged: 126 })
  })
})
