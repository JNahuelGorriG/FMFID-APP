import type { Techniques } from './derived'
import type { EffectTarget } from './effects'

/** Potenciaciones que se pueden aplicar como buff, con el nombre que se muestra. */
export const TECHNIQUES: { key: keyof Techniques; name: string }[] = [
  { key: 'kyushu', name: 'Kyushu' },
  { key: 'magyushuru', name: 'Magyushuru' },
  { key: 'aetheriumAscendance', name: 'Aetherium Ascendance' },
  { key: 'aetheriumMastery', name: 'Aetherium Mastery' },
  { key: 'reiatsu', name: 'Reiatsu' },
  { key: 'ki', name: 'Ki' },
  { key: 'haKi', name: 'Ha-Ki' },
  { key: 'esencia', name: 'Esencia' },
  { key: 'eReinforced', name: 'E. Reinforced' },
  { key: 'reiatsuOverride', name: 'Reiatsu Override' },
]

/**
 * A qué suma una potenciación. "preguntar" deja la elección para cada uso (depende de cómo la
 * use el jugador). "ofensivo" es el stat ofensivo del combatiente (Fuerza o Destreza).
 */
export type TechniqueTarget = EffectTarget | 'ofensivo' | 'preguntar'

/** Por defecto se pregunta en cada uso: el mismo Kyushu puede servir para cosas distintas. */
export const DEFAULT_TECHNIQUE_TARGETS: Record<keyof Techniques, TechniqueTarget> = {
  kyushu: 'preguntar',
  magyushuru: 'preguntar',
  aetheriumAscendance: 'preguntar',
  aetheriumMastery: 'preguntar',
  reiatsu: 'preguntar',
  ki: 'preguntar',
  haKi: 'preguntar',
  esencia: 'preguntar',
  eReinforced: 'preguntar',
  reiatsuOverride: 'preguntar',
}

/** Resuelve "ofensivo" al stat concreto del combatiente. Devuelve null si hay que preguntar. */
export function resolveTechniqueTarget(
  target: TechniqueTarget,
  offensiveStat: 'fuerza' | 'destreza',
): EffectTarget | null {
  if (target === 'preguntar') return null
  return target === 'ofensivo' ? offensiveStat : target
}
