import type { Duration } from './effects'

/** Cualquier cosa que dura un tiempo: efectos y barreras. */
export interface Timed {
  duration: Duration
  /** Combate que hace correr la duración. null = nunca baja sola. */
  combatId: string | null
}

/**
 * Baja en 1 la duración de lo que cuenta en turnos o en rondas (según `unit`) y que
 * pertenece a ese combate. Lo que llega a 0 sale de la lista y se devuelve aparte.
 */
export function tickDurations<T extends Timed>(
  items: T[],
  unit: 'turnos' | 'rondas',
  combatId: string,
): { items: T[]; expired: T[] } {
  const kept: T[] = []
  const expired: T[] = []
  for (const item of items) {
    if (item.combatId !== combatId || item.duration.unit !== unit) {
      kept.push(item)
      continue
    }
    const remaining = item.duration.remaining - 1
    if (remaining <= 0) expired.push(item)
    else kept.push({ ...item, duration: { ...item.duration, remaining } })
  }
  return { items: kept, expired }
}
