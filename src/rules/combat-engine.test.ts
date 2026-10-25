import { describe, expect, it } from 'vitest'
import {
  SKILL_TYPE_ID,
  absorbPointBarriers,
  absorbWithBarriers,
  addEffects,
  addEffectsToMany,
  endSkillForMany,
  removeEffectGroupFrom,
  setSpiritForMany,
  spiritLevel,
  spiritPerLevel,
  withSpirit,
  SPIRIT_TYPE_ID,
  addNpcParticipant,
  addPcParticipant,
  advanceRound,
  advanceTurn,
  recordAction,
  setSide,
  undoLastAction,
  updateParticipant,
  batteryGainFromRoll,
  chargeBattery,
  claimSaveFromBattery,
  defaultEnemyProfile,
  defaultSaves,
  EFFECT_TARGETS,
  LINKED_STAT,
  PICKABLE_TARGETS,
  baseLimit,
  buffCap,
  limitRaiseEffect,
  capStats,
  effectTotals,
  effectiveCharacter,
  effectiveEnemy,
  effectGroup,
  endSkill,
  groupEffects,
  isSkillEffect,
  removeGroup,
  replaceGroup,
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
import type { Combat, Effect, EffectBases } from './index'
import { edward } from './fixtures'

const bases: EffectBases = {
  fuerza: 100, destreza: 100, constitucion: 100, percepcion: 100,
  inteligencia: 100, sabiduria: 100, carisma: 100,
  ataque: 200, magia: 200, defensaFisica: 100, defensaMagica: 100, limite: 300,
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

  // Cinco buffs de tipos distintos sobre un mismo stat, con estos valores
  const five = (values: number[], target: Effect['target'] = 'fuerza', typeIds = ['pasivo', 'pocion', 'estilo', 'estado', 'armamento']) =>
    values.map((flat, i) => fx({ target, typeId: typeIds[i], flat }))
  const states = (list: Effect[]) => resolveEffects(list, bases).map((r) => r.state)

  it('sobre un mismo stat caben 4: quedan los más fuertes y el resto, listado y sin lugar', () => {
    const list = five([10, 20, 30, 40, 50])
    expect(states(list)).toEqual(['sin-lugar', 'activo', 'activo', 'activo', 'activo'])
    expect(effectTotals(resolveEffects(list, bases)).fuerza).toBe(140) // 20 + 30 + 40 + 50
  })

  it('el que queda sin lugar vuelve solo cuando se libera un lugar', () => {
    const list = five([10, 20, 30, 40, 50])
    const withoutStrongest = list.filter((e) => e.flat !== 50)
    expect(states(withoutStrongest)).toEqual(['activo', 'activo', 'activo', 'activo'])
    expect(effectTotals(resolveEffects(withoutStrongest, bases)).fuerza).toBe(100)
  })

  it('en un empate de valor, entra el más reciente', () => {
    const list = five([10, 10, 10, 10, 10]) // el último es el más nuevo
    expect(states(list)).toEqual(['sin-lugar', 'activo', 'activo', 'activo', 'activo'])
  })

  it('un quinto del mismo tipo que otro no ocupa lugar nuevo: solo se pisa', () => {
    const list = [...five([10, 20, 30, 40]), fx({ target: 'fuerza', typeId: 'pocion', flat: 5 })]
    const r = states(list)
    expect(r.filter((s) => s === 'activo')).toHaveLength(4)
    expect(r.at(-1)).toBe('pisado')
  })

  it('el límite es por stat y por clase: otro stat, o los debuffs, tienen sus propios 4', () => {
    const list = [
      ...five([10, 20, 30, 40, 50]),
      ...five([1, 2, 3, 4, 5], 'destreza'),
      ...five([10, 20, 30, 40, 50]).map((e) => ({ ...e, kind: 'debuff' as const })),
    ]
    const resolved = resolveEffects(list, bases)
    for (const [target, kind] of [['fuerza', 'buff'], ['destreza', 'buff'], ['fuerza', 'debuff']] as const) {
      const mine = resolved.filter((r) => r.effect.target === target && r.effect.kind === kind)
      expect(mine.filter((r) => r.state === 'activo')).toHaveLength(4)
      expect(mine.filter((r) => r.state === 'sin-lugar')).toHaveLength(1)
    }
  })

  it('una habilidad fuerte desplaza al más débil mientras dura, y este vuelve al terminar', () => {
    const base = five([10, 20, 30, 40], 'fuerza', ['pasivo', 'pocion', 'estilo', 'estado'])
    const skill = fx({ target: 'fuerza', typeId: SKILL_TYPE_ID, flat: 100, duration: { unit: 'habilidad', remaining: 0 } })
    const during = resolveEffects([...base, skill], bases)
    expect(during.find((r) => r.effect.flat === 10)?.state).toBe('sin-lugar') // el más débil sale
    expect(effectTotals(during).fuerza).toBe(190) // 20 + 30 + 40 + 100

    const after = resolveEffects(endSkill([...base, skill]).effects, bases)
    expect(after.every((r) => r.state === 'activo')).toBe(true)
    expect(effectTotals(after).fuerza).toBe(100)
  })
})

describe('el mismo efecto sobre varios stats', () => {
  const sameBuff = (targets: Effect['target'][], typeId = 'pocion'): Effect[] =>
    targets.map((target) => fx({ target, typeId, flat: 10 }))

  it('agrega uno por stat', () => {
    const list = addEffects([], sameBuff(['fuerza', 'destreza', 'ataque']))
    expect(list.map((e) => e.target)).toEqual(['fuerza', 'destreza', 'ataque'])
  })

  it('cada stat cumple sus propias reglas: el pisado por tipo es por stat', () => {
    const existing = [fx({ target: 'fuerza', typeId: 'pocion', flat: 50 })]
    const resolved = resolveEffects(addEffects(existing, sameBuff(['fuerza', 'destreza'])), bases)
    // en Fuerza la poción nueva (10) queda pisada por la de 50, en Destreza está activa
    expect(resolved.find((r) => r.effect.target === 'destreza')?.state).toBe('activo')
    expect(resolved.filter((r) => r.effect.target === 'fuerza').map((r) => r.state)).toEqual(['activo', 'pisado'])
  })

  it('si un stat ya tiene 4, entran igual: los demás quedan activos y ese deja al más débil sin lugar', () => {
    let full: Effect[] = []
    for (const [i, typeId] of ['pasivo', 'pocion', 'estilo', 'estado'].entries()) {
      full = addEffects(full, [fx({ target: 'destreza', typeId, flat: 10 * (i + 1) })]) // 10, 20, 30, 40
    }
    const list = addEffects(full, sameBuff(['fuerza', 'destreza', 'carisma'], 'armamento')) // +10 en cada uno
    const resolved = resolveEffects(list, bases)
    const dest = resolved.filter((r) => r.effect.target === 'destreza')
    expect(dest.map((r) => r.state)).toEqual(['sin-lugar', 'activo', 'activo', 'activo', 'activo']) // el 10 más viejo sale
    expect(resolved.find((r) => r.effect.target === 'fuerza')?.state).toBe('activo')
    expect(resolved.find((r) => r.effect.target === 'carisma')?.state).toBe('activo')
  })

  it('una lista vacía no cambia nada', () => {
    const existing = [fx({})]
    expect(addEffects(existing, [])).toEqual(existing)
  })
})

describe('aplicar a varios combatientes', () => {
  const colt = { ...edward, id: 'colt', name: 'Colt' }

  function team() {
    let c = newCombat('Equipo')
    c = addPcParticipant(c, colt, 10)
    c = addPcParticipant(c, { ...edward, id: 'roy', name: 'Roy' }, 8)
    c = addNpcParticipant(c, { name: 'Goblin', profile: defaultEnemyProfile('D') }, 5)
    return c
  }
  const effectsOfName = (c: Combat, name: string) => {
    const p = c.participants.find((x) => x.name === name)!
    return p.pc?.effects ?? p.npc?.effects ?? []
  }

  it('el mismo buff entra en cada uno de los elegidos, y los demás no se tocan', () => {
    const c = team()
    const ids = Object.fromEntries(c.participants.map((p) => [p.name, p.id]))
    const next = addEffectsToMany(c, {
      [ids.Colt]: [fx({ target: 'fuerza', flat: 20 })],
      [ids.Goblin]: [fx({ target: 'fuerza', flat: 20 }), fx({ target: 'destreza', flat: 20 })],
    })
    expect(effectsOfName(next, 'Colt')).toHaveLength(1)
    expect(effectsOfName(next, 'Goblin')).toHaveLength(2)
    expect(effectsOfName(next, 'Roy')).toHaveLength(0)
  })

  it('"Terminó la habilidad" para varios quita lo de la habilidad solo a los elegidos', () => {
    const c0 = team()
    const ids = Object.fromEntries(c0.participants.map((p) => [p.name, p.id]))
    const skill = () => fx({ typeId: 'habilidad' })
    const c = addEffectsToMany(c0, {
      [ids.Colt]: [skill(), fx({ typeId: 'pocion' })],
      [ids.Roy]: [skill()],
      [ids.Goblin]: [skill()],
    })
    const next = endSkillForMany(c, [ids.Colt, ids.Goblin])
    expect(effectsOfName(next, 'Colt').map((e) => e.typeId)).toEqual(['pocion'])
    expect(effectsOfName(next, 'Goblin')).toHaveLength(0)
    expect(effectsOfName(next, 'Roy')).toHaveLength(1) // no estaba elegido
  })

  it('quita un buff entero de un combatiente', () => {
    const c0 = team()
    const id = c0.participants[0].id
    const c = addEffectsToMany(c0, {
      [id]: [fx({ target: 'fuerza', group: 'g' }), fx({ target: 'destreza', group: 'g' }), fx({ target: 'carisma' })],
    })
    expect(effectsOfName(removeEffectGroupFrom(c, id, 'g'), 'Colt')).toHaveLength(1)
  })
})

describe('Espíritu', () => {
  it('cada nivel suma el 10 % del límite del grupo: Bajo 20, Medio 30, Alto 40, Especial 70, Divino 100', () => {
    expect(['bajo', 'medio', 'alto', 'especial', 'divino'].map((g) => spiritPerLevel(g as never))).toEqual([20, 30, 40, 70, 100])
  })

  it('es un buff a los 7 stats, de tipo propio, que dura hasta que se quite', () => {
    const effects = withSpirit([], 3, 'bajo', 'c1') // Roy (rango D+): 20 por nivel
    expect(effects).toHaveLength(7)
    expect(effects.every((e) => e.kind === 'buff' && e.typeId === SPIRIT_TYPE_ID && e.flat === 60 && e.duration.unit === 'manual')).toBe(true)
    expect(new Set(effects.map((e) => e.group)).size).toBe(1) // un solo buff
    expect(spiritLevel(effects)).toBe(3)
  })

  it('tiene 10 niveles: más de 10 se queda en 10, y 0 lo quita', () => {
    expect(spiritLevel(withSpirit([], 15, 'medio', null))).toBe(10)
    expect(withSpirit([], 10, 'medio', null)[0].flat).toBe(300) // 100 % del límite
    expect(withSpirit(withSpirit([], 4, 'medio', null), 0, 'medio', null)).toEqual([])
    expect(spiritLevel([])).toBe(0)
  })

  it('cambiar el nivel reemplaza al anterior (se puede bajar) y no toca otros buffs', () => {
    const other = fx({ target: 'fuerza', typeId: 'pocion', flat: 5 })
    const up = withSpirit([other], 5, 'medio', null)
    const down = withSpirit(up, 2, 'medio', null)
    expect(down.filter((e) => e.typeId === SPIRIT_TYPE_ID)).toHaveLength(7)
    expect(spiritLevel(down)).toBe(2)
    expect(down).toContain(other)
  })

  it('ocupa un lugar de los 4 por stat, con su propio tipo', () => {
    const five = ['pasivo', 'pocion', 'estilo', 'estado'].map((typeId, i) => fx({ target: 'fuerza', typeId, flat: 10 * (i + 1) }))
    const resolved = resolveEffects([...five, ...withSpirit([], 1, 'medio', null).filter((e) => e.target === 'fuerza')], bases)
    // el Espíritu (30) entra y deja sin lugar al más débil (10)
    expect(resolved.find((r) => r.effect.typeId === SPIRIT_TYPE_ID)?.state).toBe('activo')
    expect(resolved.find((r) => r.effect.flat === 10)?.state).toBe('sin-lugar')
  })

  it('no cuenta para el límite de buffs: se suma aparte y no se recorta', () => {
    // Edward (C+, límite 300): Inteligencia natural 115, tope por buffs 473
    const buff = fx({ target: 'inteligencia', flat: 400 })
    const spirit = withSpirit([], 10, 'medio', null) // +300 a cada stat
    const view = effectiveCharacter(edward, [buff, ...spirit])
    expect(view.stats.inteligencia).toBeCloseTo(473 + 300, 6) // el buff se recorta a 473 y el Espíritu suma encima
    const int = view.caps.find((r) => r.stat === 'inteligencia')!
    expect(int.spirit).toBe(300)
    expect(int.applied).toBeCloseTo(473 - 115.04, 6) // el Espíritu no consumió lugar del tope
    expect(view.stats.fuerza).toBeCloseTo(effectiveCharacter(edward, []).stats.fuerza + 300, 6)
  })

  it('funciona en un NPC según su rango, y para varios a la vez', () => {
    const c0 = newCombat('x')
    const withNpc = addNpcParticipant(addNpcParticipant(c0, { name: 'A', profile: defaultEnemyProfile('D') }, 1), { name: 'B', profile: defaultEnemyProfile('SS') }, 2)
    const [a, b] = withNpc.participants
    const c = setSpiritForMany(withNpc, [
      { id: a.id, level: 2, group: 'bajo' }, // D: 20 por nivel
      { id: b.id, level: 2, group: 'especial' }, // SS: 70 por nivel
    ])
    const flat = (name: string) => c.participants.find((p) => p.name === name)?.npc?.effects[0].flat
    expect([flat('A'), flat('B')]).toEqual([40, 140])
    // ponerlo en 0 lo quita
    const cleared = setSpiritForMany(c, [{ id: a.id, level: 0, group: 'bajo' }])
    expect(cleared.participants.find((p) => p.name === 'A')?.npc?.effects).toEqual([])
  })
})

describe('terminó la habilidad y grupos de efectos', () => {
  it('quita los de tipo habilidad y también los que duran "hasta que termine la habilidad", sea cual sea su tipo', () => {
    const skillType = fx({ typeId: 'habilidad', duration: { unit: 'manual', remaining: 0 } })
    const skillDuration = fx({ typeId: 'potenciador', duration: { unit: 'habilidad', remaining: 0 } })
    const keep = fx({ typeId: 'pocion', duration: { unit: 'turnos', remaining: 2 } })
    const keepManual = fx({ typeId: 'estilo', duration: { unit: 'manual', remaining: 0 } })
    const result = endSkill([skillType, skillDuration, keep, keepManual])
    expect(result.removed.map((e) => e.id).sort()).toEqual([skillType.id, skillDuration.id].sort())
    expect(result.effects).toEqual([keep, keepManual])
    expect([isSkillEffect(skillType), isSkillEffect(skillDuration), isSkillEffect(keep)]).toEqual([true, true, false])
  })

  it('quita todos los stats de un buff de varios stats, no solo uno', () => {
    const four = (['fuerza', 'destreza', 'constitucion', 'percepcion'] as const).map((target) =>
      fx({ typeId: 'habilidad', target, flat: 20, duration: { unit: 'habilidad', remaining: 0 }, group: 'g1' }),
    )
    expect(endSkill([...four, fx({ typeId: 'pocion' })]).effects).toHaveLength(1)
  })

  it('un grupo es el conjunto de efectos creados juntos, y sin grupo cada efecto es el suyo', () => {
    const a = fx({ target: 'fuerza', group: 'g1' })
    const b = fx({ target: 'destreza', group: 'g1' })
    const solo = fx({ target: 'carisma' })
    const items = [a, b, solo].map((effect) => ({ effect }))
    expect(groupEffects(items).map((g) => [g.group, g.items.length])).toEqual([['g1', 2], [solo.id, 1]])
    expect(effectGroup(solo)).toBe(solo.id)
    expect(removeGroup([a, b, solo], 'g1')).toEqual([solo])
  })

  it('reemplazar un grupo (la habilidad sube de nivel) cambia todos sus stats de una vez', () => {
    const old = (['fuerza', 'destreza'] as const).map((target) =>
      fx({ target, typeId: 'habilidad', flat: 20, group: 'g1', name: 'Furia' }),
    )
    const other = fx({ target: 'fuerza', typeId: 'pocion', flat: 5 })
    const next = (['fuerza', 'destreza', 'carisma'] as const).map((target) =>
      fx({ target, typeId: 'habilidad', flat: 35, name: 'Furia' }),
    )
    const result = replaceGroup([...old, other], 'g1', next)
    expect(result.filter((e) => e.group === 'g1').map((e) => [e.target, e.flat])).toEqual([
      ['fuerza', 35],
      ['destreza', 35],
      ['carisma', 35],
    ])
    expect(result).toContain(other)
    expect(result.some((e) => e.flat === 20)).toBe(false)
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
  const colt = { ...edward, id: 'colt', name: 'Colt' }
  const roy = { ...edward, id: 'roy', name: 'Roy' }

  function combat(): Combat {
    let c = newCombat('Camino del norte')
    c = addPcParticipant(c, colt, 15)
    c = addPcParticipant(c, roy, 22)
    c = addNpcParticipant(c, { name: 'Goblin 1', profile: defaultEnemyProfile('D') }, 22)
    c = addNpcParticipant(c, { name: 'Goblin 2', profile: defaultEnemyProfile('D') }, null)
    return c
  }

  const withPcEffects = (c: Combat, name: string, effects: Effect[]): Combat =>
    updateParticipant(c, c.participants.find((p) => p.name === name)!.id, (p) => ({
      ...p,
      pc: p.pc ? { ...p.pc, effects } : null,
    }))

  it('ordena por iniciativa; los empates siguen el orden de carga y sin tirada va al final', () => {
    expect(orderedParticipants(combat().participants).map((p) => p.name)).toEqual([
      'Roy', 'Goblin 1', 'Colt', 'Goblin 2',
    ])
  })

  it('cambiar la iniciativa reordena', () => {
    const c = combat()
    const goblin2 = c.participants[3]
    expect(orderedParticipants(setInitiative(c, goblin2.id, 30).participants)[0].name).toBe('Goblin 2')
  })

  it('los jugadores son "jugador" y los NPC enemigos por defecto, pudiendo marcarse aliados', () => {
    let c = combat()
    expect(c.participants.map((p) => p.side)).toEqual(['jugador', 'jugador', 'enemigo', 'enemigo'])
    c = setSide(c, c.participants[2].id, 'aliado')
    expect(c.participants[2].side).toBe('aliado')
    c = setSide(c, c.participants[0].id, 'enemigo') // un jugador no cambia de bando
    expect(c.participants[0].side).toBe('jugador')
  })

  it('empieza en ronda 1 con el primero y avisa', () => {
    const c = startCombat(combat())
    expect(c.round).toBe(1)
    expect(orderedParticipants(c.participants)[0].id).toBe(c.activeId)
    expect(c.alerts[0].text).toContain('Turno de Roy')
  })

  it('avanza turno a turno y, al terminar el último, inicia una ronda nueva con aviso', () => {
    let c = startCombat(combat())
    for (let i = 0; i < 3; i++) c = advanceTurn(c, { tickDurations: true })
    expect(c.round).toBe(1)
    expect(c.activeId).toBe(c.participants[3].id) // Goblin 2, el último

    c = advanceTurn(c, { tickDurations: true })
    expect(c.round).toBe(2)
    expect(c.alerts[0].text).toBe('Inicio de la ronda 2.')
    expect(orderedParticipants(c.participants)[0].id).toBe(c.activeId)
  })

  it('las duraciones en turnos bajan al terminar el turno del afectado y avisan', () => {
    let c = startCombat(combat())
    c = withPcEffects(c, 'Roy', [fx({ name: 'Furia', duration: { unit: 'turnos', remaining: 1 }, combatId: c.id })])
    c = advanceTurn(c, { tickDurations: true }) // Roy es el primero
    expect(c.participants.find((p) => p.name === 'Roy')?.pc?.effects).toEqual([])
    expect(c.alerts.some((a) => a.text.includes('Se terminó el buff "Furia" de Roy'))).toBe(true)
  })

  it('con "sin bajar duraciones" nada vence', () => {
    let c = startCombat(combat())
    c = withPcEffects(c, 'Roy', [fx({ duration: { unit: 'turnos', remaining: 1 }, combatId: c.id })])
    c = advanceTurn(c, { tickDurations: false })
    expect(c.participants.find((p) => p.name === 'Roy')?.pc?.effects).toHaveLength(1)
  })

  it('las duraciones en rondas bajan en cada ronda nueva, también en los NPC', () => {
    let c = startCombat(combat())
    const g = c.participants[2]
    c = updateParticipant(c, g.id, (p) => ({
      ...p,
      npc: p.npc
        ? { ...p.npc, effects: [fx({ kind: 'debuff', name: 'Veneno', duration: { unit: 'rondas', remaining: 1 }, combatId: c.id })] }
        : null,
    }))
    c = advanceRound(c, { tickDurations: true })
    expect(c.round).toBe(2)
    expect(c.participants[2].npc?.effects).toEqual([])
    expect(c.alerts.some((a) => a.text.includes('Se terminó el debuff "Veneno" de Goblin 1'))).toBe(true)
  })

  it('un efecto de otro combate no baja', () => {
    let c = startCombat(combat())
    c = withPcEffects(c, 'Roy', [fx({ duration: { unit: 'turnos', remaining: 1 }, combatId: 'otro-combate' })])
    c = advanceTurn(c, { tickDurations: true })
    expect(c.participants.find((p) => p.name === 'Roy')?.pc?.effects).toHaveLength(1)
  })

  it('un mismo personaje en dos combates tiene estados separados', () => {
    const a = addPcParticipant(newCombat('Principal'), colt, 10)
    const b = addPcParticipant(newCombat('Alterna'), colt, 12)
    const hurt = updateParticipant(a, a.participants[0].id, (p) => ({
      ...p,
      pc: p.pc ? { ...p.pc, health: { leve: 1, medio: 0, letal: 1 } } : null,
    }))
    expect(hurt.participants[0].pc?.health).toEqual({ leve: 1, medio: 0, letal: 1 })
    expect(b.participants[0].pc?.health).toEqual(edward.baseHealth)
  })

  it('quitar al que tiene el turno pasa el turno al siguiente', () => {
    const c0 = startCombat(combat())
    const c = removeParticipant(c0, c0.activeId as string)
    expect(c.participants).toHaveLength(3)
    expect(c.participants.find((p) => p.id === c.activeId)?.name).toBe('Goblin 1')
  })

  it('el NPC en combate es una copia: cambiar su vida no toca el original', () => {
    const profile = defaultEnemyProfile('D')
    const c = addNpcParticipant(newCombat('x'), { name: 'Goblin', profile }, 5)
    expect(c.participants[0].npc?.hpMax).toBe(profile.hp.max)
    expect(c.participants[0].npc?.profile).not.toBe(profile)
  })

  it('deshacer devuelve al participante a como estaba y quita la acción del historial', () => {
    let c = combat()
    const target = c.participants[2]
    c = recordAction(c, 'Colt → Goblin 1', target)
    c = updateParticipant(c, target.id, (p) => ({ ...p, npc: p.npc ? { ...p.npc, hpCurrent: 1 } : null }))
    expect(c.participants[2].npc?.hpCurrent).toBe(1)

    c = undoLastAction(c)
    expect(c.participants[2].npc?.hpCurrent).toBe(target.npc?.hpCurrent)
    expect(c.history).toEqual([])
    expect(undoLastAction(c)).toBe(c) // sin nada que deshacer
  })

  it('el historial guarda las últimas 10 acciones', () => {
    let c = combat()
    for (let i = 0; i < 12; i++) c = recordAction(c, `acción ${i}`, c.participants[0])
    expect(c.history).toHaveLength(10)
    expect(c.history[0].text).toBe('acción 11')
  })
})

describe('límite de los buffs', () => {
  const natural = {
    fuerza: 100, destreza: 100, constitucion: 150, percepcion: 100,
    inteligencia: 100, sabiduria: 100, carisma: 100,
  }
  const none = { open: [] as never[], raise: 0 }

  it('el límite es el tope de la banda Mayor+ del grupo, más lo que se levante', () => {
    expect([buffCap('bajo'), buffCap('medio'), buffCap('alto'), buffCap('especial'), buffCap('divino')]).toEqual([
      200, 300, 400, 700, 1000,
    ])
    expect(buffCap('bajo', 50)).toBe(250)
  })

  it('cada stat tiene su stat vinculado', () => {
    expect(LINKED_STAT).toEqual({
      fuerza: 'constitucion', destreza: 'constitucion', percepcion: 'constitucion', constitucion: 'fuerza',
      inteligencia: 'carisma', sabiduria: 'inteligencia', carisma: 'sabiduria',
    })
  })

  it('rango D: un stat no pasa de 200 sobre el natural de su vinculado (ejemplo Fuerza con Constitución 150)', () => {
    const [fuerza] = capStats(natural, { fuerza: 400 }, 'bajo', none)
    expect(fuerza.limit).toBe(350) // 150 + 200
    expect(fuerza.allowed).toBe(250) // 350 - 100 de Fuerza natural
    expect(fuerza.requested).toBe(400)
    expect(fuerza.applied).toBe(250)
    expect(fuerza.limited).toBe(true)
  })

  it('un buff que entra en el límite no se toca', () => {
    const [fuerza] = capStats(natural, { fuerza: 200 }, 'bajo', none)
    expect([fuerza.applied, fuerza.limited]).toEqual([200, false])
  })

  it('se mide contra el stat natural: los buffs del vinculado no suben el límite', () => {
    // Constitución natural 150, aunque tenga buffs el límite de Fuerza sigue en 350
    const rows = capStats(natural, { fuerza: 400, constitucion: 999 }, 'bajo', none)
    expect(rows.find((r) => r.stat === 'fuerza')?.limit).toBe(350)
  })

  it('sin buffs no hay nada que recortar', () => {
    for (const r of capStats(natural, {}, 'bajo', none)) expect([r.requested, r.applied, r.limited]).toEqual([0, 0, false])
  })

  it('un stat que ya estaba por encima del límite no recibe buffs, pero no se le baja', () => {
    const high = { ...natural, fuerza: 700 } // 700 contra 150 + 200
    const [fuerza] = capStats(high, { fuerza: 50 }, 'bajo', none)
    expect([fuerza.allowed, fuerza.applied, fuerza.limited]).toEqual([0, 0, true])
  })

  it('operar por encima del límite quita el tope solo de ese stat', () => {
    const rows = capStats(natural, { fuerza: 400, destreza: 400 }, 'bajo', { raise: 0, open: ['fuerza'] })
    const fuerza = rows.find((r) => r.stat === 'fuerza')!
    const destreza = rows.find((r) => r.stat === 'destreza')!
    expect([fuerza.applied, fuerza.over, fuerza.limited]).toEqual([400, true, false])
    expect([destreza.applied, destreza.limited]).toEqual([250, true]) // tope 150 + 200 = 350, menos los 100 naturales
  })

  it('subir el límite lo levanta para todos los stats', () => {
    const [fuerza] = capStats(natural, { fuerza: 400 }, 'bajo', { raise: 100, open: [] })
    expect(fuerza.limit).toBe(450)
    expect(fuerza.applied).toBe(350)
  })

  it('en un personaje real: Edward (rango C+, límite 300) con +400 de Inteligencia', () => {
    const buff = fx({ target: 'inteligencia', flat: 400 })
    const view = effectiveCharacter(edward, [buff])
    const int = view.caps.find((r) => r.stat === 'inteligencia')!
    expect(int.limit).toBeCloseTo(173 + 300, 6) // Carisma natural + 300
    expect(int.applied).toBeCloseTo(473 - 115.04, 6)
    expect(view.stats.inteligencia).toBeCloseTo(473, 6)

    expect(effectiveCharacter(edward, [buff], { raise: 100, open: [] }).stats.inteligencia).toBeCloseTo(515.04, 6)
    expect(effectiveCharacter(edward, [buff], { raise: 0, open: ['inteligencia'] }).stats.inteligencia).toBeCloseTo(515.04, 6)
  })

  it('los debuffs no activan el límite y se restan después del recorte', () => {
    const buff = fx({ target: 'inteligencia', flat: 400 })
    const debuff = fx({ kind: 'debuff', target: 'inteligencia', flat: 50, typeId: 'estado' })
    expect(effectiveCharacter(edward, [buff, debuff]).stats.inteligencia).toBeCloseTo(473 - 50, 6)
    expect(effectiveCharacter(edward, [debuff]).caps.every((r) => !r.limited)).toBe(true)
  })

  it('ataque, magia y defensas no tienen límite', () => {
    const base = effectiveCharacter(edward, [])
    const buffed = effectiveCharacter(edward, [fx({ target: 'ataque', flat: 5000 })])
    expect(buffed.derived.physDamage).toBeCloseTo(base.derived.physDamage + 5000, 6)
  })

  it('un NPC también tiene límite, según su rango', () => {
    const profile = defaultEnemyProfile('C+') // grupo medio, límite 300; Fuerza 350 y Constitución 250
    const buff = fx({ target: 'fuerza', flat: 500 })
    const view = effectiveEnemy(profile, [buff])
    expect(view.caps.find((r) => r.stat === 'fuerza')?.limit).toBe(550) // 250 + 300
    expect(view.stats.fuerza).toBe(550)
    expect(effectiveEnemy(profile, [buff], { raise: 0, open: ['fuerza'] }).stats.fuerza).toBe(850)
  })
})

describe('aumento del límite de buffs', () => {
  const raise = (flat: number, typeId: string, extra: Partial<Effect> = {}): Effect => ({
    ...limitRaiseEffect(
      { name: 'Aumento', typeId, flat, percent: 0, duration: { unit: 'manual', remaining: 0 } },
      null,
    ),
    ...extra,
  })
  // Edward (C+, límite base 300): Inteligencia natural 115,04 y Carisma natural 173 → tope 473
  const sobrecarga = () => fx({ target: 'inteligencia', flat: 400 })

  it('es un efecto sobre el límite, con origen, y no se elige entre los stats', () => {
    expect(EFFECT_TARGETS).toContain('limite')
    expect(PICKABLE_TARGETS).not.toContain('limite')
    const r = raise(100, 'habilidad')
    expect([r.kind, r.target, r.typeId, r.flat]).toEqual(['buff', 'limite', 'habilidad', 100])
    expect(baseLimit('medio')).toBe(300)
  })

  it('sube el límite de los 7 stats y deja pasar buffs que antes se recortaban', () => {
    expect(effectiveCharacter(edward, [sobrecarga()]).stats.inteligencia).toBeCloseTo(473, 6)
    const view = effectiveCharacter(edward, [sobrecarga(), raise(100, 'habilidad')])
    expect(view.limitRaise).toBe(100)
    expect(view.stats.inteligencia).toBeCloseTo(515.04, 6) // tope 573: el buff entra entero
    expect(view.caps.find((r) => r.stat === 'inteligencia')?.limit).toBeCloseTo(573, 6)
    const base = effectiveCharacter(edward, []).caps
    for (const r of view.caps) {
      expect(r.limit - base.find((x) => x.stat === r.stat)!.limit).toBeCloseTo(100, 6) // los 7 stats suben igual
    }
  })

  it('de cada origen vale el más fuerte, y los distintos se suman', () => {
    // dos aumentos por estado: solo vale el mayor; uno por habilidad se suma
    const view = effectiveCharacter(edward, [raise(50, 'estado'), raise(80, 'estado'), raise(40, 'habilidad')])
    expect(view.limitRaise).toBe(120)
  })

  it('puede ser un porcentaje del límite base del rango', () => {
    const percent = { ...raise(0, 'estado'), percent: 10 } // 10 % de 300
    expect(effectiveCharacter(edward, [percent]).limitRaise).toBe(30)
  })

  it('"Terminó la habilidad" quita los aumentos que vienen de una habilidad', () => {
    const effects = [sobrecarga(), raise(100, 'habilidad'), raise(20, 'estado')]
    const after = endSkill(effects).effects
    expect(effectiveCharacter(edward, effects).limitRaise).toBe(120)
    expect(effectiveCharacter(edward, after).limitRaise).toBe(20)
  })

  it('un debuff sobre el límite lo baja, y el límite nunca baja de 0', () => {
    const lower = { ...raise(100, 'estado'), kind: 'debuff' as const }
    expect(effectiveCharacter(edward, [lower]).limitRaise).toBe(-100)
    expect(buffCap('medio', -1000)).toBe(0)
  })

  it('se suma al aumento fijo sin origen', () => {
    const view = effectiveCharacter(edward, [raise(50, 'habilidad')], { raise: 25, open: [] })
    expect(view.caps[0].limit - effectiveCharacter(edward, []).caps[0].limit).toBe(75)
  })

  it('no tiene relación con el Espíritu: no cambia su valor ni lo recorta', () => {
    const spirit = withSpirit([], 10, 'medio', null)
    const plain = effectiveCharacter(edward, spirit)
    const raised = effectiveCharacter(edward, [...spirit, raise(100, 'habilidad')])
    expect(spiritPerLevel('medio')).toBe(30) // el 10 % del límite base, sin contar aumentos
    expect(raised.stats.fuerza).toBeCloseTo(plain.stats.fuerza, 6)
    expect(raised.stats.inteligencia).toBeCloseTo(plain.stats.inteligencia, 6)
  })

  it('funciona en un NPC según su rango', () => {
    const profile = defaultEnemyProfile('C+') // límite 300; Fuerza 350 contra Constitución 250
    const buff = fx({ target: 'fuerza', flat: 500 })
    expect(effectiveEnemy(profile, [buff]).stats.fuerza).toBe(550)
    expect(effectiveEnemy(profile, [buff, raise(200, 'habilidad')]).stats.fuerza).toBe(750)
  })

  it('sigue las reglas de los efectos: solo caben 4 aumentos de orígenes distintos', () => {
    const five = ['pasivo', 'pocion', 'estilo', 'estado', 'armamento'].map((t, i) => raise(10 * (i + 1), t))
    const resolved = resolveEffects(five, { ...bases })
    expect(resolved.filter((r) => r.state === 'activo')).toHaveLength(4)
    expect(resolved[0].state).toBe('sin-lugar') // el más débil
    expect(effectiveCharacter(edward, five).limitRaise).toBe(140)
  })
})
