import { describe, expect, it } from 'vitest'
import { absorbAsVariants, combatOptions, defaultEnemyProfile, hasCombat, labelFromName, newNpcTemplate, toVariants, variantName } from './index'
import type { Npc } from './index'

const mk = (name: string, rank = 'E'): Npc => ({
  ...newNpcTemplate('bestia'), id: name, name, combat: defaultEnemyProfile(rank), createdAt: '', updatedAt: '',
})

describe('variantes de bestia', () => {
  it('un perfil único es una opción sin etiqueta', () => {
    const o = combatOptions(mk('Anti Esper'))
    expect(o).toHaveLength(1)
    expect(o[0].label).toBe('')
    expect(hasCombat({ combat: null })).toBe(false)
  })

  it('saca la etiqueta de lo que sobra del nombre', () => {
    expect(labelFromName('Anti Esper', 'Anti Esper Tanque')).toBe('Tanque')
    expect(labelFromName('Anti Esper', 'Anti Esper - Mágico')).toBe('Mágico')
    expect(labelFromName('Anti Esper', 'Anti Esper (Guerrero)')).toBe('Guerrero')
    expect(labelFromName('Anti Esper', 'Otro')).toBe('Otro')
  })

  it('une varias bestias en una con variantes', () => {
    const base = mk('Anti Esper')
    const merged = absorbAsVariants(base, [mk('Anti Esper Tanque'), mk('Anti Esper Mágico')])
    expect(merged.combat).toBeNull()
    expect(merged.variants?.map((v) => v.label)).toEqual(['Base', 'Tanque', 'Mágico'])
    expect(combatOptions(merged)).toHaveLength(3)
    expect(new Set(merged.variants?.map((v) => v.id)).size).toBe(3)
  })

  it('toVariants no duplica y variantName arma el nombre', () => {
    const once = toVariants(mk('X'))
    expect(toVariants(once)).toBe(once)
    expect(variantName('Anti Esper', 'Tanque')).toBe('Anti Esper (Tanque)')
    expect(variantName('Anti Esper', '')).toBe('Anti Esper')
  })
})
