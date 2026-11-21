import { describe, expect, it } from 'vitest'
import {
  addGroupParticipant, applyToNpc, atFloor, damageGroup, defaultEnemyProfile, groupAlive, initialNpcState,
  newCombat, setGroupAlive, setGroupPerMember, setGroupSize, shiftGroupRank, groupState, rankShiftedBy,
} from './index'

const base = () => initialNpcState(defaultEnemyProfile('C+'))
const goblins = () => groupState(base(), { size: 4, perMember: 5 })

describe('manadas', () => {
  it('la vida del grupo es miembros × vida individual y cae uno cada vez que baja lo que vale uno', () => {
    const g = goblins()
    expect([g.hpMax, g.hpCurrent, groupAlive(g)]).toEqual([20, 20, 4])
    expect(groupAlive({ ...g, hpCurrent: 16 })).toBe(4)
    expect(groupAlive({ ...g, hpCurrent: 15 })).toBe(3)
    expect(groupAlive({ ...g, hpCurrent: 1 })).toBe(1)
    expect(groupAlive({ ...g, hpCurrent: 0 })).toBe(0)
  })

  it('cambiar los vivos a mano ajusta la vida del grupo', () => {
    const g = goblins()
    expect(setGroupAlive(g, 3).hpCurrent).toBe(15)
    expect(setGroupAlive(setGroupAlive(g, 3), 4).hpCurrent).toBe(20)
    expect(setGroupAlive(g, 0).hpCurrent).toBe(0)
    expect(setGroupAlive(g, 9).hpCurrent).toBe(20)
    const hurt = { ...g, hpCurrent: 17 } // 4 vivos, uno con 2
    expect(groupAlive(setGroupAlive(hurt, 3))).toBe(3)
    expect(setGroupAlive(hurt, 3).hpCurrent).toBe(12 + 0) // 17 - 5 = 12, ya no sobra vida
  })

  it('un ataque no pasa el sobrante al siguiente enemigo', () => {
    const hurt = { ...goblins(), hpCurrent: 11 } // el último tiene 1
    expect(applyToNpc(hurt, 3).hpCurrent).toBe(10)
    expect(groupAlive(applyToNpc(hurt, 3))).toBe(2)
    expect(applyToNpc(goblins(), 3).hpCurrent).toBe(17)
  })

  it('el daño de área es un golpe por enemigo alcanzado', () => {
    // 3 de daño a 4 enemigos: se lleva 3 cada uno, pero el pozo común lo toma de a uno
    const g = goblins()
    expect(damageGroup(g, 3, 4).hpCurrent).toBe(8)
    expect(damageGroup(g, 3, 2).hpCurrent).toBe(14)
    expect(damageGroup(goblins(), 4, 100).hpCurrent).toBe(0)
  })

  it('el rango baja de a uno y no pasa del piso ni del rango inicial', () => {
    let g = goblins()
    expect(g.group?.rankFloor).toBe('D+')
    g = shiftGroupRank(g, -1)
    expect(g.profile.rank).toBe('C')
    expect(atFloor(g)).toBe(false)
    g = shiftGroupRank(shiftGroupRank(g, -1), -1)
    expect(g.profile.rank).toBe('D+')
    expect(atFloor(g)).toBe(true)
    expect(shiftGroupRank(shiftGroupRank(g, 1), 5).profile.rank).toBe('C+')
    expect(rankShiftedBy('E', -3)).toBe('E')
  })

  it('cambiar el total o la vida individual mantiene los vivos', () => {
    const g = setGroupAlive(goblins(), 3)
    const more = setGroupSize(g, 6)
    expect([more.hpMax, groupAlive(more)]).toEqual([30, 5])
    expect(groupAlive(setGroupSize(g, 2))).toBe(2)
    const tougher = setGroupPerMember(g, 10)
    expect([tougher.hpMax, tougher.hpCurrent, groupAlive(tougher)]).toEqual([40, 30, 3])
  })

  it('se agrega al combate como un solo participante', () => {
    const c = addGroupParticipant(newCombat('x'), { name: 'Goblins', profile: defaultEnemyProfile('C+') }, { size: 4, perMember: 5 }, null)
    expect(c.participants).toHaveLength(1)
    expect(c.participants[0].npc?.group?.size).toBe(4)
    expect(c.participants[0].npc?.hpMax).toBe(20)
  })
})
