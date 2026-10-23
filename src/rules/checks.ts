import { differenceLevel, invertLevel, outcomeRanges, resolveHit } from './hit'
import type { AutomaticOutcome, DifferenceLevel, Range, RollOutcome } from './hit'
import type { Profile } from './profile'
import type { StatName } from './types'

export interface CheckRow {
  participantId: string
  name: string
  side: Profile['side']
  targetValue: number
  difference: number
  /** Nivel visto desde quien lanza el check. */
  level: DifferenceLevel
  /** El mismo enfrentamiento visto desde el afectado ("tiene que tirar con..."). */
  inverseLevel: DifferenceLevel
  /** Rangos del d20 de quien tira. null si el resultado es automático. */
  ranges: { outcome: RollOutcome; range: Range }[] | null
  /** Resultado de quien tira con el d20 indicado (si se indicó). */
  outcome: RollOutcome | AutomaticOutcome | null
}

/**
 * Stat check: un stat de un combatiente contra un stat de cada uno de los demás.
 * El nivel de cada fila depende del rango de quien lo recibe. Sirve igual para debuff checks,
 * maldiciones o cualquier tirada enfrentada (por ejemplo, Carisma contra Carisma).
 *
 * `roller` dice quién tira el d20: quien lanza el check (por defecto) o el afectado, que tira
 * con el nivel inverso. Los rangos y el resultado de cada fila son los de quien tira.
 */
export function statCheck(
  source: Profile,
  sourceStat: StatName,
  targets: Profile[],
  targetStat: StatName,
  d20?: number,
  roller: 'source' | 'target' = 'source',
): CheckRow[] {
  const sourceValue = source.stats[sourceStat]
  return targets.map((t) => {
    const difference = sourceValue - t.stats[targetStat]
    const level = differenceLevel(difference, t.group)
    const inverseLevel = invertLevel(level)
    const rollLevel = roller === 'source' ? level : inverseLevel
    const ranges = outcomeRanges(rollLevel)
    const auto = ranges === null
    return {
      participantId: t.participantId,
      name: t.name,
      side: t.side,
      targetValue: t.stats[targetStat],
      difference,
      level,
      inverseLevel,
      ranges,
      outcome: auto || d20 !== undefined ? resolveHit(rollLevel, d20) : null,
    }
  })
}
