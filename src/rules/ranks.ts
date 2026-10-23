import { STAT_NAMES } from './types'
import type { StatName, Stats, Tiers } from './types'

export type RankGroup = 'bajo' | 'medio' | 'alto' | 'especial' | 'divino'

export interface Rank {
  name: string
  /** Promedio de stats mínimo para alcanzar este rango. */
  minAverage: number
  group: RankGroup
}

/** Ordenados de menor a mayor. */
export const RANKS: readonly Rank[] = [
  { name: 'E', minAverage: 60, group: 'bajo' },
  { name: 'E+', minAverage: 120, group: 'bajo' },
  { name: 'D', minAverage: 180, group: 'bajo' },
  { name: 'D+', minAverage: 250, group: 'bajo' },
  { name: 'C', minAverage: 320, group: 'medio' },
  { name: 'C+', minAverage: 400, group: 'medio' },
  { name: 'B', minAverage: 480, group: 'medio' },
  { name: 'B+', minAverage: 570, group: 'medio' },
  { name: 'A', minAverage: 670, group: 'alto' },
  { name: 'A+', minAverage: 790, group: 'alto' },
  { name: 'S', minAverage: 930, group: 'alto' },
  { name: 'S+', minAverage: 1110, group: 'alto' },
  { name: 'SS', minAverage: 1330, group: 'especial' },
  { name: 'SS+', minAverage: 1590, group: 'especial' },
  { name: 'SSS', minAverage: 1890, group: 'divino' },
  { name: 'SSS+', minAverage: 2250, group: 'divino' },
]

/**
 * Promedio de stats general (PSG).
 * ((P1²+P2²)^0,5)³ + ((S1³+S2³+S3³)^0,33)³ + ((T1²+T2²)^0,5)³, todo elevado a 0,32,
 * con P = 2 primarios, S = 3 secundarios y T = 2 terciarios.
 */
export function averageStats(stats: Stats, tiers: Tiers): number {
  const byTier: Record<1 | 2 | 3, StatName[]> = { 1: [], 2: [], 3: [] }
  for (const name of STAT_NAMES) byTier[tiers[name]].push(name)

  if (byTier[1].length !== 2 || byTier[2].length !== 3 || byTier[3].length !== 2) {
    throw new Error('Se necesitan 2 stats primarios, 3 secundarios y 2 terciarios.')
  }

  const primarios = byTier[1].reduce((sum, n) => sum + stats[n] ** 2, 0)
  const secundarios = byTier[2].reduce((sum, n) => sum + stats[n] ** 3, 0)
  const terciarios = byTier[3].reduce((sum, n) => sum + stats[n] ** 2, 0)

  const total =
    Math.pow(Math.pow(primarios, 0.5), 3) +
    Math.pow(Math.pow(secundarios, 0.33), 3) +
    Math.pow(Math.pow(terciarios, 0.5), 3)

  return Math.pow(total, 0.32)
}

/** Mayor rango cuyo promedio mínimo no supera `average`. Menos de 60 no tiene rango. */
export function rankFromAverage(average: number): Rank | null {
  let found: Rank | null = null
  for (const rank of RANKS) {
    if (average >= rank.minAverage) found = rank
  }
  return found
}
