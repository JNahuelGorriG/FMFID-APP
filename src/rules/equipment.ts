import { ceilTo } from './energy'
import { rankIndex, shiftRank } from './ranks'
import type { Rank } from './ranks'

export type ArmorType = 'ligera' | 'mediana' | 'pesada'
export type WeaponSize = 'pequena' | 'mediana' | 'grande' | 'pesada'

/** Los bonos de equipo se redondean hacia arriba a múltiplos de 5. */
export const BONUS_ROUNDING = 5

/** Fracción del promedio mínimo del rango que aporta cada tipo de armadura. */
export const ARMOR_FACTOR: Record<ArmorType, number> = {
  ligera: 0.2,
  mediana: 0.3,
  pesada: 0.4,
}

/** Fracción del promedio mínimo del rango que aporta cada tamaño de arma. */
export const WEAPON_FACTOR: Record<WeaponSize, number> = {
  pequena: 0.15,
  mediana: 0.2,
  grande: 0.25,
  pesada: 0.4,
}

export function armorBonus(rank: Rank, type: ArmorType): number {
  return ceilTo(rank.minAverage * ARMOR_FACTOR[type], BONUS_ROUNDING)
}

export function weaponBonus(rank: Rank, size: WeaponSize): number {
  return ceilTo(rank.minAverage * WEAPON_FACTOR[size], BONUS_ROUNDING)
}

/**
 * Equipo de referencia de un personaje: un tipo o tamaño y un ajuste de rango
 * respecto del rango del personaje (+1 = un rango por encima, −1 = por debajo).
 */
export interface EquipmentRef<T> {
  kind: T
  rankSteps: number
}

export function referenceArmorBonus(characterRank: Rank, ref: EquipmentRef<ArmorType>): number {
  return armorBonus(shiftRank(characterRank, ref.rankSteps), ref.kind)
}

/**
 * "Rango F": valores inventados por el GM para cuando el ajuste de rango de un arma
 * baja del rango E. No existe oficialmente, evita que se rompan los cálculos.
 */
export const RANK_F_WEAPON_BONUS: Record<WeaponSize, number> = {
  pequena: 0,
  mediana: 5,
  grande: 8,
  pesada: 13,
}

export function referenceWeaponBonus(characterRank: Rank, ref: EquipmentRef<WeaponSize>): number {
  if (rankIndex(characterRank.name) + ref.rankSteps < 0) return RANK_F_WEAPON_BONUS[ref.kind]
  return weaponBonus(shiftRank(characterRank, ref.rankSteps), ref.kind)
}

export interface ArmorUses {
  /** Usos totales de la pieza. */
  total: number
  /** Golpes de cada categoría que aguanta (medio gasta 1, fuerte 2, letal 3). */
  medio: number
  fuerte: number
  letal: number
}

export type ArmorUsesRank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S'

const u = (total: number, fuerte: number, letal: number): ArmorUses => ({
  total,
  medio: total,
  fuerte,
  letal,
})

/** Usos de las armaduras. Solo existen del rango E al S. */
export const ARMOR_USES: Record<ArmorType, Record<ArmorUsesRank, ArmorUses>> = {
  ligera: { S: u(19, 10, 6), A: u(16, 8, 5), B: u(13, 7, 4), C: u(10, 5, 3), D: u(7, 4, 2), E: u(4, 2, 1) },
  mediana: { S: u(26, 13, 9), A: u(22, 11, 7), B: u(18, 9, 6), C: u(14, 7, 5), D: u(10, 5, 3), E: u(6, 3, 2) },
  pesada: { S: u(33, 17, 11), A: u(28, 14, 9), B: u(23, 12, 8), C: u(18, 9, 6), D: u(13, 7, 4), E: u(8, 4, 3) },
}

/** Devuelve null si el rango no tiene tabla de usos (rangos con +, SS y SSS). */
export function armorUses(rankName: string, type: ArmorType): ArmorUses | null {
  return (ARMOR_USES[type] as Record<string, ArmorUses>)[rankName] ?? null
}

/**
 * Usos de una armadura de ese rango y tipo. Los rangos con "+" (D+, A+, S+) usan los de su letra,
 * porque la tabla solo tiene E, D, C, B, A y S. SS y SSS no tienen tabla.
 */
export function armorUsesFor(rankName: string, type: ArmorType): ArmorUses | null {
  return armorUses(rankName, type) ?? armorUses(rankName.replace('+', ''), type)
}
