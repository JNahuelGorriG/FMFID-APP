import { describe, expect, it } from 'vitest'
import {
  HEALING_TABLE,
  addBarrierToMany,
  addNpcParticipant,
  addPcParticipant,
  damageMany,
  defaultEnemyProfile,
  healMany,
  newCombat,
  undoLastAction,
  updateParticipant,
} from './index'
import type { Combat, Participant } from './index'
import { edward } from './fixtures'

const manual = { unit: 'manual' as const, remaining: 0 }

/** Edward, otro jugador y un goblin. */
function team(): { combat: Combat; ed: string; roy: string; goblin: string } {
  let c = newCombat('Equipo')
  c = addPcParticipant(c, edward, 10)
  c = addPcParticipant(c, { ...edward, id: 'roy', name: 'Roy' }, 8)
  c = addNpcParticipant(c, { name: 'Goblin', profile: defaultEnemyProfile('D') }, 5)
  const [ed, roy, goblin] = c.participants
  return { combat: c, ed: ed.id, roy: roy.id, goblin: goblin.id }
}
const part = (c: Combat, id: string): Participant => c.participants.find((p) => p.id === id)!
const maxHealth = () => edward.baseHealth // 10 / 7 / 3

describe('barrera a varios', () => {
  it('los jugadores reciben heridas y los NPC puntos, cada uno con su propia barrera', () => {
    const { combat, ed, roy, goblin } = team()
    const r = addBarrierToMany(combat, [ed, roy, goblin], {
      pc: { leve: 2, medio: 1, letal: 0 },
      npcPoints: 10,
      duration: { unit: 'rondas', remaining: 3 },
    })
    expect(part(r.combat, ed).pc?.barriers[0].wounds).toEqual({ leve: 2, medio: 1, letal: 0 })
    expect(part(r.combat, roy).pc?.barriers[0].wounds).toEqual({ leve: 2, medio: 1, letal: 0 })
    expect(part(r.combat, goblin).npc?.barriers[0].points).toBe(10)
    expect(part(r.combat, ed).pc?.barriers[0].duration).toEqual({ unit: 'rondas', remaining: 3 })
    expect(part(r.combat, ed).pc?.barriers[0].id).not.toBe(part(r.combat, roy).pc?.barriers[0].id)
    expect(r.results).toHaveLength(3)
  })

  it('solo a los elegidos', () => {
    const { combat, ed, roy } = team()
    const r = addBarrierToMany(combat, [ed], { pc: { leve: 1, medio: 0, letal: 0 }, npcPoints: 0, duration: manual })
    expect(part(r.combat, ed).pc?.barriers).toHaveLength(1)
    expect(part(r.combat, roy).pc?.barriers).toHaveLength(0)
  })

  it('si no hay monto para un tipo de combatiente, ese no recibe nada', () => {
    const { combat, ed, goblin } = team()
    const r = addBarrierToMany(combat, [ed, goblin], { pc: { leve: 0, medio: 0, letal: 0 }, npcPoints: 5, duration: manual })
    expect(part(r.combat, ed).pc?.barriers).toHaveLength(0)
    expect(part(r.combat, goblin).npc?.barriers).toHaveLength(1)
    expect(r.results.find((x) => x.id === ed)?.given).toBeNull()
  })

  it('se deshace de una sola vez para todos', () => {
    const { combat, ed, roy, goblin } = team()
    const r = addBarrierToMany(combat, [ed, roy, goblin], { pc: { leve: 2, medio: 0, letal: 0 }, npcPoints: 4, duration: manual })
    const undone = undoLastAction(r.combat)
    expect(part(undone, ed).pc?.barriers).toEqual([])
    expect(part(undone, roy).pc?.barriers).toEqual([])
    expect(part(undone, goblin).npc?.barriers).toEqual([])
    expect(undone.history).toHaveLength(0)
  })
})

describe('curación a varios', () => {
  const hurt = (c: Combat, id: string, health: { leve: number; medio: number; letal: number }) =>
    updateParticipant(c, id, (p) => ({ ...p, pc: p.pc ? { ...p.pc, health } : null }))
  const option = (level: number, i: number) => HEALING_TABLE[level - 1].options[i]

  it('cura a cada jugador con la opción elegida, sin pasar de su vida máxima', () => {
    const { combat, ed, roy } = team()
    let c = hurt(combat, ed, { leve: 4, medio: 7, letal: 3 })
    c = hurt(c, roy, { leve: 9, medio: 7, letal: 3 })
    const r = healMany(c, [ed, roy], { option: option(3, 0), npcPoints: 0, saturate: false, barrierDuration: manual }, maxHealth)
    expect(part(r.combat, ed).pc?.health.leve).toBe(10) // 8 leves, pero solo le faltaban 6
    expect(part(r.combat, roy).pc?.health.leve).toBe(10) // le faltaba 1
    expect(r.results.find((x) => x.id === ed)?.healed).toEqual({ leve: 6, medio: 0, letal: 0 })
    expect(r.results.find((x) => x.id === roy)?.healed).toEqual({ leve: 1, medio: 0, letal: 0 })
  })

  it('a los NPC los cura con puntos, sin pasar de su vida máxima', () => {
    const { combat, goblin } = team()
    const max = part(combat, goblin).npc!.hpMax
    const c = updateParticipant(combat, goblin, (p) => ({ ...p, npc: p.npc ? { ...p.npc, hpCurrent: max - 3 } : null }))
    const r = healMany(c, [goblin], { option: option(1, 0), npcPoints: 10, saturate: false, barrierDuration: manual }, maxHealth)
    expect(part(r.combat, goblin).npc?.hpCurrent).toBe(max)
    expect(r.results[0].hp).toEqual({ before: max - 3, after: max })
  })

  it('suma saturación según lo que se curó de verdad, y da la barrera de la opción', () => {
    const { combat, ed } = team()
    const c = hurt(combat, ed, { leve: 7, medio: 7, letal: 3 })
    const r = healMany(c, [ed], { option: option(4, 0), npcPoints: 0, saturate: true, barrierDuration: { unit: 'rondas', remaining: 2 } }, maxHealth) // 8L + 1Lb
    const pc = part(r.combat, ed).pc!
    expect(pc.health.leve).toBe(10)
    expect(pc.saturation).toBe(3) // curó 3 leves
    expect(pc.barriers[0].wounds).toEqual({ leve: 1, medio: 0, letal: 0 })
    expect(pc.barriers[0].duration).toEqual({ unit: 'rondas', remaining: 2 })
  })

  it('un jugador sin ficha no se cura, y se avisa', () => {
    const { combat, ed } = team()
    const r = healMany(combat, [ed], { option: option(1, 0), npcPoints: 0, saturate: false, barrierDuration: manual }, () => null)
    expect(r.results[0].skipped).toBe(true)
  })

  it('se deshace de una sola vez para todos', () => {
    const { combat, ed, goblin } = team()
    let c = hurt(combat, ed, { leve: 4, medio: 7, letal: 3 })
    const max = part(c, goblin).npc!.hpMax
    c = updateParticipant(c, goblin, (p) => ({ ...p, npc: p.npc ? { ...p.npc, hpCurrent: 1 } : null }))
    const r = healMany(c, [ed, goblin], { option: option(3, 0), npcPoints: 5, saturate: true, barrierDuration: manual }, maxHealth)
    expect(part(r.combat, goblin).npc?.hpCurrent).toBe(Math.min(max, 6))
    const undone = undoLastAction(r.combat)
    expect(part(undone, ed).pc?.health.leve).toBe(4)
    expect(part(undone, ed).pc?.saturation).toBe(0)
    expect(part(undone, goblin).npc?.hpCurrent).toBe(1)
  })
})

describe('daño a varios', () => {
  it('los jugadores reciben heridas y los NPC pierden puntos', () => {
    const { combat, ed, roy, goblin } = team()
    const before = part(combat, goblin).npc!.hpCurrent
    const r = damageMany(combat, [ed, roy, goblin], { pc: { leve: 1, medio: 1, letal: 0 }, npcPoints: 4 })
    for (const id of [ed, roy]) {
      const h = part(r.combat, id).pc!.health
      expect(h).toEqual({ leve: 9, medio: 6, letal: 3 })
    }
    expect(part(r.combat, goblin).npc?.hpCurrent).toBe(before - 4)
    expect(r.results.find((x) => x.id === goblin)?.hp).toEqual({ before, after: before - 4 })
  })

  it('la barrera absorbe primero', () => {
    const { combat, ed } = team()
    const c = addBarrierToMany(combat, [ed], { pc: { leve: 0, medio: 1, letal: 0 }, npcPoints: 0, duration: manual }).combat
    const r = damageMany(c, [ed], { pc: { leve: 0, medio: 1, letal: 0 }, npcPoints: 0 })
    expect(part(r.combat, ed).pc?.health).toEqual({ leve: 10, medio: 7, letal: 3 }) // la vida no cambió
    expect(part(r.combat, ed).pc?.barriers).toEqual([])
    expect(r.results[0].hit?.barrierAbsorbed).toBe(true)
  })

  it('un jugador sin vida queda en cero y se avisa lo que no se pudo descontar', () => {
    const { combat, ed } = team()
    const c = updateParticipant(combat, ed, (p) => ({ ...p, pc: p.pc ? { ...p.pc, health: { leve: 0, medio: 0, letal: 0 } } : null }))
    const r = damageMany(c, [ed], { pc: { leve: 2, medio: 1, letal: 0 }, npcPoints: 0 })
    expect(r.results[0].hit?.unpaid).toEqual({ letal: 0, medio: 1, leve: 2 })
    expect(r.results[0].hit?.critical).toBe(true)
  })

  it('un monto en 0 para un tipo de combatiente no le hace nada', () => {
    const { combat, ed, goblin } = team()
    const before = part(combat, goblin).npc!.hpCurrent
    const r = damageMany(combat, [ed, goblin], { pc: { leve: 0, medio: 0, letal: 0 }, npcPoints: 0 })
    expect(part(r.combat, goblin).npc?.hpCurrent).toBe(before)
    expect(r.results.every((x) => x.none)).toBe(true)
  })

  it('la vida de un NPC no baja de 0', () => {
    const { combat, goblin } = team()
    const r = damageMany(combat, [goblin], { pc: { leve: 0, medio: 0, letal: 0 }, npcPoints: 99999 })
    expect(part(r.combat, goblin).npc?.hpCurrent).toBe(0)
  })

  it('se deshace de una sola vez para todos', () => {
    const { combat, ed, roy, goblin } = team()
    const hp = part(combat, goblin).npc!.hpCurrent
    const r = damageMany(combat, [ed, roy, goblin], { pc: { leve: 3, medio: 0, letal: 0 }, npcPoints: 5 })
    const undone = undoLastAction(r.combat)
    expect(part(undone, ed).pc?.health.leve).toBe(10)
    expect(part(undone, roy).pc?.health.leve).toBe(10)
    expect(part(undone, goblin).npc?.hpCurrent).toBe(hp)
  })

  it('al deshacer, un participante que ya no está no rompe nada', () => {
    const { combat, ed, roy } = team()
    const r = damageMany(combat, [ed, roy], { pc: { leve: 1, medio: 0, letal: 0 }, npcPoints: 0 })
    const without = { ...r.combat, participants: r.combat.participants.filter((p) => p.id !== roy) }
    const undone = undoLastAction(without)
    expect(part(undone, ed).pc?.health.leve).toBe(10)
    expect(undone.participants.some((p) => p.id === roy)).toBe(false)
  })
})
