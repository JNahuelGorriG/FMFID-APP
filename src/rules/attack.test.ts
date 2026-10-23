import { describe, expect, it } from 'vitest'
import {
  addNpcParticipant,
  addPcParticipant,
  applyToNpc,
  applyToPc,
  armorFromTable,
  buildProfile,
  damageStage,
  defaultEnemyProfile,
  defenseAgainst,
  hitCheck,
  initialPcState,
  isHit,
  newCombat,
  resolveHit,
  statCheck,
  updateParticipant,
  woundsForPc,
} from './index'
import type { Character, Combat } from './index'
import { edward } from './fixtures'

const colt: Character = { ...edward, id: 'colt', name: 'Colt' }

function arena(): { combat: Combat; pc: string; npc: string } {
  let combat = newCombat('Prueba')
  combat = addPcParticipant(combat, edward, 10)
  combat = addNpcParticipant(combat, { name: 'Goblin', profile: defaultEnemyProfile('C+') }, 5)
  return { combat, pc: combat.participants[0].id, npc: combat.participants[1].id }
}

function profiles() {
  const { combat } = arena()
  const [pc, npc] = combat.participants
  return { pc: buildProfile(pc, edward)!, npc: buildProfile(npc)!, combat }
}

describe('perfil de un combatiente', () => {
  it('un jugador aporta rango, stats, daño y defensas', () => {
    const { pc } = profiles()
    expect(pc.rankName).toBe('C+')
    expect(pc.group).toBe('medio')
    expect(pc.stats.fuerza).toBeCloseTo(357.14, 2)
    expect(pc.damage.fisico).toBeCloseTo(485.898, 3)
    expect(pc.defense.fisico.sa).toBeCloseTo(577.64, 2)
  })

  it('un NPC aporta lo de su perfil de combate', () => {
    const { npc } = profiles()
    expect(npc.rankName).toBe('C+')
    expect(npc.stats.destreza).toBe(350)
    expect(npc.damage.fisico).toBe(430)
    expect(npc.defense.fisico).toEqual({ ca: 250, sa: 380 })
    expect(npc.health).toBe('10 / 10')
  })

  it('un jugador cuyo personaje no existe no tiene perfil', () => {
    expect(buildProfile(arena().combat.participants[0])).toBeNull()
  })

  it('los buffs del combate cuentan en el perfil', () => {
    const { combat, pc } = arena()
    const buffed = updateParticipant(combat, pc, (p) => ({
      ...p,
      pc: p.pc
        ? {
            ...p.pc,
            effects: [{
              id: 'e', kind: 'buff' as const, name: 'Furia', typeId: 'estado', target: 'fuerza' as const,
              flat: 100, percent: 0, duration: { unit: 'manual' as const, remaining: 0 },
              combatId: combat.id, createdAt: '2026-01-01T00:00:00Z',
            }],
          }
        : null,
    }))
    expect(buildProfile(buffed.participants[0], edward)!.stats.fuerza).toBeCloseTo(457.14, 2)
  })
})

describe('defensa: con armadura (CA) o sin ella (SA)', () => {
  it('sin armadura puesta cuenta la defensa natural SA', () => {
    const { pc } = profiles()
    expect(defenseAgainst(pc, 'fisico')).toEqual({ value: pc.defense.fisico.sa, armored: false })
  })

  it('con armadura con usos cuenta CA más el valor de la armadura', () => {
    const { combat, pc: id } = arena()
    const armored = updateParticipant(combat, id, (p) => ({
      ...p,
      pc: p.pc ? { ...p.pc, armor: { type: 'pesada', rank: 'C', bonus: 130, usesMax: 18, usesLeft: 18 } } : null,
    }))
    const profile = buildProfile(armored.participants[0], edward)!
    const d = defenseAgainst(profile, 'fisico')
    expect(d.armored).toBe(true)
    expect(d.value).toBeCloseTo(447.64 + 130, 2)
  })

  it('con la armadura agotada vuelve a la SA', () => {
    const { combat, pc: id } = arena()
    const broken = updateParticipant(combat, id, (p) => ({
      ...p,
      pc: p.pc ? { ...p.pc, armor: { type: 'pesada', rank: 'C', bonus: 130, usesMax: 18, usesLeft: 0 } } : null,
    }))
    expect(defenseAgainst(buildProfile(broken.participants[0], edward)!, 'fisico').armored).toBe(false)
  })

  it('la armadura se arma desde las tablas', () => {
    expect(armorFromTable('pesada', 'C')).toEqual({ type: 'pesada', rank: 'C', bonus: 130, usesMax: 18, usesLeft: 18 })
    expect(armorFromTable('ligera', 'A+').usesMax).toBe(0) // fuera de la tabla de usos
  })
})

describe('ataque', () => {
  it('compara los stats elegidos y usa la fila del rango del defensor', () => {
    const { pc, npc } = profiles()
    const check = hitCheck(npc, pc, 'destreza', 'percepcion')
    expect(check.attackerValue).toBe(350)
    expect(check.defenderValue).toBe(297)
    expect(check.difference).toBe(53)
    expect(check.level).toBe('normal') // rango medio: hasta 75 es normal
  })

  it('el mismo stat puede enfrentarse a otro (Fuerza contra Constitución)', () => {
    const { pc, npc } = profiles()
    const check = hitCheck(pc, npc, 'fuerza', 'constitucion')
    expect(check.difference).toBeCloseTo(357.14 - 250, 2)
    expect(check.level).toBe('mayor') // 107 en rango medio
  })

  it('solo los éxitos son impactos', () => {
    expect(isHit(resolveHit('normal', 11))).toBe(true)
    expect(isHit(resolveHit('normal', 19))).toBe(true)
    expect(isHit(resolveHit('normal', 10))).toBe(false)
    expect(isHit(resolveHit('exito-asegurado'))).toBe(true)
    expect(isHit(resolveHit('fallo-inmune'))).toBe(false)
  })

  it('la etapa de daño da la categoría y la armadura la baja un nivel', () => {
    const { combat, pc: id, npc: npcId } = arena()
    const armored = updateParticipant(combat, id, (p) => ({
      ...p,
      pc: p.pc ? { ...p.pc, armor: armorFromTable('pesada', 'C') } : null,
    }))
    const defender = buildProfile(armored.participants[0], edward)!
    const attacker = buildProfile(armored.participants.find((p) => p.id === npcId)!)!

    // daño 430 contra defensa 447,64 + 130: queda por debajo → leve
    expect(damageStage(attacker, defender, 'fisico').category).toBe('leve')

    // con un daño corregido a mano: 700 queda 122 por encima de 577,64
    const stage = damageStage(attacker, defender, 'fisico', { damage: 700 })
    expect(stage.defense).toBeCloseTo(577.64, 2)
    expect(stage.category).toBe('medio') // rango medio: hasta 75 leve, 76–150 medio, 151–300 fuerte, más letal
    expect(stage.applied).toBe('leve') // la armadura lo baja un nivel
    expect(stage.armorSpent).toBe(1)
  })

  it('daño muy superior: letal, y la armadura lo baja a fuerte gastando 3 usos', () => {
    const { combat, pc: id, npc: npcId } = arena()
    const armored = updateParticipant(combat, id, (p) => ({
      ...p,
      pc: p.pc ? { ...p.pc, armor: armorFromTable('pesada', 'C') } : null,
    }))
    const defender = buildProfile(armored.participants[0], edward)!
    const attacker = buildProfile(armored.participants.find((p) => p.id === npcId)!)!
    const stage = damageStage(attacker, defender, 'fisico', { damage: 1200 })
    expect(stage.category).toBe('letal')
    expect(stage.applied).toBe('fuerte')
    expect(stage.armorSpent).toBe(3)
  })

  it('sin armadura no hay mitigación ni desgaste', () => {
    const { pc, npc } = profiles()
    const stage = damageStage(npc, pc, 'fisico', { damage: 1200 })
    expect(stage.armored).toBe(false)
    expect(stage.applied).toBe(stage.category)
    expect(stage.armorSpent).toBe(0)
  })

  it('las heridas de un jugador salen de la tabla con su resultado de resistencia', () => {
    expect(woundsForPc('fuerte', 12)).toEqual({ leve: 2, medio: 1, letal: 0 })
  })
})

describe('aplicar el ataque', () => {
  it('en un jugador la barrera absorbe primero, luego la vida, y la armadura gasta usos', () => {
    let pc = initialPcState(edward)
    pc = {
      ...pc,
      armor: armorFromTable('pesada', 'C'),
      barriers: [{ id: 'b', wounds: { leve: 2, medio: 0, letal: 0 }, duration: { unit: 'rondas', remaining: 2 }, combatId: 'c', createdAt: '2026-01-01T00:00:00Z' }],
    }
    const after = applyToPc(pc, { leve: 3, medio: 0, letal: 0 }, 2)
    expect(after.barriers).toEqual([]) // la barrera se agotó
    expect(after.health).toEqual({ leve: edward.baseHealth.leve - 1, medio: 7, letal: 3 }) // quedó 1 leve para la vida
    expect(after.armor?.usesLeft).toBe(16)
  })

  it('la armadura nunca baja de 0 usos', () => {
    const pc = { ...initialPcState(edward), armor: { ...armorFromTable('ligera', 'E'), usesLeft: 1 } }
    expect(applyToPc(pc, { leve: 0, medio: 1, letal: 0 }, 3).armor?.usesLeft).toBe(0)
  })

  it('en un NPC la barrera en puntos absorbe y el resto baja su vida', () => {
    const { combat } = arena()
    const npc = {
      ...combat.participants[1].npc!,
      hpCurrent: 10,
      barriers: [{ id: 'b', points: 4, duration: { unit: 'rondas' as const, remaining: 2 }, combatId: 'c', createdAt: '2026-01-01T00:00:00Z' }],
    }
    const after = applyToNpc(npc, 6)
    expect(after.barriers).toEqual([])
    expect(after.hpCurrent).toBe(8)
    expect(applyToNpc(npc, 99).hpCurrent).toBe(0) // no baja de 0
  })
})

describe('stat check contra los demás combatientes', () => {
  it('Carisma contra Carisma de cada uno, con la fila del rango de cada defensor', () => {
    const { combat } = arena()
    const withColt = addPcParticipant(combat, colt, 8)
    const [pc, npc, other] = withColt.participants.map((p) => buildProfile(p, edward)!)
    const rows = statCheck(npc, 'carisma', [pc, other], 'carisma')

    expect(rows).toHaveLength(2)
    expect(rows[0].targetValue).toBe(173)
    expect(rows[0].difference).toBe(200 - 173)
    expect(rows[0].level).toBe('normal')
    expect(rows[0].ranges?.[0]).toEqual({ outcome: 'fallo-critico', range: [1, 2] })
    expect(rows[0].outcome).toBeNull() // sin d20 todavía
  })

  it('con un d20 indica el resultado de cada fila', () => {
    const { pc, npc } = profiles()
    const rows = statCheck(npc, 'carisma', [pc], 'carisma', 16)
    expect(rows[0].outcome).toBe('exito-mayor')
  })

  it('una diferencia enorme es automática y no muestra rangos', () => {
    const { pc, npc } = profiles()
    const strong = { ...npc, stats: { ...npc.stats, carisma: 5000 } }
    const rows = statCheck(strong, 'carisma', [pc], 'carisma')
    expect(rows[0].level).toBe('exito-asegurado')
    expect(rows[0].ranges).toBeNull()
    expect(rows[0].outcome).toBe('exito-automatico')
  })
})
