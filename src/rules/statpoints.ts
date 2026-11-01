import type { Character } from './character'
import { STAT_NAMES } from './types'
import type { StatName } from './types'

/**
 * Los puntos que se suben a mano a los stats, sin multiplicador: mérito, despertar, regalo y otros. Cada
 * uno es una fuente plana de cada stat.
 */
export const POINT_SOURCES = ['merito', 'despertar', 'regalo', 'otros'] as const
export type PointSource = (typeof POINT_SOURCES)[number]

/** El valor de esa fuente si es el mismo en todos los stats elegidos; si no, null. */
export function commonPoints(
  character: Pick<Character, 'sources'>,
  source: PointSource,
  stats: readonly StatName[] = STAT_NAMES,
): number | null {
  const values = stats.map((s) => character.sources[s][source])
  return values.length > 0 && values.every((v) => v === values[0]) ? values[0] : null
}

export type RaiseMode = 'sumar' | 'poner'

/**
 * Sube puntos de una fuente en los stats elegidos. "Sumar" suma lo mismo a cada stat, y "poner" deja el
 * mismo valor en todos. Nunca baja de 0, y no toca los demás stats ni las demás fuentes.
 */
export function raisePoints(
  character: Character,
  source: PointSource,
  stats: readonly StatName[],
  amount: number,
  mode: RaiseMode,
): Character {
  const sources = { ...character.sources }
  for (const stat of stats) {
    const current = sources[stat][source]
    sources[stat] = { ...sources[stat], [source]: Math.max(0, mode === 'sumar' ? current + amount : amount) }
  }
  return { ...character, sources }
}
