import { applyWounds } from './health'
import type { Health } from './health'
import type { Duration } from './effects'
import type { Wounds } from './wounds'

/** Barrera de un jugador: vida extra en heridas, por encima de la vida normal. */
export interface PcBarrier {
  id: string
  wounds: Health
  duration: Duration
  combatId: string | null
  createdAt: string
}

/** Barrera de un NPC: puntos de vida extra. */
export interface NpcBarrier {
  id: string
  points: number
  duration: Duration
  combatId: string | null
  createdAt: string
}

/** Las barreras que vencen antes se gastan primero. Las que no vencen solas, al final. */
function expiryOrder<T extends { duration: Duration; createdAt: string }>(barriers: T[]): T[] {
  const key = (b: T): number =>
    b.duration.unit === 'turnos' || b.duration.unit === 'rondas' ? b.duration.remaining : Infinity
  return [...barriers].sort((a, b) => key(a) - key(b) || a.createdAt.localeCompare(b.createdAt))
}

/**
 * Descuenta heridas de las barreras de un jugador, la que vence antes primero.
 * Lo que no absorben pasa a la vida normal. Las barreras vacías desaparecen.
 */
export function absorbWithBarriers(
  barriers: PcBarrier[],
  wounds: Wounds,
): { barriers: PcBarrier[]; remaining: Wounds } {
  const updated = new Map<string, PcBarrier>()
  let remaining = { ...wounds }

  for (const barrier of expiryOrder(barriers)) {
    if (remaining.leve + remaining.medio + remaining.letal === 0) break
    const result = applyWounds(barrier.wounds, remaining)
    updated.set(barrier.id, { ...barrier, wounds: result.health })
    remaining = result.unpaid
  }

  const next = barriers
    .map((b) => updated.get(b.id) ?? b)
    .filter((b) => b.wounds.leve + b.wounds.medio + b.wounds.letal > 0)
  return { barriers: next, remaining }
}

/** Descuenta puntos de daño de las barreras de un NPC, la que vence antes primero. */
export function absorbPointBarriers(
  barriers: NpcBarrier[],
  damage: number,
): { barriers: NpcBarrier[]; remaining: number } {
  const updated = new Map<string, NpcBarrier>()
  let remaining = damage

  for (const barrier of expiryOrder(barriers)) {
    if (remaining <= 0) break
    const taken = Math.min(barrier.points, remaining)
    updated.set(barrier.id, { ...barrier, points: barrier.points - taken })
    remaining -= taken
  }

  return {
    barriers: barriers.map((b) => updated.get(b.id) ?? b).filter((b) => b.points > 0),
    remaining,
  }
}
