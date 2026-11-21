import { describe, expect, it } from 'vitest'
import {
  addNpcParticipant, addPcParticipant, applyAreaHits, damageStage, defaultEnemyProfile, lowerCategory, newCombat,
  undoLastAction, buildProfile,
} from './index'
import { edward } from './fixtures'

describe('bajar el tier del daño', () => {
  it('baja de a una categoría y no pasa de leve', () => {
    expect(lowerCategory('letal', 1)).toBe('fuerte')
    expect(lowerCategory('letal', 2)).toBe('medio')
    expect(lowerCategory('medio', 3)).toBe('leve')
    expect(lowerCategory('leve', 1)).toBe('leve')
    expect(lowerCategory('fuerte', 0)).toBe('fuerte')
  })

  it('actúa sobre la herida que queda tras la armadura', () => {
    const boss = buildProfile(addNpcParticipant(newCombat('x'), { name: 'Boss', profile: defaultEnemyProfile('S') }, null).participants[0])!
    const pc = buildProfile(addPcParticipant(newCombat('x'), edward, null).participants[0], edward)!
    const plain = damageStage(boss, pc, 'fisico', { damage: 1000 })
    const lowered = damageStage(boss, pc, 'fisico', { damage: 1000, tierDown: 1 })
    expect(plain.category).toBe('letal')
    expect(lowered.tierDown).toBe(1)
    expect(lowered.armorSpent).toBe(plain.armorSpent)
    expect(lowered.applied).not.toBe(plain.applied)
    expect(lowerCategory(plain.applied, 1)).toBe(lowered.applied)
  })
})

describe('aplicar un ataque a varios', () => {
  it('un solo deshacer devuelve a todos como estaban', () => {
    let c = addNpcParticipant(newCombat('x'), { name: 'Goblin', profile: defaultEnemyProfile('C') }, null)
    c = addPcParticipant(c, edward, null)
    c = addPcParticipant(c, { ...edward, id: 'otro', name: 'Ciro' }, null)
    const [gob, e, ciro] = c.participants
    const next = applyAreaHits(c, 'área', [
      { participantId: e.id, wounds: { leve: 1, medio: 0, letal: 0 }, armorSpent: 0 },
      { participantId: ciro.id, wounds: { leve: 0, medio: 1, letal: 0 }, armorSpent: 0 },
      { participantId: gob.id, npcPoints: 2 },
    ])
    expect(next.participants[0].npc!.hpCurrent).toBe(gob.npc!.hpCurrent - 2)
    expect(next.history).toHaveLength(1)
    expect(next.history[0].also).toHaveLength(2)
    expect(undoLastAction(next).participants).toEqual(c.participants)
  })

  it('sin objetivos válidos no cambia nada', () => {
    const c = newCombat('x')
    expect(applyAreaHits(c, 'nada', [{ participantId: 'no-existe', npcPoints: 1 }])).toBe(c)
  })
})
