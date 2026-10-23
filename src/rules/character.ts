import type { DerivedConfig, DerivedStats } from './derived'
import { derivedStats } from './derived'
import { mana, stamina } from './energy'
import type { Health } from './health'
import { averageStats, rankFromAverage } from './ranks'
import type { Rank } from './ranks'
import { statTotal } from './stats'
import { STAT_NAMES } from './types'
import type { StatSources, Stats, Tiers } from './types'

/** Entradas de energía de un personaje. */
export interface CharacterEnergy {
  baseMana: number
  baseStamina: number
  /** Bonos de energía del árbol, ya sumados. */
  bonusMana: number
  bonusStamina: number
}

/** Datos de un personaje que el GM edita. Todo lo demás se calcula. */
export interface Character {
  id: string
  name: string
  playerName: string
  retired: boolean
  className: string
  tiers: Tiers
  multipliers: Stats
  sources: Record<keyof Stats, StatSources>
  energy: CharacterEnergy
  derived: DerivedConfig
  baseHealth: Health
  createdAt: string
  updatedAt: string
}

export interface CharacterSheet {
  totals: Stats
  average: number
  rank: Rank | null
  mana: number
  stamina: number
  derived: DerivedStats
}

/** Calcula todo lo derivado de un personaje a partir de sus datos editables. */
export function characterSheet(c: Character): CharacterSheet {
  const totals = {} as Stats
  for (const name of STAT_NAMES) totals[name] = statTotal(c.sources[name], c.multipliers[name])

  const average = averageStats(totals, c.tiers)
  const rank = rankFromAverage(average)

  return {
    totals,
    average,
    rank,
    mana: mana(totals, { base: c.energy.baseMana, bonus: c.energy.bonusMana }),
    stamina: stamina(totals, { base: c.energy.baseStamina, bonus: c.energy.bonusStamina }),
    derived: derivedStats(totals, rank, c.derived),
  }
}
