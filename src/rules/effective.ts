import { characterSheet } from './character'
import type { Character, CharacterSheet } from './character'
import { derivedStats } from './derived'
import { SPIRIT_TYPE_ID, effectTotals, effectTotalsSplit, resolveEffects } from './effects'
import type { Effect, EffectBases, EffectTarget, ResolvedEffect } from './effects'
import { enemySheet } from './enemy'
import type { EnemyProfile, EnemySheet } from './enemy'
import { THRESHOLDS } from './hit'
import { baseLimit } from './limit'
import { RANKS } from './ranks'
import type { RankGroup } from './ranks'
import { defaultStatCaps } from './state'
import type { StatCaps } from './state'
import { STAT_NAMES } from './types'
import type { StatName, Stats } from './types'

/** Lo mínimo que hace falta de un derivado para aplicarle buffs y debuffs. */
export interface DerivedLike {
  physDamage: number
  physDamageWithWeapon: number | null
  magicDamage: number
  magicDamageWithWeapon: number | null
  physDefenseCA: number
  physDefenseSA: number
  magicDefenseCA: number
  magicDefenseSA: number
}

/**
 * Valores naturales sobre los que se calculan los porcentajes: sin buffs, armas, armaduras
 * ni accesorios. "Ataque" es el daño físico base y "magia" el daño mágico base.
 */
export function naturalBases(stats: Stats, derived: DerivedLike, limitBase = 0): EffectBases {
  return {
    ...stats,
    limite: limitBase,
    ataque: derived.physDamage,
    magia: derived.magicDamage,
    defensaFisica: derived.physDefenseCA,
    defensaMagica: derived.magicDefenseCA,
  }
}

/** Aplica los efectos de los 7 stats. Un stat no baja de 0. */
export function applyToStats(stats: Stats, totals: Record<EffectTarget, number>): Stats {
  const result = {} as Stats
  for (const name of STAT_NAMES) result[name] = Math.max(0, stats[name] + totals[name])
  return result
}

/**
 * Aplica ataque, magia y defensas sobre los derivados ya calculados con los stats efectivos.
 * Ataque afecta al daño físico con y sin arma. Magia, al daño mágico con y sin arma.
 * Las defensas afectan siempre a CA y SA.
 */
export function applyToDerived<D extends DerivedLike>(derived: D, totals: Record<EffectTarget, number>): D {
  const add = (value: number, delta: number): number => Math.max(0, value + delta)
  return {
    ...derived,
    physDamage: add(derived.physDamage, totals.ataque),
    physDamageWithWeapon:
      derived.physDamageWithWeapon === null ? null : add(derived.physDamageWithWeapon, totals.ataque),
    magicDamage: add(derived.magicDamage, totals.magia),
    magicDamageWithWeapon:
      derived.magicDamageWithWeapon === null ? null : add(derived.magicDamageWithWeapon, totals.magia),
    physDefenseCA: add(derived.physDefenseCA, totals.defensaFisica),
    physDefenseSA: add(derived.physDefenseSA, totals.defensaFisica),
    magicDefenseCA: add(derived.magicDefenseCA, totals.defensaMagica),
    magicDefenseSA: add(derived.magicDefenseSA, totals.defensaMagica),
  }
}

/**
 * Stat contra el que se mide el límite de los buffs de cada stat. Se compara con el valor natural del
 * stat vinculado, sin buffs de ningún tipo (si no, subirlos a la vez no tendría límite).
 */
export const LINKED_STAT: Record<StatName, StatName> = {
  fuerza: 'constitucion',
  destreza: 'constitucion',
  percepcion: 'constitucion',
  constitucion: 'fuerza',
  inteligencia: 'carisma',
  sabiduria: 'inteligencia',
  carisma: 'sabiduria',
}

/** Cuánto puede superar un stat a su stat vinculado por buffs: el tope de la banda Mayor+ de su grupo, más lo que se haya levantado. */
export function buffCap(group: RankGroup, raise = 0): number {
  return Math.max(0, THRESHOLDS[group].mayorPlus + raise)
}

export interface CapInfo {
  stat: StatName
  linked: StatName
  /** Valor máximo al que pueden llevar los buffs a este stat: el natural del vinculado más el límite. */
  limit: number
  /** Lo máximo que puede recibir de buffs (0 si ya estaba por encima del límite). */
  allowed: number
  /** Lo que los buffs sumarían sin límite. */
  requested: number
  /** Lo que realmente suman. */
  applied: number
  /** Los buffs se recortaron. */
  limited: boolean
  /** Opera por encima del límite en este stat (el tope está quitado). */
  open: boolean
  /** Opera por encima del límite: los buffs pasan lo que el límite permitiría. */
  over: boolean
  /** Lo que suma el Espíritu: va aparte, no cuenta para el límite ni se recorta. */
  spirit: number
}

/**
 * Aplica el límite a los buffs de los 7 stats. Los buffs de un stat no pueden llevarlo más de `cap`
 * puntos por encima del valor natural de su stat vinculado. Si ya estaba por encima de forma natural,
 * los buffs no le suman nada, pero nunca se le baja. Solo recorta buffs: los debuffs no lo activan.
 */
export function capStats(
  natural: Stats,
  buffs: Record<string, number>,
  group: RankGroup,
  caps: StatCaps,
  spirit: Record<string, number> = {},
): CapInfo[] {
  const cap = buffCap(group, caps.raise)
  return STAT_NAMES.map((stat) => {
    const linked = LINKED_STAT[stat]
    const limit = natural[linked] + cap
    const allowed = Math.max(0, limit - natural[stat])
    const requested = buffs[stat] ?? 0
    const open = caps.open.includes(stat)
    const applied = open ? requested : Math.min(requested, allowed)
    return {
      stat, linked, limit, allowed, requested, applied,
      limited: !open && requested > allowed,
      open,
      over: open && requested > allowed,
      spirit: spirit[stat] ?? 0,
    }
  })
}

/** Stats con buffs (recortados por el límite) y debuffs: nunca bajan de 0. */
function statsWithEffects(natural: Stats, info: CapInfo[], debuffs: Record<string, number>): Stats {
  const result = {} as Stats
  for (const row of info) {
    result[row.stat] = Math.max(0, natural[row.stat] + row.applied + row.spirit - (debuffs[row.stat] ?? 0))
  }
  return result
}

export interface EffectiveCharacter {
  /** Valores sin efectos. */
  natural: CharacterSheet
  /** Stats y derivados con los buffs y debuffs activos. El rango no cambia. */
  stats: Stats
  derived: CharacterSheet['derived']
  resolved: ResolvedEffect[]
  /** El límite de buffs de cada stat. */
  caps: CapInfo[]
  /** Lo que suman al límite los aumentos activos (habilidades, estados...), sin contar el aumento fijo. */
  limitRaise: number
}

export function effectiveCharacter(
  character: Character,
  effects: Effect[],
  caps: StatCaps = defaultStatCaps(),
): EffectiveCharacter {
  const natural = characterSheet(character)
  const group = natural.rank?.group ?? 'bajo'
  const resolved = resolveEffects(effects, naturalBases(natural.totals, natural.derived, baseLimit(group)))
  const totals = effectTotals(resolved)
  // El Espíritu va aparte: no cuenta para el límite de buffs ni se recorta.
  const split = effectTotalsSplit(resolved.filter((r) => r.effect.typeId !== SPIRIT_TYPE_ID))
  const spirit = effectTotalsSplit(resolved.filter((r) => r.effect.typeId === SPIRIT_TYPE_ID)).buffs
  const capInfo = capStats(natural.totals, split.buffs, group, { ...caps, raise: caps.raise + totals.limite }, spirit)
  const stats = statsWithEffects(natural.totals, capInfo, split.debuffs)
  const derived = applyToDerived(derivedStats(stats, natural.rank, character.derived), totals)
  return { natural, stats, derived, resolved, caps: capInfo, limitRaise: totals.limite }
}

export interface EffectiveEnemy {
  natural: EnemySheet
  stats: Stats
  sheet: EnemySheet
  resolved: ResolvedEffect[]
  /** El límite de buffs de cada stat. */
  caps: CapInfo[]
  /** Lo que suman al límite los aumentos activos, sin contar el aumento fijo. */
  limitRaise: number
}

export function effectiveEnemy(
  profile: EnemyProfile,
  effects: Effect[],
  caps: StatCaps = defaultStatCaps(),
): EffectiveEnemy {
  const natural = enemySheet(profile)
  const group = RANKS.find((r) => r.name === profile.rank)?.group ?? 'bajo'
  const resolved = resolveEffects(effects, naturalBases(natural.stats, natural, baseLimit(group)))
  const totals = effectTotals(resolved)
  const split = effectTotalsSplit(resolved.filter((r) => r.effect.typeId !== SPIRIT_TYPE_ID))
  const spirit = effectTotalsSplit(resolved.filter((r) => r.effect.typeId === SPIRIT_TYPE_ID)).buffs
  const capInfo = capStats(natural.stats, split.buffs, group, { ...caps, raise: caps.raise + totals.limite }, spirit)
  const stats = statsWithEffects(natural.stats, capInfo, split.debuffs)
  const rebuilt = enemySheet({ ...profile, overrides: { ...stats } })
  return { natural, stats, sheet: applyToDerived(rebuilt, totals), resolved, caps: capInfo, limitRaise: totals.limite }
}
