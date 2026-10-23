import { STAT_NAMES } from './types'
import type { StatName, StatSources, Stats, Tier, Tiers } from './types'

/**
 * Stat total = (suma de fuentes innatas) × multiplicador + (suma de fuentes planas).
 * Equivale a SUM(B:E)*N + SUM(F:K) del Excel.
 */
export function statTotal(sources: StatSources, multiplier: number): number {
  const innatas =
    sources.puntosIniciales + sources.arbolHeroe + sources.heroe + sources.categoria
  const planas =
    sources.despertar +
    sources.merito +
    sources.entrenamiento +
    sources.regalo +
    sources.drogasShoko +
    sources.otros
  return innatas * multiplier + planas
}

/**
 * Multiplicadores a partir de los tiers y la clase.
 * Primarios: 1,1 (el que potencia la clase) y 1,05. Secundarios: 1,0.
 * Terciarios: 0,95 (el que indica la clase) y 0,9.
 */
export function tierMultipliers(
  tiers: Tiers,
  classPrimary: StatName,
  classTertiary: StatName,
): Stats {
  if (tiers[classPrimary] !== 1) throw new Error('El stat potenciado por clase debe ser primario.')
  if (tiers[classTertiary] !== 3) throw new Error('El stat terciario de clase debe ser terciario.')

  const result = {} as Stats
  for (const name of STAT_NAMES) {
    if (tiers[name] === 1) result[name] = name === classPrimary ? 1.1 : 1.05
    else if (tiers[name] === 2) result[name] = 1
    else result[name] = name === classTertiary ? 0.95 : 0.9
  }
  return result
}

/** Bono de Categoría: X para primarios, X/2 para secundarios y X/4 para terciarios. */
export function categoryBonus(base: number, tier: Tier): number {
  return tier === 1 ? base : tier === 2 ? base / 2 : base / 4
}

/** Stats de entrenamiento según los despertares: lo máximo que se puede entrenar. */
export const TRAINING_TABLE: readonly { awakenings: number; permanent: number; temporary: number }[] = [
  { awakenings: 0, permanent: 15, temporary: 15 },
  { awakenings: 1, permanent: 25, temporary: 25 },
  { awakenings: 2, permanent: 35, temporary: 35 },
  { awakenings: 3, permanent: 50, temporary: 50 },
  { awakenings: 4, permanent: 65, temporary: 65 },
  { awakenings: 5, permanent: 80, temporary: 80 },
  { awakenings: 6, permanent: 100, temporary: 100 },
  { awakenings: 7, permanent: 120, temporary: 120 },
]
