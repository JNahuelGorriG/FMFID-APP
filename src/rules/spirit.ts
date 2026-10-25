import { SPIRIT_TYPE_ID } from './effects'
import type { Effect } from './effects'
import { THRESHOLDS } from './hit'
import type { RankGroup } from './ranks'
import { STAT_NAMES } from './types'

/** Niveles de Espíritu: 10 niveles son el 100 % del límite. */
export const SPIRIT_MAX_LEVEL = 10

/**
 * Lo que suma cada nivel de Espíritu a cada stat: el 10 % del límite del grupo de rango (Bajo 20,
 * Medio 30, Alto 40, Especial 70, Divino 100). No incluye el aumento del límite.
 */
export function spiritPerLevel(group: RankGroup): number {
  return THRESHOLDS[group].mayorPlus / 10
}

/** Nivel de Espíritu que tiene un combatiente (0 si no tiene). */
export function spiritLevel(effects: Effect[]): number {
  return effects.reduce((max, e) => (e.typeId === SPIRIT_TYPE_ID ? Math.max(max, e.level ?? 0) : max), 0)
}

/**
 * Pone el nivel de Espíritu de un combatiente: reemplaza al que tuviera (se puede bajar) y con nivel 0
 * lo quita. Es un buff a los 7 stats, de tipo propio, que dura hasta que se quite.
 */
export function withSpirit(
  effects: Effect[],
  level: number,
  group: RankGroup,
  combatId: string | null,
): Effect[] {
  const without = effects.filter((e) => e.typeId !== SPIRIT_TYPE_ID)
  const lvl = Math.min(SPIRIT_MAX_LEVEL, Math.max(0, Math.round(level)))
  if (lvl === 0) return without
  const groupId = crypto.randomUUID()
  const now = new Date().toISOString()
  return [
    ...without,
    ...STAT_NAMES.map(
      (target): Effect => ({
        id: crypto.randomUUID(),
        kind: 'buff',
        name: 'Espíritu',
        typeId: SPIRIT_TYPE_ID,
        target,
        flat: spiritPerLevel(group) * lvl,
        percent: 0,
        duration: { unit: 'manual', remaining: 0 },
        combatId,
        createdAt: now,
        group: groupId,
        level: lvl,
      }),
    ),
  ]
}
