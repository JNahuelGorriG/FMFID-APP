import type { Duration } from './effects'
import type { PcBarrier } from './barriers'
import { clampSaturation, saturationFor } from './saturation'
import type { Health } from './health'
import type { PcState } from './state'
import type { Wounds } from './wounds'

/** Una forma de usar una curación: heridas que cura y barrera que da (L leve, M medio, X letal). */
export interface HealOption {
  heal: Wounds
  barrier: Wounds
}

export interface HealingLevel {
  level: number
  rank: string
  options: HealOption[]
}

const w = (leve = 0, medio = 0, letal = 0): Wounds => ({ leve, medio, letal })
const opt = (heal: Wounds, barrier: Wounds = w()): HealOption => ({ heal, barrier })

/**
 * Tabla de curaciones (pociones y curación por energía). Cada nivel tiene de 1 a 3 formas de usar
 * la misma curación y el jugador elige cuál. La "b" es barrera de vida.
 */
export const HEALING_TABLE: readonly HealingLevel[] = [
  { level: 1, rank: 'E', options: [opt(w(3))] },
  { level: 2, rank: 'D', options: [opt(w(6))] },
  { level: 3, rank: 'C', options: [opt(w(8)), opt(w(2, 1))] },
  { level: 4, rank: 'B', options: [opt(w(8), w(1)), opt(w(6, 1)), opt(w(1, 2))] },
  { level: 5, rank: 'A', options: [opt(w(8), w(3)), opt(w(2, 3)), opt(w(1, 1, 1))] },
  { level: 6, rank: 'S', options: [opt(w(8), w(0, 4)), opt(w(5, 4)), opt(w(4, 3, 1))] },
  { level: 7, rank: 'SS', options: [opt(w(8), w(0, 5)), opt(w(7, 5), w(0, 0, 2)), opt(w(7, 5, 2))] },
]

const tokens = (x: Wounds, barrier: boolean): string[] => {
  const b = barrier ? 'b' : ''
  const out: string[] = []
  if (x.leve) out.push(`${x.leve}L${b}`)
  if (x.medio) out.push(`${x.medio}M${b}`)
  if (x.letal) out.push(`${x.letal}X${b}`)
  return out
}

/** La opción con la notación de la mesa: "8L + 1Lb", "6L 1M", "7L 5M + 2Xb". */
export function healingText(option: HealOption): string {
  const heal = tokens(option.heal, false).join(' ')
  const barrier = tokens(option.barrier, true).join(' ')
  return barrier ? `${heal} + ${barrier}` : heal
}

/** Valor de una opción en heridas leves (1 leve, 3 por un medio, 9 por un letal). Sirve para comparar. */
export function healingValue(option: HealOption): { heal: number; barrier: number; total: number } {
  const eq = (x: Wounds): number => x.leve + 3 * x.medio + 9 * x.letal
  const heal = eq(option.heal)
  const barrier = eq(option.barrier)
  return { heal, barrier, total: heal + barrier }
}

export interface HealingResult {
  pc: PcState
  /** Heridas que realmente se curaron (no pasan del máximo). */
  healed: Wounds
  /** Barrera que se agregó, si la opción daba una. */
  barrier: Wounds | null
}

/**
 * Aplica una curación a un jugador: sube su vida sin pasar de su máximo y agrega la barrera de la
 * opción. Con `saturate`, suma a la barra de saturación según lo que realmente se curó.
 */
export function applyHealing(
  pc: PcState,
  max: Health,
  option: HealOption,
  options: { barrierDuration: Duration; combatId: string | null; saturate: boolean; now?: string },
): HealingResult {
  const room = (key: keyof Health): number => Math.max(0, max[key] - pc.health[key])
  const healed: Wounds = {
    leve: Math.min(option.heal.leve, room('leve')),
    medio: Math.min(option.heal.medio, room('medio')),
    letal: Math.min(option.heal.letal, room('letal')),
  }
  const hasBarrier = option.barrier.leve + option.barrier.medio + option.barrier.letal > 0
  const barrier: PcBarrier | null = hasBarrier
    ? {
        id: crypto.randomUUID(),
        wounds: { ...option.barrier },
        duration: options.barrierDuration,
        combatId: options.combatId,
        createdAt: options.now ?? new Date().toISOString(),
      }
    : null

  return {
    pc: {
      ...pc,
      health: {
        leve: pc.health.leve + healed.leve,
        medio: pc.health.medio + healed.medio,
        letal: pc.health.letal + healed.letal,
      },
      barriers: barrier ? [...pc.barriers, barrier] : pc.barriers,
      saturation: options.saturate ? clampSaturation((pc.saturation ?? 0) + saturationFor(healed)) : pc.saturation,
    },
    healed,
    barrier: hasBarrier ? { ...option.barrier } : null,
  }
}
