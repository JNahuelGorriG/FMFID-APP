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

/** A qué suma una potenciación. "ofensivo" es el stat ofensivo del combatiente (Fuerza o Destreza). */
export type TechniqueTarget = EffectTarget | 'ofensivo'

/**
 * Destino inicial de cada potenciación: el stat que más pesa en su fórmula. Es una suposición
 * editable desde la app, porque el Excel no indica a qué stat suma cada una.
 */
export const DEFAULT_TECHNIQUE_TARGETS: Record<keyof Techniques, TechniqueTarget> = {
  kyushu: 'inteligencia',
  magyushuru: 'inteligencia',
  aetheriumAscendance: 'inteligencia',
  aetheriumMastery: 'inteligencia',
  reiatsu: 'ofensivo',
  ki: 'fuerza',
  haKi: 'fuerza',
  esencia: 'carisma',
  eReinforced: 'carisma',
  reiatsuOverride: 'ofensivo',
}

/** Resuelve "ofensivo" al stat concreto del combatiente. */
export function resolveTechniqueTarget(
  target: TechniqueTarget,
  offensiveStat: 'fuerza' | 'destreza',
): EffectTarget {
  return target === 'ofensivo' ? offensiveStat : target
}
