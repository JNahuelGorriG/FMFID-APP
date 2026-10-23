import { describe, expect, it } from 'vitest'
import {
  EFFECT_LIMIT,
  SKILL_TYPE_ID,
  absorbPointBarriers,
  absorbWithBarriers,
  addEffect,
  addEffectWithChoice,
  addNpcParticipant,
  addPcParticipant,
  advanceRound,
  advanceTurn,
  batteryGainFromRoll,
  chargeBattery,
  claimSaveFromBattery,
  defaultEnemyProfile,
  defaultSaves,
  effectTotals,
  effectiveCharacter,
  effectiveEnemy,
  endSkill,
  initialState,
  naturalBases,
  newCombat,
  orderedParticipants,
  removeParticipant,
  resolveEffects,
  setInitiative,
  spendSave,
  startCombat,
  tickDurations,
  characterSheet,
} from './index'
import type { Effect, EffectBases, World } from './index'
import { edward } from './fixtures'

const bases: EffectBases = {
  fuerza: 100, destreza: 100, constitucion: 100, percepcion: 100,
  inteligencia: 100, sabiduria: 100, carisma: 100,
  ataque: 200, magia: 200, defensaFisica: 100, defensaMagica: 100,
}

let counter = 0
const fx = (p: Partial<Effect>): Effect => ({
  id: `e${++counter}`,
  kind: 'buff',
  name: 'Buff',
  typeId: 'pocion',
  target: 'fuerza',
  flat: 0,
  percent: 0,
  duration: { unit: 'manual', remaining: 0 },
  combatId: null,
  createdAt: `2026-01-01T00:00:${String(counter).padStart(2, '0')}Z`,
  ...p,
})

describe('buffs y debuffs', () => {
  it('el valor combina fijo y porcentaje sobre el stat natural', () => {
    const r = resolveEffects([fx({ flat: 20, percent: 10 })], bases)
    expect(r[0].amount).toBe(30) // 20 + 10 % de 100
  })

  it('de un mismo tipo gana el más fuerte y el otro queda pisado', () => {
    const weak = fx({ flat: 20 })
    const strong = fx({ flat: 50 })
    const r = resolveEffects([weak, strong], bases)
    expect(r.map((x) => x.state)).toEqual(['pisado', 'activo'])
    expect(effectTotals(r).fuerza).toBe(50)
  })

  it('si el ganador termina, vuelve el pisado', () => {
    const weak = fx({ flat: 20 })
    const strong = fx({ flat: 50 })
    expect(effectTotals(resolveEffects([weak], bases)).fuerza).toBe(20)
    expect(resolveEffects([weak, strong], bases)[0].state).toBe('pisado')
  })

  it('tipos distintos suman, y stats distintos no se pisan', () => {
    const r = resolveEffects(
      [fx({ typeId: 'pocion', flat: 20 }), fx({ typeId: 'estilo', flat: 30 }), fx({ target: 'destreza', flat: 99 })],
      bases,
    )
    const totals = effectTotals(r)
    expect(totals.fuerza).toBe(50)
    expect(totals.destreza).toBe(99)
  })

  it('los debuffs restan, y buffs y debuffs no se pisan entre sí', () => {
    const r = resolveEffects([fx({ flat: 40 }), fx({ kind: 'debuff', flat: 15 })], bases)
    expect(r.map((x) => x.state)).toEqual(['activo', 'activo'])
    expect(effectTotals(r).fuerza).toBe(25)
  })

  it('el límite es de 4 por stat: el quinto pide elegir', () => {
    let effects: Effect[] = []
    for (const typeId of ['pasivo', 'pocion', 'estilo', 'estado']) {
      const result = addEffect(effects, fx({ typeId, flat: 10 }), bases)
      expect(result.status).toBe('added')
      if (result.status === 'added') effects = result.effects
    }
    const fifth = addEffect(effects, fx({ typeId: 'armamento', flat: 10 }), bases)
    expect(fifth.status).toBe('limit')
    if (fifth.status === 'limit') expect(fifth.occupants).toHaveLength(EFFECT_LIMIT)
  })

  it('un quinto del mismo tipo que otro no ocupa lugar nuevo', () => {
    let effects: Effect[] = []
    for (const typeId of ['pasivo', 'pocion', 'estilo', 'estado']) {
      const r = addEffect(effects, fx({ typeId, flat: 10 }), bases)
      if (r.status === 'added') effects = r.effects
    }
    expect(addEffect(effects, fx({ typeId: 'pocion', flat: 5 }), bases).status).toBe('added')
  })

  it('en otro stat no hay límite compartido', () => {
    let effects: Effect[] = []
    for (const typeId of ['pasivo', 'pocion', 'estilo', 'estado']) {
      const r = addEffect(effects, fx({ typeId, flat: 10 }), bases)
      if (r.status === 'added') effects = r.effects
    }
    expect(addEffect(effects, fx({ typeId: 'pocion', target: 'destreza', flat: 10 }), bases).status).toBe('added')
  })

  it('elegir cuál sacar reemplaza al elegido', () => {
    const old = fx({ typeId: 'pasivo', flat: 10 })
    const result = addEffectWithChoice([old], fx({ typeId: 'armamento', flat: 10 }), { action: 'remove', id: old.id })
    expect(result.map((e) => e.typeId)).toEqual(['armamento'])
  })

  it('una habilidad suspende a otro y este vuelve cuando la habilidad termina', () => {
    const existing = ['pasivo', 'pocion', 'estilo', 'estado'].map((typeId) => fx({ typeId, flat: 10 }))
    const skill = fx({ typeId: SKILL_TYPE_ID, flat: 100 })
    const added = addEffect(existing, skill, bases)
    expect(added.status).toBe('limit')

    const withSkill = addEffectWithChoice(existing, skill, { action: 'suspend', id: existing[0].id })
    const resolved = resolveEffects(withSkill, bases)
    expect(resolved.find((r) => r.effect.id === existing[0].id)?.state).toBe('suspendido')
    expect(effectTotals(resolved).fuerza).toBe(130) // 3 normales + la habilidad

    const after = endSkill(withSkill)
    expect(after.removed).toHaveLength(1)
    const back = resolveEffects(after.effects, bases)
    expect(back.every((r) => r.state === 'activo')).toBe(true)
    expect(effectTotals(back).fuerza).toBe(40)
  })

  it('solo una habilidad puede suspender', () => {
    const old = fx({ typeId: 'pasivo' })
    expect(() =>
      addEffectWithChoice([old], fx({ typeId: 'pocion' }), { action: 'suspend', id: old.id }),
    ).toThrow()
  })
})

describe('duraciones', () => {
  it('baja las de turnos y rondas del combate y devuelve lo que terminó', () => {
    const inCombat = fx({ duration: { unit: 'turnos', remaining: 2 }, combatId: 'c1' })
    const ending = fx({ duration: { unit: 'turnos', remaining: 1 }, combatId: 'c1' })
    const rounds = fx({ duration: { unit: 'rondas', remaining: 3 }, combatId: 'c1' })
    const other = fx({ duration: { unit: 'turnos', remaining: 1 }, combatId: 'c2' })
    const manual = fx({ duration: { unit: 'manual', remaining: 0 }, combatId: 'c1' })

    const r = tickDurations([inCombat, ending, rounds, other, manual], 'turnos', 'c1')
    expect(r.expired.map((e) => e.id)).toEqual([ending.id])
    expect(r.items.find((e) => e.id === inCombat.id)?.duration.remaining).toBe(1)
    expect(r.items.find((e) => e.id === rounds.id)?.duration.remaining).toBe(3)
    expect(r.items.find((e) => e.id === other.id)?.duration.remaining).toBe(1)
    expect(r.items).toContain(manual)
  })
})

describe('efectos sobre un personaje', () => {
  it('los buffs de stat entran en los derivados pero no cambian el rango', () => {
    const base = effectiveCharacter(edward, [])
    const buffed = effectiveCharacter(edward, [fx({ target: 'fuerza', flat: 100 })])
    expect(buffed.stats.fuerza).toBeCloseTo(base.stats.fuerza + 100, 6)
    expect(buffed.derived.physDamage).toBeCloseTo(base.derived.physDamage + 70, 6) // 0,7 × 100
    expect(buffed.natural.rank?.name).toBe('C+')
  })

  it('el porcentaje se calcula sobre el stat natural, no sobre el aumentado', () => {
    const natural = effectiveCharacter(edward, []).stats.fuerza
    const r = effectiveCharacter(edward, [
      fx({ target: 'fuerza', percent: 10, typeId: 'pocion' }),
      fx({ target: 'fuerza', percent: 10, typeId: 'estilo' }),
    ])
    expect(r.stats.fuerza).toBeCloseTo(natural * 1.2, 6) // 10 % + 10 % del natural, no 1,1 × 1,1
  })

  it('ataque afecta al daño físico con y sin arma, y las defensas a CA y SA', () => {
    const base = effectiveCharacter(edward, [])
    const r = effectiveCharacter(edward, [
      fx({ target: 'ataque', flat: 50 }),
      fx({ target: 'defensaFisica', kind: 'debuff', flat: 30 }),
    ])
    expect(r.derived.physDamage).toBeCloseTo(base.derived.physDamage + 50, 6)
    expect(r.derived.physDamageWithWeapon).toBeCloseTo((base.derived.physDamageWithWeapon ?? 0) + 50, 6)
    expect(r.derived.physDefenseCA).toBeCloseTo(base.derived.physDefenseCA - 30, 6)
    expect(r.derived.physDefenseSA).toBeCloseTo(base.derived.physDefenseSA - 30, 6)
    expect(r.derived.magicDefenseCA).toBeCloseTo(base.derived.magicDefenseCA, 6)
  })

  it('los porcentajes de ataque y defensa usan los valores naturales', () => {
    const sheet = characterSheet(edward)
    const b = naturalBases(sheet.totals, sheet.derived)
    expect(b.ataque).toBeCloseTo(sheet.derived.physDamage, 6)
    expect(b.defensaFisica).toBeCloseTo(sheet.totals.constitucion, 6)
  })

  it('un stat no baja de 0', () => {
    const r = effectiveCharacter(edward, [fx({ target: 'carisma', kind: 'debuff', flat: 9999 })])
    expect(r.stats.carisma).toBe(0)
  })

  it('funciona igual en un enemigo', () => {
    const profile = defaultEnemyProfile('C+')
    const r = effectiveEnemy(profile, [fx({ target: 'fuerza', flat: 100 }), fx({ target: 'defensaFisica', flat: 20 })])
    expect(r.stats.fuerza).toBe(450)
    expect(r.sheet.physDefenseSA).toBe(400) // 380 + 20
    expect(r.natural.stats.fuerza).toBe(350)
  })
})

describe('barreras', () => {
  const barrier = (leve: number, medio: number, letal: number, remaining: number, id = 'b') => ({
    id,
    wounds: { leve, medio, letal },
    duration: { unit: 'rondas' as const, remaining },
    combatId: 'c1',
    createdAt: `2026-01-01T00:00:0${remaining}Z`,
  })

  it('absorbe heridas y lo que sobra pasa a la vida', () => {
    const r = absorbWithBarriers([barrier(2, 0, 0, 3)], { leve: 3, medio: 0, letal: 0 })
    expect(r.barriers).toEqual([]) // se agotó
    expect(r.remaining).toEqual({ leve: 1, medio: 0, letal: 0 })
  })

  it('gasta primero la que vence antes', () => {
    const slow = barrier(5, 0, 0, 5, 'slow')
    const fast = barrier(5, 0, 0, 1, 'fast')
    const r = absorbWithBarriers([slow, fast], { leve: 2, medio: 0, letal: 0 })
    expect(r.barriers.find((b) => b.id === 'fast')?.wounds.leve).toBe(3)
    expect(r.barriers.find((b) => b.id === 'slow')?.wounds.leve).toBe(5)
  })

  it('las que no vencen solas se gastan al final', () => {
    const manual = { ...barrier(5, 0, 0, 1, 'manual'), duration: { unit: 'manual' as const, remaining: 0 } }
    const timed = barrier(1, 0, 0, 9, 'timed')
    const r = absorbWithBarriers([manual, timed], { leve: 2, medio: 0, letal: 0 })
    expect(r.barriers.find((b) => b.id === 'timed')).toBeUndefined()
    expect(r.barriers.find((b) => b.id === 'manual')?.wounds.leve).toBe(4)
  })

  it('en un NPC la barrera es en puntos', () => {
    const b = (points: number, remaining: number, id: string) => ({
      id, points, duration: { unit: 'turnos' as const, remaining }, combatId: 'c1', createdAt: `2026-01-01T00:00:0${remaining}Z`,
    })
    const r = absorbPointBarriers([b(5, 4, 'a'), b(3, 1, 'b')], 6)
    expect(r.remaining).toBe(0)
    expect(r.barriers).toHaveLength(1)
    expect(r.barriers[0].id).toBe('a')
    expect(r.barriers[0].points).toBe(2)
    expect(absorbPointBarriers([b(2, 1, 'x')], 5).remaining).toBe(3)
  })
})

describe('salvaciones y batería', () => {
  it('la tirada carga la batería: 6-10 suma 1, 1-5 suma 2, más de 10 nada', () => {
    expect(batteryGainFromRoll(10)).toBe(1)
    expect(batteryGainFromRoll(6)).toBe(1)
    expect(batteryGainFromRoll(5)).toBe(2)
    expect(batteryGainFromRoll(1)).toBe(2)
    expect(batteryGainFromRoll(11)).toBe(0)
    expect(() => batteryGainFromRoll(0)).toThrow()
  })

  it('por vías naturales no pasa de 10, pero un regalo sí', () => {
    const s = { ...defaultSaves(), battery: 9 }
    expect(chargeBattery(s, 2, 'natural').battery).toBe(10)
    expect(chargeBattery(s, 5, 'regalo').battery).toBe(14)
    expect(chargeBattery({ ...s, battery: 14 }, 2, 'natural').battery).toBe(14)
  })

  it('con 10 de batería recupera una salvación y la batería se vacía', () => {
    const s = { current: 1, max: 2, unique: 0, battery: 10 }
    expect(claimSaveFromBattery(s)).toEqual({ current: 2, max: 2, unique: 0, battery: 0 })
  })

  it('no recupera si ya tiene el máximo o le falta batería, y la batería se mantiene', () => {
    expect(claimSaveFromBattery({ current: 2, max: 2, unique: 0, battery: 10 })).toBeNull()
    expect(claimSaveFromBattery({ current: 0, max: 2, unique: 0, battery: 9 })).toBeNull()
  })

  it('gasta salvaciones normales y únicas', () => {
    const s = { current: 1, max: 2, unique: 1, battery: 0 }
    expect(spendSave(s, 'normal')?.current).toBe(0)
    expect(spendSave(s, 'unica')?.unique).toBe(0)
    expect(spendSave({ ...s, current: 0 }, 'normal')).toBeNull()
  })
})

describe('combate: orden, turnos y rondas', () => {
  const colt = { id: 'colt', name: 'Colt' }
  const roy = { id: 'roy', name: 'Roy' }

  function world(): World {
    let combat = newCombat('Camino del norte')
    combat = addPcParticipant(combat, colt, 15)
    combat = addPcParticipant(combat, roy, 22)
    combat = addNpcParticipant(combat, { name: 'Goblin 1', profile: defaultEnemyProfile('D') }, 22)
    combat = addNpcParticipant(combat, { name: 'Goblin 2', profile: defaultEnemyProfile('D') }, null)
    const states = {
      colt: initialState({ ...edward, id: 'colt' }),
      roy: initialState({ ...edward, id: 'roy' }),
    }
    return { combat, states }
  }

  it('ordena por iniciativa; los empates siguen el orden de carga y sin tirada va al final', () => {
    expect(orderedParticipants(world().combat.participants).map((p) => p.name)).toEqual([
      'Roy', 'Goblin 1', 'Colt', 'Goblin 2',
    ])
  })

  it('cambiar la iniciativa reordena', () => {
    const w = world()
    const goblin2 = w.combat.participants[3]
    const combat = setInitiative(w.combat, goblin2.id, 30)
    expect(orderedParticipants(combat.participants)[0].name).toBe('Goblin 2')
  })

  it('empieza en ronda 1 con el primero y avisa', () => {
    const w = startCombat(world())
    expect(w.combat.round).toBe(1)
    expect(orderedParticipants(w.combat.participants)[0].id).toBe(w.combat.activeId)
    expect(w.combat.alerts[0].text).toContain('Turno de Roy')
  })

  it('avanza turno a turno y, al terminar el último, inicia una ronda nueva con aviso', () => {
    let w = startCombat(world())
    for (let i = 0; i < 3; i++) w = advanceTurn(w, { tickDurations: true })
    expect(w.combat.round).toBe(1)
    expect(w.combat.activeId).toBe(w.combat.participants[3].id) // Goblin 2, el último

    w = advanceTurn(w, { tickDurations: true })
    expect(w.combat.round).toBe(2)
    expect(w.combat.alerts[0].text).toBe('Inicio de la ronda 2.')
    expect(orderedParticipants(w.combat.participants)[0].id).toBe(w.combat.activeId)
  })

  it('las duraciones en turnos bajan al terminar el turno del afectado y avisan', () => {
    let w = startCombat(world())
    const roy = w.states.roy
    w = {
      ...w,
      states: {
        ...w.states,
        roy: {
          ...roy,
          effects: [fx({ name: 'Furia', duration: { unit: 'turnos', remaining: 1 }, combatId: w.combat.id })],
        },
      },
    }
    // Roy es el primero: al terminar su turno, su buff llega a 0
    w = advanceTurn(w, { tickDurations: true })
    expect(w.states.roy.effects).toEqual([])
    expect(w.combat.alerts.some((a) => a.text.includes('Se terminó el buff "Furia" de Roy'))).toBe(true)
  })

  it('con "sin bajar duraciones" nada vence', () => {
    let w = startCombat(world())
    w = {
      ...w,
      states: {
        ...w.states,
        roy: { ...w.states.roy, effects: [fx({ duration: { unit: 'turnos', remaining: 1 }, combatId: w.combat.id })] },
      },
    }
    w = advanceTurn(w, { tickDurations: false })
    expect(w.states.roy.effects).toHaveLength(1)
  })

  it('las duraciones en rondas bajan en cada ronda nueva, también en los NPC', () => {
    let w = startCombat(world())
    const g = w.combat.participants[2]
    w = {
      ...w,
      combat: {
        ...w.combat,
        participants: w.combat.participants.map((p) =>
          p.id === g.id && p.npc
            ? { ...p, npc: { ...p.npc, effects: [fx({ kind: 'debuff', name: 'Veneno', duration: { unit: 'rondas', remaining: 1 }, combatId: w.combat.id })] } }
            : p,
        ),
      },
    }
    w = advanceRound(w, { tickDurations: true })
    expect(w.combat.round).toBe(2)
    expect(w.combat.participants[2].npc?.effects).toEqual([])
    expect(w.combat.alerts.some((a) => a.text.includes('Se terminó el debuff "Veneno" de Goblin 1'))).toBe(true)
  })

  it('un efecto de otro combate no baja', () => {
    let w = startCombat(world())
    w = {
      ...w,
      states: {
        ...w.states,
        roy: { ...w.states.roy, effects: [fx({ duration: { unit: 'turnos', remaining: 1 }, combatId: 'otro-combate' })] },
      },
    }
    w = advanceTurn(w, { tickDurations: true })
    expect(w.states.roy.effects).toHaveLength(1)
  })

  it('un mismo personaje puede estar en dos combates a la vez', () => {
    const a = addPcParticipant(newCombat('Frente'), colt, 10)
    const b = addPcParticipant(newCombat('Aldea'), colt, 12)
    expect(a.id).not.toBe(b.id)
    expect(a.participants[0].characterId).toBe(b.participants[0].characterId)
  })

  it('quitar al que tiene el turno pasa el turno al siguiente', () => {
    const w = startCombat(world())
    const combat = removeParticipant(w.combat, w.combat.activeId as string)
    expect(combat.participants).toHaveLength(3)
    expect(combat.participants.some((p) => p.id === combat.activeId)).toBe(true)
    expect(combat.participants.find((p) => p.id === combat.activeId)?.name).toBe('Goblin 1')
  })

  it('el NPC en combate es una copia: cambiar su vida no toca el original', () => {
    const profile = defaultEnemyProfile('D')
    const combat = addNpcParticipant(newCombat('x'), { name: 'Goblin', profile }, 5)
    const p = combat.participants[0]
    expect(p.npc?.hpMax).toBe(profile.hp.max)
    expect(p.npc?.profile).not.toBe(profile)
  })
})
