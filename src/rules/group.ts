import { addNpcParticipant, updateParticipant } from './combat'
import type { Combat, Side } from './combat'
import type { EnemyProfile } from './enemy'
import { RANKS, rankIndex } from './ranks'
import type { NpcGroup, NpcParticipantState } from './state'

/** Cantidad de rangos por debajo del grupo que se propone como piso. */
export const DEFAULT_FLOOR_STEPS = 2

const clampRankIndex = (i: number): number => Math.min(RANKS.length - 1, Math.max(0, i))

/** Rango que está `steps` pasos del dado (negativo baja). Se queda en los extremos de la escala. */
export function rankShiftedBy(rank: string, steps: number): string {
  return RANKS[clampRankIndex(rankIndex(rank) + steps)].name
}

export function isGroup(npc: Pick<NpcParticipantState, 'group'>): boolean {
  return npc.group !== undefined
}

/** Enemigos vivos: cuántas "vidas individuales" completas o parciales quedan. */
export function groupAlive(npc: NpcParticipantState): number {
  const g = npc.group
  if (!g || g.perMember <= 0) return 0
  return Math.min(g.size, Math.max(0, Math.ceil(npc.hpCurrent / g.perMember)))
}

/** Arma el estado de un NPC como grupo. La vida total es miembros × vida individual. */
export function groupState(
  base: NpcParticipantState,
  options: { size: number; perMember: number; rankFloor?: string },
): NpcParticipantState {
  const size = Math.max(1, Math.round(options.size))
  const perMember = Math.max(1, Math.round(options.perMember))
  const startRank = base.profile.rank
  const rankFloor = options.rankFloor ?? rankShiftedBy(startRank, -DEFAULT_FLOOR_STEPS)
  const max = size * perMember
  const group: NpcGroup = { size, perMember, rankFloor, startRank }
  return { ...base, hpMax: max, hpCurrent: max, group }
}

export function addGroupParticipant(
  combat: Combat,
  npc: { name: string; profile: EnemyProfile },
  options: { size: number; perMember: number; rankFloor?: string },
  initiative: number | null,
  side: Side = 'enemigo',
): Combat {
  const added = addNpcParticipant(combat, npc, initiative, side)
  const id = added.participants[added.participants.length - 1].id
  return updateParticipant(added, id, (p) => (p.npc ? { ...p, npc: groupState(p.npc, options) } : p))
}

/**
 * Cambia cuántos enemigos quedan vivos. La vida se mueve en vidas individuales completas:
 * sacar uno resta `perMember` de la vida del grupo y agregar uno la suma, siempre entre 0 y el máximo.
 */
export function setGroupAlive(npc: NpcParticipantState, alive: number): NpcParticipantState {
  const g = npc.group
  if (!g) return npc
  const target = Math.min(g.size, Math.max(0, Math.round(alive)))
  const diff = target - groupAlive(npc)
  const hp = Math.min(npc.hpMax, Math.max(0, npc.hpCurrent + diff * g.perMember))
  // Al llegar a un vivo exacto, que no sobre vida de un enemigo que ya cayó.
  return { ...npc, hpCurrent: Math.min(hp, target * g.perMember) }
}

/**
 * Cambia la cantidad de enemigos del grupo. Si suben (refuerzos, o corregir un error al armarlo), los nuevos entran
 * enteros; si bajan, los vivos nunca pasan del nuevo total.
 */
export function setGroupSize(npc: NpcParticipantState, size: number): NpcParticipantState {
  const g = npc.group
  if (!g) return npc
  const next = Math.max(1, Math.round(size))
  const max = next * g.perMember
  const hp = next >= g.size ? npc.hpCurrent + (next - g.size) * g.perMember : npc.hpCurrent
  return { ...npc, group: { ...g, size: next }, hpMax: max, hpCurrent: Math.max(0, Math.min(hp, max)) }
}

/** Cambia la vida de cada enemigo manteniendo cuántos están vivos. */
export function setGroupPerMember(npc: NpcParticipantState, perMember: number): NpcParticipantState {
  const g = npc.group
  if (!g) return npc
  const per = Math.max(1, Math.round(perMember))
  const alive = groupAlive(npc)
  const max = g.size * per
  return { ...npc, group: { ...g, perMember: per }, hpMax: max, hpCurrent: Math.min(max, alive * per) }
}

/**
 * Daño de un ataque de área: `damage` por golpe y `hits` enemigos alcanzados. Todo sale de la vida común del grupo.
 */
export function damageGroup(npc: NpcParticipantState, damage: number, hits = 1): NpcParticipantState {
  if (!npc.group) return npc
  const total = Math.max(0, damage) * Math.max(0, Math.round(hits))
  return { ...npc, hpCurrent: Math.max(0, npc.hpCurrent - total) }
}

/** Mueve el rango del grupo entre el piso y el rango con el que empezó. */
export function shiftGroupRank(npc: NpcParticipantState, steps: number): NpcParticipantState {
  const g = npc.group
  if (!g) return npc
  const lo = rankIndex(g.rankFloor)
  const hi = Math.max(lo, rankIndex(g.startRank))
  const next = Math.min(hi, Math.max(lo, rankIndex(npc.profile.rank) + steps))
  return { ...npc, profile: { ...npc.profile, rank: RANKS[next].name } }
}

export function setGroupRankFloor(npc: NpcParticipantState, rank: string): NpcParticipantState {
  const g = npc.group
  return g ? { ...npc, group: { ...g, rankFloor: rank } } : npc
}

export function setGroupRank(npc: NpcParticipantState, rank: string): NpcParticipantState {
  return { ...npc, profile: { ...npc.profile, rank } }
}

/** True si el rango actual ya está en el piso. */
export function atFloor(npc: NpcParticipantState): boolean {
  const g = npc.group
  return !!g && rankIndex(npc.profile.rank) <= rankIndex(g.rankFloor)
}
