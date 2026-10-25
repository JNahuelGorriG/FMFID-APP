import type { Wounds } from './wounds'

/** Reservas de vida de un jugador. 3 leves = 1 medio y 3 medios = 1 letal. */
export interface Health {
  leve: number
  medio: number
  letal: number
}

/** Vida base de un jugador (Santana: 8/6/2, Mauro: 10/7/3). */
export const BASE_HEALTH: Health = { leve: 8, medio: 5, letal: 2 }

type Pool = keyof Health

/** De mayor a menor. */
const ORDER: readonly Pool[] = ['letal', 'medio', 'leve']
const VALUE: Record<Pool, number> = { leve: 1, medio: 3, letal: 9 }

/** Reparte un valor en leve-equivalentes entre las reservas indicadas, de mayor a menor. */
function breakDown(health: Health, value: number, pools: readonly Pool[]): void {
  let left = value
  for (const p of pools) {
    const count = Math.floor(left / VALUE[p])
    health[p] += count
    left -= count * VALUE[p]
  }
}

/** Paga `qty` heridas de un tipo. Devuelve cuántas quedaron sin poder pagarse. */
function pay(health: Health, type: Pool, qty: number, drain: boolean): number {
  const typeIndex = ORDER.indexOf(type)
  const lower = ORDER.slice(typeIndex + 1)
  const higher = ORDER.slice(0, typeIndex).reverse() // la más cercana primero

  let remaining = qty

  while (remaining > 0) {
    // 0) La propia reserva, también la que acaba de recibir vuelto al romper una mayor (por ejemplo,
    //    las leves que sobran de un medio roto sirven para pagar la siguiente leve).
    if (health[type] > 0) {
      const take = Math.min(health[type], remaining)
      health[type] -= take
      remaining -= take
      continue
    }

    const cost = VALUE[type]

    // 1) Pagar con reservas menores (por ejemplo, 3 leves por un medio que falta).
    const lowerValue = lower.reduce((sum, p) => sum + health[p] * VALUE[p], 0)
    if (lowerValue >= cost) {
      let need = cost
      for (const p of lower) {
        const take = Math.min(health[p], Math.floor(need / VALUE[p]))
        health[p] -= take
        need -= take * VALUE[p]
      }
      remaining -= 1
      continue
    }

    // 2) Romper una reserva mayor y quedarse con el vuelto.
    const source = higher.find((p) => health[p] > 0)
    if (source === undefined) {
      // No alcanza para pagar esta herida. Con `drain` se gasta todo lo que quede: una herida que no se
      // puede pagar entera no deja la vida intacta.
      if (drain) for (const p of lower) health[p] = 0
      return remaining
    }
    health[source] -= 1
    breakDown(health, VALUE[source] - cost, ORDER.slice(ORDER.indexOf(source) + 1))
    remaining -= 1
  }
  return 0
}

export interface WoundResult {
  health: Health
  /** Heridas que no se pudieron descontar porque ya no quedaba vida. */
  unpaid: Wounds
  /** Verdadero cuando se agotaron las heridas letales: estado crítico. */
  critical: boolean
}

/**
 * Descuenta heridas de la vida actual con las reglas de conversión:
 * primero la propia reserva, luego reservas menores y, si no alcanza, rompe una mayor
 * y devuelve el cambio. No convierte vida a voluntad: solo lo hace al recibir daño.
 * Con `drain` (la vida de un jugador), una herida que no se puede pagar entera gasta todo lo que
 * quede; sin él (una barrera), la herida pasa de largo y la barrera no se toca.
 */
export function applyWounds(current: Health, wounds: Wounds, options: { drain?: boolean } = {}): WoundResult {
  const drain = options.drain ?? false
  const health: Health = { ...current }
  const unpaid: Wounds = {
    letal: pay(health, 'letal', wounds.letal, drain),
    medio: pay(health, 'medio', wounds.medio, drain),
    leve: pay(health, 'leve', wounds.leve, drain),
  }
  return { health, unpaid, critical: health.letal <= 0 }
}
