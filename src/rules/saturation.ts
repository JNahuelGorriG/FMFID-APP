import type { Wounds } from './wounds'

/** Cuánto sube la saturación por cada herida curada. */
export const SATURATION_PER_WOUND = { leve: 1, medio: 3, letal: 9 } as const

/** La barra va de 0 a 100 %. */
export function clampSaturation(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/** Saturación que suma curar esas heridas (1 % por leve, 3 % por medio, 9 % por letal). */
export function saturationFor(healed: Wounds): number {
  return (
    healed.leve * SATURATION_PER_WOUND.leve +
    healed.medio * SATURATION_PER_WOUND.medio +
    healed.letal * SATURATION_PER_WOUND.letal
  )
}
