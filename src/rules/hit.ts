import type { RankGroup } from './ranks'

/**
 * Nivel de diferencia entre atacante y defensor.
 * Se usa tanto para el impacto como para la categoría de herida.
 */
export type DifferenceLevel =
  | 'exito-asegurado'
  | 'mayor-plus'
  | 'mayor'
  | 'normal'
  | 'menor'
  | 'menor-plus'
  | 'fallo-inmune'

/** Límites superiores (en valor absoluto) de cada banda, por grupo de rango del defensor. */
export const THRESHOLDS: Record<
  RankGroup,
  { normal: number; mayor: number; mayorPlus: number }
> = {
  bajo: { normal: 50, mayor: 125, mayorPlus: 200 },
  medio: { normal: 75, mayor: 150, mayorPlus: 300 },
  alto: { normal: 100, mayor: 200, mayorPlus: 400 },
  especial: { normal: 150, mayor: 350, mayorPlus: 700 },
  divino: { normal: 250, mayor: 500, mayorPlus: 1000 },
}

/**
 * Ubica una diferencia de stats (atacante − defensor) en la tabla de umbrales.
 * La fila se elige siempre según el grupo de rango del DEFENSOR.
 * Una diferencia positiva favorece al atacante.
 */
export function differenceLevel(difference: number, defenderGroup: RankGroup): DifferenceLevel {
  const t = THRESHOLDS[defenderGroup]
  const abs = Math.abs(difference)
  const positive = difference >= 0

  if (abs <= t.normal) return 'normal'
  if (abs <= t.mayor) return positive ? 'mayor' : 'menor'
  if (abs <= t.mayorPlus) return positive ? 'mayor-plus' : 'menor-plus'
  return positive ? 'exito-asegurado' : 'fallo-inmune'
}

export type RollOutcome =
  | 'fallo-critico'
  | 'fallo-mayor'
  | 'fallo'
  | 'exito'
  | 'exito-mayor'
  | 'exito-critico'

export type AutomaticOutcome = 'fallo-automatico' | 'exito-automatico'

export type Range = readonly [number, number]

/** Rangos del d20 en el orden: fallo crítico, fallo mayor, fallo, éxito, éxito mayor, éxito crítico. */
export const OUTCOME_ORDER: readonly RollOutcome[] = [
  'fallo-critico',
  'fallo-mayor',
  'fallo',
  'exito',
  'exito-mayor',
  'exito-critico',
]

export const D20_RANGES: Record<
  'menor-plus' | 'menor' | 'normal' | 'mayor' | 'mayor-plus',
  readonly Range[]
> = {
  'menor-plus': [[1, 2], [3, 7], [8, 13], [14, 17], [18, 19], [20, 20]],
  menor: [[1, 2], [3, 6], [7, 12], [13, 17], [18, 19], [20, 20]],
  normal: [[1, 2], [3, 5], [6, 10], [11, 15], [16, 18], [19, 20]],
  mayor: [[1, 1], [2, 3], [4, 8], [9, 14], [15, 18], [19, 20]],
  'mayor-plus': [[1, 1], [2, 3], [4, 7], [8, 13], [14, 18], [19, 20]],
}

/**
 * Resultado del impacto. En "fallo-inmune" y "exito-asegurado" no se tira:
 * el resultado es automático y `d20` se ignora.
 */
export function resolveHit(level: DifferenceLevel, d20?: number): RollOutcome | AutomaticOutcome {
  if (level === 'fallo-inmune') return 'fallo-automatico'
  if (level === 'exito-asegurado') return 'exito-automatico'

  if (d20 === undefined || !Number.isInteger(d20) || d20 < 1 || d20 > 20) {
    throw new Error('El d20 debe ser un entero entre 1 y 20.')
  }

  const ranges = D20_RANGES[level]
  const index = ranges.findIndex(([min, max]) => d20 >= min && d20 <= max)
  return OUTCOME_ORDER[index]
}

const INVERSE_LEVEL: Record<DifferenceLevel, DifferenceLevel> = {
  'exito-asegurado': 'fallo-inmune',
  'mayor-plus': 'menor-plus',
  mayor: 'menor',
  normal: 'normal',
  menor: 'mayor',
  'menor-plus': 'mayor-plus',
  'fallo-inmune': 'exito-asegurado',
}

/**
 * El mismo enfrentamiento visto desde el otro lado: si el atacante tira con "Mayor+",
 * el defensor tira con "Menor+".
 */
export function invertLevel(level: DifferenceLevel): DifferenceLevel {
  return INVERSE_LEVEL[level]
}

const INVERSE_OUTCOME: Record<RollOutcome, RollOutcome> = {
  'fallo-critico': 'exito-critico',
  'fallo-mayor': 'exito-mayor',
  fallo: 'exito',
  exito: 'fallo',
  'exito-mayor': 'fallo-mayor',
  'exito-critico': 'fallo-critico',
}

/** Resultado del otro lado: si el defensor logra un éxito, el ataque tiene el fallo equivalente. */
export function invertOutcome(outcome: RollOutcome | AutomaticOutcome): RollOutcome | AutomaticOutcome {
  if (outcome === 'fallo-automatico') return 'exito-automatico'
  if (outcome === 'exito-automatico') return 'fallo-automatico'
  return INVERSE_OUTCOME[outcome]
}

/** Rangos del d20 de cada resultado para un nivel. null si el resultado es automático. */
export function outcomeRanges(level: DifferenceLevel): { outcome: RollOutcome; range: Range }[] | null {
  if (level === 'fallo-inmune' || level === 'exito-asegurado') return null
  return OUTCOME_ORDER.map((outcome, i) => ({ outcome, range: D20_RANGES[level][i] }))
}
