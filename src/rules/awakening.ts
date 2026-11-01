import type { Character } from './character'
import { STAT_NAMES } from './types'

/**
 * El despertar es el mismo monto para los 7 stats, y se suma al total sin multiplicador. Estas funciones
 * lo cambian en todos a la vez, para no tener que repetirlo en cada rama.
 */

/** El despertar de los 7 stats si es el mismo en todos; si no, null. */
export function commonAwakening(character: Pick<Character, 'sources'>): number | null {
  const values = STAT_NAMES.map((s) => character.sources[s].despertar)
  return values.every((v) => v === values[0]) ? values[0] : null
}

function withAwakening(character: Character, change: (current: number) => number): Character {
  const sources = { ...character.sources }
  for (const stat of STAT_NAMES) {
    sources[stat] = { ...sources[stat], despertar: Math.max(0, change(sources[stat].despertar)) }
  }
  return { ...character, sources }
}

/** Pone el mismo despertar (0 o más) en los 7 stats. */
export function setAwakening(character: Character, value: number): Character {
  return withAwakening(character, () => value)
}

/** Suma (o resta) lo mismo al despertar de cada stat, sin bajar de 0. */
export function addAwakening(character: Character, delta: number): Character {
  return withAwakening(character, (current) => current + delta)
}
