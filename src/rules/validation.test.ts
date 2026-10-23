import { describe, expect, it } from 'vitest'
import { characterSheet, newCharacterTemplate, validateCharacter } from './index'
import type { Character } from './index'
import { edward } from './fixtures'

describe('validación de personajes', () => {
  it('Edward es válido', () => {
    expect(validateCharacter(edward)).toEqual([])
  })

  it('detecta tiers mal repartidos', () => {
    const bad: Character = { ...edward, tiers: { ...edward.tiers, carisma: 1 } }
    expect(validateCharacter(bad)).toContain('Debe haber 2 stats primarios, 3 secundarios y 2 terciarios.')
  })

  it('detecta nombre vacío, multiplicador inválido y vida fraccionaria', () => {
    const bad: Character = {
      ...edward,
      name: '  ',
      multipliers: { ...edward.multipliers, fuerza: 0 },
      baseHealth: { leve: 8.5, medio: 5, letal: 2 },
    }
    const errors = validateCharacter(bad)
    expect(errors).toHaveLength(3)
  })

  it('el personaje nuevo es válido y se puede calcular', () => {
    const template = newCharacterTemplate()
    const character: Character = { ...template, id: 'x', createdAt: '', updatedAt: '' }
    expect(validateCharacter(character)).toEqual([])
    const sheet = characterSheet(character)
    expect(sheet.rank).toBeNull()
    expect(sheet.mana).toBe(150)
  })
})
