import type { StatName, Tier } from '../rules'

export const STAT_LABELS: Record<StatName, string> = {
  fuerza: 'Fuerza',
  destreza: 'Destreza',
  constitucion: 'Constitución',
  percepcion: 'Percepción',
  inteligencia: 'Inteligencia',
  sabiduria: 'Sabiduría',
  carisma: 'Carisma',
}

export const TIER_LABELS: Record<Tier, string> = {
  1: 'Primario',
  2: 'Secundario',
  3: 'Terciario',
}

/** Un decimal como máximo, con coma decimal y separador de miles. */
export function fmt(value: number): string {
  return Number(value.toFixed(1)).toLocaleString('es-AR')
}

export function fmtOrDash(value: number | null): string {
  return value === null ? '—' : fmt(value)
}

export const SOURCE_LABELS = {
  puntosIniciales: 'Puntos iniciales',
  arbolHeroe: 'Árbol héroe',
  heroe: 'Héroe',
  categoria: 'Categoría',
  despertar: 'Despertar',
  merito: 'Mérito',
  entrenamiento: 'Entrenamiento',
  regalo: 'Regalo',
  drogasShoko: 'Drogas Shoko',
  otros: 'Otros',
} as const

export type SourceKey = keyof typeof SOURCE_LABELS

/** Fuentes que llevan multiplicador y fuentes planas, para agruparlas en pantalla. */
export const INNATE_KEYS: SourceKey[] = ['puntosIniciales', 'arbolHeroe', 'heroe', 'categoria']
export const FLAT_KEYS: SourceKey[] = [
  'despertar', 'merito', 'entrenamiento', 'regalo', 'drogasShoko', 'otros',
]

export const ENERGY_LABELS: Record<string, string> = {
  baseMana: 'Base de maná',
  baseStamina: 'Base de estamina',
  bonusMana: 'Bonos de maná',
  bonusStamina: 'Bonos de estamina',
}

export const HEALTH_LABELS: Record<string, string> = {
  leve: 'Vida leve',
  medio: 'Vida media',
  letal: 'Vida letal',
}

export const DERIVED_LABELS: Record<string, string> = {
  physDamageWeapon: 'Arma de daño físico',
  magicDamageWeapon: 'Arma de daño mágico',
  physDefenseArmor: 'Armadura de defensa física SA',
  magicDefenseArmor: 'Armadura de defensa mágica SA',
  magicDefenseWeights: 'Pesos de defensa mágica',
  agilityStat: 'Stat de agilidad',
}

const TOP_LABELS: Record<string, string> = {
  name: 'Nombre',
  playerName: 'Jugador',
  className: 'Clase',
  retired: 'Retirado',
}

/** Nombre legible de la ruta de un dato, para el historial. */
export function describePath(path: string): string {
  const [root, a, b] = path.split('.')
  const stat = (key: string | undefined): string => STAT_LABELS[key as StatName] ?? key ?? ''
  if (root === 'sources' && b) return `${stat(a)} · ${SOURCE_LABELS[b as SourceKey] ?? b}`
  if (root === 'tiers') return `${stat(a)} · Tier`
  if (root === 'multipliers') return `${stat(a)} · Multiplicador`
  if (root === 'energy') return ENERGY_LABELS[a] ?? path
  if (root === 'baseHealth') return HEALTH_LABELS[a] ?? path
  if (root === 'derived') return DERIVED_LABELS[a] ?? path
  return TOP_LABELS[root] ?? path
}

/** Valor legible para el historial. */
export function fmtValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return fmt(value)
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'string') return value === '' ? '(vacío)' : value
  if (typeof value === 'object' && 'kind' in value && 'rankSteps' in value) {
    const v = value as { kind: string; rankSteps: number }
    return `${v.kind} ${v.rankSteps >= 0 ? '+' : ''}${v.rankSteps}`
  }
  return JSON.stringify(value)
}
