import type { StatSources } from './types'

/**
 * Stat total = (suma de fuentes innatas) × multiplicador + (suma de fuentes planas).
 * Equivale a SUM(B:E)*N + SUM(F:K) del Excel.
 */
export function statTotal(sources: StatSources, multiplier: number): number {
  const innatas =
    sources.puntosIniciales + sources.arbolHeroe + sources.heroe + sources.categoria
  const planas =
    sources.despertar +
    sources.merito +
    sources.entrenamiento +
    sources.regalo +
    sources.drogasShoko +
    sources.otros
  return innatas * multiplier + planas
}
