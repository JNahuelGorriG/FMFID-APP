// Tipos base del sistema de reglas de FMFID APP.

export const STAT_NAMES = [
  'fuerza',
  'destreza',
  'constitucion',
  'percepcion',
  'inteligencia',
  'sabiduria',
  'carisma',
] as const

export type StatName = (typeof STAT_NAMES)[number]

/** Un valor numérico por cada uno de los siete stats. */
export type Stats = Record<StatName, number>

/** 1 = primario, 2 = secundario, 3 = terciario. */
export type Tier = 1 | 2 | 3
export type Tiers = Record<StatName, Tier>

/**
 * Fuentes de un stat. Las "innatas" llevan el multiplicador del stat,
 * las "planas" se suman sin multiplicador.
 */
export interface StatSources {
  // Innatas (llevan multiplicador)
  puntosIniciales: number
  arbolHeroe: number
  heroe: number
  categoria: number
  // Planas (sin multiplicador)
  despertar: number
  merito: number
  entrenamiento: number
  regalo: number
  drogasShoko: number
  otros: number
}
