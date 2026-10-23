/** Salvaciones de un jugador y su batería (0 a 10 por vías naturales). */
export interface Saves {
  /** Salvaciones normales disponibles. */
  current: number
  /** Máximo de salvaciones normales (2 de base, varía por jugador). */
  max: number
  /** Salvaciones únicas: las da el GM por encima del máximo. */
  unique: number
  /** Batería de salvación. */
  battery: number
}

export const BATTERY_NATURAL_CAP = 10

export function defaultSaves(): Saves {
  return { current: 2, max: 2, unique: 0, battery: 0 }
}

/** Carga de batería según la tirada: de 10 a 6 suma 1, de 5 a 1 suma 2. Más de 10, nada. */
export function batteryGainFromRoll(d20: number): number {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) throw new Error('El d20 debe estar entre 1 y 20.')
  if (d20 >= 11) return 0
  return d20 >= 6 ? 1 : 2
}

/**
 * Carga la batería. Por vías naturales no pasa de 10. Un regalo del GM puede pasarlo.
 */
export function chargeBattery(saves: Saves, amount: number, source: 'natural' | 'regalo'): Saves {
  const raw = Math.max(0, saves.battery + amount)
  const battery =
    source === 'natural' ? Math.min(raw, Math.max(saves.battery, BATTERY_NATURAL_CAP)) : raw
  return { ...saves, battery }
}

/**
 * Con la batería en 10 o más se recupera 1 salvación natural, y la batería se vacía.
 * Solo se puede si no se tiene el máximo. Si no se puede, devuelve null y nada cambia.
 */
export function claimSaveFromBattery(saves: Saves): Saves | null {
  if (saves.battery < BATTERY_NATURAL_CAP || saves.current >= saves.max) return null
  return { ...saves, current: saves.current + 1, battery: 0 }
}

/** Gasta una salvación (normal o única). Devuelve null si no hay. */
export function spendSave(saves: Saves, kind: 'normal' | 'unica'): Saves | null {
  if (kind === 'normal') return saves.current > 0 ? { ...saves, current: saves.current - 1 } : null
  return saves.unique > 0 ? { ...saves, unique: saves.unique - 1 } : null
}
