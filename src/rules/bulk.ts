import { applyToNpc, applyToPcDetailed } from './attack'
import type { PcHit } from './attack'
import type { NpcBarrier, PcBarrier } from './barriers'
import { recordActionMany, updateParticipant } from './combat'
import type { Combat, Participant } from './combat'
import type { Duration } from './effects'
import { applyHealing } from './healing'
import type { HealOption } from './healing'
import type { Health } from './health'
import type { Wounds } from './wounds'

const total = (w: Wounds): number => w.leve + w.medio + w.letal

/** Los participantes elegidos, tal como están ahora. */
const chosen = (combat: Combat, ids: string[]): Participant[] =>
  combat.participants.filter((p) => ids.includes(p.id))

export interface BarrierPlan {
  /** Barrera de los jugadores, en heridas. */
  pc: Wounds
  /** Barrera de los NPC, en puntos. */
  npcPoints: number
  duration: Duration
}

export interface BarrierResult {
  id: string
  name: string
  kind: 'pc' | 'npc'
  /** Lo que recibió: heridas, o puntos. null si no recibió barrera (monto en 0). */
  given: Wounds | number | null
}

/** Da una barrera de vida a varios: en heridas a los jugadores y en puntos a los NPC. */
export function addBarrierToMany(
  combat: Combat,
  ids: string[],
  plan: BarrierPlan,
): { combat: Combat; results: BarrierResult[] } {
  const targets = chosen(combat, ids)
  const now = new Date().toISOString()
  const results: BarrierResult[] = []
  let next = recordActionMany(combat, 'Barrera a varios', targets)

  for (const p of targets) {
    if (p.pc) {
      if (total(plan.pc) <= 0) {
        results.push({ id: p.id, name: p.name, kind: 'pc', given: null })
        continue
      }
      const barrier: PcBarrier = {
        id: crypto.randomUUID(),
        wounds: { ...plan.pc },
        duration: plan.duration,
        combatId: combat.id,
        createdAt: now,
      }
      next = updateParticipant(next, p.id, (x) => (x.pc ? { ...x, pc: { ...x.pc, barriers: [...x.pc.barriers, barrier] } } : x))
      results.push({ id: p.id, name: p.name, kind: 'pc', given: { ...plan.pc } })
    } else if (p.npc) {
      if (plan.npcPoints <= 0) {
        results.push({ id: p.id, name: p.name, kind: 'npc', given: null })
        continue
      }
      const barrier: NpcBarrier = {
        id: crypto.randomUUID(),
        points: plan.npcPoints,
        duration: plan.duration,
        combatId: combat.id,
        createdAt: now,
      }
      next = updateParticipant(next, p.id, (x) => (x.npc ? { ...x, npc: { ...x.npc, barriers: [...x.npc.barriers, barrier] } } : x))
      results.push({ id: p.id, name: p.name, kind: 'npc', given: plan.npcPoints })
    }
  }
  return { combat: next, results }
}

export interface HealPlan {
  /** Opción de la tabla de curaciones para los jugadores. */
  option: HealOption
  /** Puntos de vida que recuperan los NPC. */
  npcPoints: number
  saturate: boolean
  barrierDuration: Duration
}

export interface HealResult {
  id: string
  name: string
  kind: 'pc' | 'npc'
  healed?: Wounds
  barrier?: Wounds | null
  /** NPC: vida antes y después. */
  hp?: { before: number; after: number }
  /** Un jugador sin ficha no se puede curar (no se conoce su vida máxima). */
  skipped?: boolean
}

/**
 * Cura a varios: a los jugadores con la opción elegida de la tabla de curaciones (sin pasar de su
 * vida máxima) y a los NPC con puntos (sin pasar de su vida máxima).
 */
export function healMany(
  combat: Combat,
  ids: string[],
  plan: HealPlan,
  maxHealthOf: (participant: Participant) => Health | null,
): { combat: Combat; results: HealResult[] } {
  const targets = chosen(combat, ids)
  const results: HealResult[] = []
  let next = recordActionMany(combat, 'Curación a varios', targets)

  for (const p of targets) {
    if (p.pc) {
      const max = maxHealthOf(p)
      if (!max) {
        results.push({ id: p.id, name: p.name, kind: 'pc', skipped: true })
        continue
      }
      const settings = { barrierDuration: plan.barrierDuration, combatId: combat.id, saturate: plan.saturate }
      const preview = applyHealing(p.pc, max, plan.option, settings)
      next = updateParticipant(next, p.id, (x) => (x.pc ? { ...x, pc: applyHealing(x.pc, max, plan.option, settings).pc } : x))
      results.push({ id: p.id, name: p.name, kind: 'pc', healed: preview.healed, barrier: preview.barrier })
    } else if (p.npc) {
      const before = p.npc.hpCurrent
      const after = Math.min(p.npc.hpMax, before + Math.max(0, plan.npcPoints))
      next = updateParticipant(next, p.id, (x) => (x.npc ? { ...x, npc: { ...x.npc, hpCurrent: Math.min(x.npc.hpMax, x.npc.hpCurrent + Math.max(0, plan.npcPoints)) } } : x))
      results.push({ id: p.id, name: p.name, kind: 'npc', hp: { before, after } })
    }
  }
  return { combat: next, results }
}

export interface DamagePlan {
  /** Heridas que reciben los jugadores. */
  pc: Wounds
  /** Puntos que pierden los NPC. */
  npcPoints: number
}

export interface DamageResult {
  id: string
  name: string
  kind: 'pc' | 'npc'
  hit?: PcHit
  hp?: { before: number; after: number }
  /** No recibió daño porque el monto era 0. */
  none?: boolean
}

/**
 * Daña a varios con un monto directo, sin pasar por ataque ni defensa (daño de zona, trampas...).
 * Las barreras absorben primero y la armadura no se gasta.
 */
export function damageMany(
  combat: Combat,
  ids: string[],
  plan: DamagePlan,
): { combat: Combat; results: DamageResult[] } {
  const targets = chosen(combat, ids)
  const results: DamageResult[] = []
  let next = recordActionMany(combat, 'Daño a varios', targets)

  for (const p of targets) {
    if (p.pc) {
      if (total(plan.pc) <= 0) {
        results.push({ id: p.id, name: p.name, kind: 'pc', none: true })
        continue
      }
      const hit = applyToPcDetailed(p.pc, plan.pc, 0)
      next = updateParticipant(next, p.id, (x) => (x.pc ? { ...x, pc: applyToPcDetailed(x.pc, plan.pc, 0).pc } : x))
      results.push({ id: p.id, name: p.name, kind: 'pc', hit })
    } else if (p.npc) {
      if (plan.npcPoints <= 0) {
        results.push({ id: p.id, name: p.name, kind: 'npc', none: true })
        continue
      }
      const after = applyToNpc(p.npc, plan.npcPoints)
      next = updateParticipant(next, p.id, (x) => (x.npc ? { ...x, npc: applyToNpc(x.npc, plan.npcPoints) } : x))
      results.push({ id: p.id, name: p.name, kind: 'npc', hp: { before: p.npc.hpCurrent, after: after.hpCurrent } })
    }
  }
  return { combat: next, results }
}
