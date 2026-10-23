import { D20_RANGES, OUTCOME_ORDER, differenceLevel, resolveHit } from './hit'
import type { AutomaticOutcome, DifferenceLevel, Range, RollOutcome } from './hit'
import type { Profile } from './profile'
import type { StatName } from './types'

export interface CheckRow {
  participantId: string
  name: string
  side: Profile['side']
  targetValue: number
  difference: number
  level: DifferenceLevel
  /** Rangos del d20 por resultado. null si el resultado es automático. */
  ranges: { outcome: RollOutcome; range: Range }[] | null
  /** Resultado con el d20 indicado (si se indicó). */
  outcome: RollOutcome | AutomaticOutcome | null
}

/**
 * Stat check: un stat de un combatiente contra un stat de cada uno de los demás.
 * El nivel de cada fila depende del rango de quien lo recibe. Sirve igual para debuff checks,
 * maldiciones o cualquier tirada enfrentada (por ejemplo, Carisma contra Carisma).
 */
export function statCheck(
  source: Profile,
  sourceStat: StatName,
  targets: Profile[],
  targetStat: StatName,
  d20?: number,
): CheckRow[] {
  const sourceValue = source.stats[sourceStat]
  return targets.map((t) => {
    const difference = sourceValue - t.stats[targetStat]
    const level = differenceLevel(difference, t.group)
    const auto = level === 'fallo-inmune' || level === 'exito-asegurado'
    const ranges = auto
      ? null
      : OUTCOME_ORDER.map((outcome, i) => ({ outcome, range: D20_RANGES[level][i] }))
    return {
      participantId: t.participantId,
      name: t.name,
      side: t.side,
      targetValue: t.stats[targetStat],
      difference,
      level,
      ranges,
      outcome: auto || d20 !== undefined ? resolveHit(level, d20) : null,
    }
  })
}
