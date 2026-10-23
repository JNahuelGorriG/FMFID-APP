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
