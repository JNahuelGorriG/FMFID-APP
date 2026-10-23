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

import type { DurationUnit, Effect, EffectTarget } from '../rules'

export const TARGET_LABELS: Record<EffectTarget, string> = {
  ...STAT_LABELS,
  ataque: 'Ataque',
  magia: 'Magia',
  defensaFisica: 'Defensa física',
  defensaMagica: 'Defensa mágica',
}

export const DURATION_LABELS: Record<DurationUnit, string> = {
  turnos: 'Turnos',
  rondas: 'Rondas',
  manual: 'Hasta curar',
  habilidad: 'Hasta que termine la habilidad',
}

export function describeDuration(duration: Effect['duration']): string {
  if (duration.unit === 'turnos') return `${duration.remaining} turno(s)`
  if (duration.unit === 'rondas') return `${duration.remaining} ronda(s)`
  return DURATION_LABELS[duration.unit]
}

export function describeAmount(effect: Pick<Effect, 'kind' | 'flat' | 'percent'>): string {
  const sign = effect.kind === 'buff' ? '+' : '−'
  const parts: string[] = []
  if (effect.flat !== 0) parts.push(`${sign}${fmt(effect.flat)}`)
  if (effect.percent !== 0) parts.push(`${sign}${fmt(effect.percent)} %`)
  return parts.join(' y ') || '0'
}

import type { DifferenceLevel, RollOutcome, Side } from '../rules'

export const LEVEL_LABELS: Record<DifferenceLevel, string> = {
  'exito-asegurado': 'Éxito asegurado',
  'mayor-plus': 'Mayor+',
  mayor: 'Mayor',
  normal: 'Normal',
  menor: 'Menor',
  'menor-plus': 'Menor+',
  'fallo-inmune': 'Fallo inmune',
}

export const OUTCOME_LABELS: Record<RollOutcome | 'fallo-automatico' | 'exito-automatico', string> = {
  'fallo-critico': 'Fallo crítico',
  'fallo-mayor': 'Fallo mayor',
  fallo: 'Fallo',
  exito: 'Éxito',
  'exito-mayor': 'Éxito mayor',
  'exito-critico': 'Éxito crítico',
  'fallo-automatico': 'Fallo automático',
  'exito-automatico': 'Éxito automático',
}

export const SIDE_LABELS: Record<Side, string> = {
  jugador: 'Jugador',
  aliado: 'Aliado',
  enemigo: 'Enemigo',
}

/** Rango del d20 como texto: "1-2" o "20". */
export function rangeText(range: readonly [number, number]): string {
  return range[0] === range[1] ? String(range[0]) : `${range[0]}-${range[1]}`
}

/** Heridas como texto: "1 medio + 2 leves". */
export function woundsText(w: { leve: number; medio: number; letal: number }): string {
  const parts: string[] = []
  if (w.letal) parts.push(`${w.letal} letal${w.letal > 1 ? 'es' : ''}`)
  if (w.medio) parts.push(`${w.medio} medio${w.medio > 1 ? 's' : ''}`)
  if (w.leve) parts.push(`${w.leve} leve${w.leve > 1 ? 's' : ''}`)
  return parts.join(' + ') || 'Sin daño'
}
