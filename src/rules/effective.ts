import { characterSheet } from './character'
import type { Character, CharacterSheet } from './character'
import { derivedStats } from './derived'
import { effectTotals, resolveEffects } from './effects'
import type { Effect, EffectBases, EffectTarget, ResolvedEffect } from './effects'
import { enemySheet } from './enemy'
import type { EnemyProfile, EnemySheet } from './enemy'
import { STAT_NAMES } from './types'
import type { Stats } from './types'

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
export function naturalBases(stats: Stats, derived: DerivedLike): EffectBases {
  return {
    ...stats,
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

export interface EffectiveCharacter {
  /** Valores sin efectos. */
  natural: CharacterSheet
  /** Stats y derivados con los buffs y debuffs activos. El rango no cambia. */
  stats: Stats
  derived: CharacterSheet['derived']
  resolved: ResolvedEffect[]
}

export function effectiveCharacter(character: Character, effects: Effect[]): EffectiveCharacter {
  const natural = characterSheet(character)
  const resolved = resolveEffects(effects, naturalBases(natural.totals, natural.derived))
  const totals = effectTotals(resolved)
  const stats = applyToStats(natural.totals, totals)
  const derived = applyToDerived(derivedStats(stats, natural.rank, character.derived), totals)
  return { natural, stats, derived, resolved }
}

export interface EffectiveEnemy {
  natural: EnemySheet
  stats: Stats
  sheet: EnemySheet
  resolved: ResolvedEffect[]
}

export function effectiveEnemy(profile: EnemyProfile, effects: Effect[]): EffectiveEnemy {
  const natural = enemySheet(profile)
  const resolved = resolveEffects(effects, naturalBases(natural.stats, natural))
  const totals = effectTotals(resolved)
  const stats = applyToStats(natural.stats, totals)
  const rebuilt = enemySheet({ ...profile, overrides: { ...stats } })
  return { natural, stats, sheet: applyToDerived(rebuilt, totals), resolved }
}
