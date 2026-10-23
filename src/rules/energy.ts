import type { Stats } from './types'

/** Multiplicador de energía. Los bonos del árbol van dentro, por diseño. */
export const ENERGY_MULTIPLIER = 1.5
/** Las energías se redondean hacia arriba a múltiplos de 10. */
export const ENERGY_ROUNDING = 10

/** Redondea hacia arriba a un múltiplo de `step`, evitando errores de coma flotante. */
export function ceilTo(value: number, step: number): number {
  return Math.ceil(Number((value / step).toFixed(9))) * step
}

export interface EnergyInput {
  /** Base según la orientación física o mágica del personaje. */
  base: number
  /** Suma de bonos de energía del árbol de stats. */
  bonus: number
}

/** Maná = CEILING((base + Sabiduría + Inteligencia + Carisma + bonos) × 1,5; 10). */
export function mana(stats: Stats, input: EnergyInput): number {
  const raw = input.base + stats.sabiduria + stats.inteligencia + stats.carisma + input.bonus
  return ceilTo(raw * ENERGY_MULTIPLIER, ENERGY_ROUNDING)
}

/** Estamina = CEILING((base + Fuerza + Destreza + Constitución + bonos) × 1,5; 10). */
export function stamina(stats: Stats, input: EnergyInput): number {
  const raw = input.base + stats.fuerza + stats.destreza + stats.constitucion + input.bonus
  return ceilTo(raw * ENERGY_MULTIPLIER, ENERGY_ROUNDING)
}

/** Cada energía se divide mitad natural y mitad renovable. */
export function splitEnergy(total: number): { natural: number; renovable: number } {
  return { natural: total / 2, renovable: total / 2 }
}
