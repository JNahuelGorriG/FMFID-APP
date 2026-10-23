import { differenceLevel } from './hit'
import type { RankGroup } from './ranks'

export type WoundCategory = 'leve' | 'medio' | 'fuerte' | 'letal'

/** Cantidad de heridas por tipo. "Fuerte" no tiene reserva propia: se paga con medios y leves. */
export interface Wounds {
  leve: number
  medio: number
  letal: number
}

/** Usos de armadura que gasta un golpe de cada categoría. */
export const ARMOR_USE_COST: Record<WoundCategory, number> = {
  leve: 0,
  medio: 1,
  fuerte: 2,
  letal: 3,
}

/**
 * Categoría de herida según daño bruto y defensa del objetivo.
 * La fila de la tabla de umbrales es la del rango del defensor.
 * Solo importa cuánto SUPERA el daño a la defensa: si la defensa es mayor, el golpe es leve.
 */
export function woundCategory(
  damage: number,
  defense: number,
  defenderGroup: RankGroup,
): WoundCategory {
  const level = differenceLevel(damage - defense, defenderGroup)
  switch (level) {
    case 'mayor':
      return 'medio'
    case 'mayor-plus':
      return 'fuerte'
    case 'exito-asegurado':
      return 'letal'
    default:
      return 'leve'
  }
}

const DOWN: Record<WoundCategory, WoundCategory> = {
  leve: 'leve',
  medio: 'leve',
  fuerte: 'medio',
  letal: 'fuerte',
}

export interface ArmorMitigation {
  /** Categoría después de la armadura. */
  applied: WoundCategory
  /** Usos que se descuentan de la armadura. */
  usesSpent: number
}

/**
 * La armadura baja la categoría un nivel y gasta usos según el golpe recibido
 * (la categoría antes de bajarla). Las leves no gastan usos.
 * Sin usos disponibles no mitiga. Si le quedan menos usos que el costo, gasta los que tenga.
 */
export function mitigateWithArmor(category: WoundCategory, usesLeft: number): ArmorMitigation {
  if (usesLeft <= 0 || category === 'leve') return { applied: category, usesSpent: 0 }
  return {
    applied: DOWN[category],
    usesSpent: Math.min(ARMOR_USE_COST[category], usesLeft),
  }
}

/**
 * Resultado de resistencia (1 a 20): d8 + 6. Si el d8 sale 8 se suma un d6 al 14,
 * y si sale 1 se resta un d6 al 7.
 */
export function resistanceResult(d8: number, d6?: number): number {
  if (!Number.isInteger(d8) || d8 < 1 || d8 > 8) throw new Error('El d8 debe ser un entero entre 1 y 8.')
  if (d8 !== 1 && d8 !== 8) return d8 + 6
  if (d6 === undefined || !Number.isInteger(d6) || d6 < 1 || d6 > 6) {
    throw new Error('Con un 1 u 8 en el d8 hace falta un d6 entre 1 y 6.')
  }
  return d8 === 8 ? 14 + d6 : 7 - d6
}

const w = (leve: number, medio: number, letal: number): Wounds => ({ leve, medio, letal })

export const WOUND_TABLE: readonly {
  min: number
  max: number
  cells: Record<WoundCategory, Wounds>
}[] = [
  { min: 20, max: 20, cells: { leve: w(0, 0, 0), medio: w(1, 0, 0), fuerte: w(2, 0, 0), letal: w(0, 1, 0) } },
  { min: 18, max: 19, cells: { leve: w(1, 0, 0), medio: w(2, 0, 0), fuerte: w(3, 0, 0), letal: w(1, 1, 0) } },
  { min: 15, max: 17, cells: { leve: w(2, 0, 0), medio: w(3, 0, 0), fuerte: w(0, 1, 0), letal: w(2, 1, 0) } },
  { min: 11, max: 14, cells: { leve: w(3, 0, 0), medio: w(1, 1, 0), fuerte: w(2, 1, 0), letal: w(0, 2, 0) } },
  { min: 6, max: 10, cells: { leve: w(0, 1, 0), medio: w(2, 1, 0), fuerte: w(0, 2, 0), letal: w(0, 0, 1) } },
  { min: 1, max: 5, cells: { leve: w(1, 1, 0), medio: w(0, 2, 0), fuerte: w(0, 0, 1), letal: w(0, 1, 1) } },
]

/** Heridas que recibe un jugador según la categoría aplicada y su resultado de resistencia. */
export function woundsFromTable(category: WoundCategory, resistance: number): Wounds {
  const row = WOUND_TABLE.find((r) => resistance >= r.min && resistance <= r.max)
  if (!row) throw new Error('El resultado de resistencia debe estar entre 1 y 20.')
  return { ...row.cells[category] }
}
