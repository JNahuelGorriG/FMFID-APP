import { tickDurations } from './durations'
import { addEffects, endSkill, removeGroup } from './effects'
import type { Effect } from './effects'
import { withSpirit } from './spirit'
import type { RankGroup } from './ranks'
import type { EnemyProfile } from './enemy'
import type { Character } from './character'
import { initialNpcState, initialPcState } from './state'
import type { NpcParticipantState, PcState } from './state'

export type CombatStatus = 'activo' | 'pausado' | 'terminado'

/** Bando: los jugadores son siempre "jugador". Los NPC pueden ser aliados o enemigos. */
export type Side = 'jugador' | 'aliado' | 'enemigo'

export interface Participant {
  id: string
  kind: 'pc' | 'npc'
  /** Personaje al que representa (solo jugadores). */
  characterId: string | null
  name: string
  side: Side
  /** Tirada de iniciativa. Sin tirada, va al final. */
  initiative: number | null
  /** Estado del jugador en este combate (solo jugadores). */
  pc: PcState | null
  /** Estado del NPC en este combate (solo NPCs). */
  npc: NpcParticipantState | null
}

export interface Alert {
  id: string
  text: string
}

/** Un ataque aplicado, con lo necesario para deshacerlo. */
export interface ActionLog {
  id: string
  text: string
  participantId: string
  /** El participante afectado tal como estaba antes. */
  before: Participant
  /** Si la acción afectó a varios: los demás, tal como estaban antes. */
  also?: Participant[]
}

/**
 * Un campo de batalla. Puede haber varios a la vez, cada uno con su iniciativa, su ronda
 * y el estado propio de cada participante.
 */
export interface Combat {
  id: string
  name: string
  status: CombatStatus
  round: number
  /** Participante al que le toca. null si el combate no empezó. */
  activeId: string | null
  participants: Participant[]
  alerts: Alert[]
  history: ActionLog[]
  createdAt: string
  updatedAt: string
}

const MAX_ALERTS = 30
const MAX_HISTORY = 10

export function newCombat(name: string): Combat {
  const stamp = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Combate',
    status: 'activo',
    round: 0,
    activeId: null,
    participants: [],
    alerts: [],
    history: [],
    createdAt: stamp,
    updatedAt: stamp,
  }
}

/** Orden de turnos: iniciativa de mayor a menor. Los empates siguen el orden en que se cargaron. */
export function orderedParticipants(participants: Participant[]): Participant[] {
  return participants
    .map((p, index) => ({ p, index }))
    .sort((a, b) => {
      const ai = a.p.initiative ?? -Infinity
      const bi = b.p.initiative ?? -Infinity
      return bi - ai || a.index - b.index
    })
    .map(({ p }) => p)
}

/** Agrega un jugador con su estado inicial propio para este combate. */
export function addPcParticipant(combat: Combat, character: Character, initiative: number | null): Combat {
  return {
    ...combat,
    participants: [
      ...combat.participants,
      {
        id: crypto.randomUUID(),
        kind: 'pc',
        characterId: character.id,
        name: character.name,
        side: 'jugador',
        initiative,
        pc: initialPcState(character),
        npc: null,
      },
    ],
  }
}

export function addNpcParticipant(
  combat: Combat,
  npc: { name: string; profile: EnemyProfile },
  initiative: number | null,
  side: Side = 'enemigo',
): Combat {
  return {
    ...combat,
    participants: [
      ...combat.participants,
      {
        id: crypto.randomUUID(),
        kind: 'npc',
        characterId: null,
        name: npc.name,
        side: side === 'jugador' ? 'enemigo' : side,
        initiative,
        pc: null,
        npc: initialNpcState(npc.profile),
      },
    ],
  }
}

export function updateParticipant(
  combat: Combat,
  participantId: string,
  change: (p: Participant) => Participant,
): Combat {
  return {
    ...combat,
    participants: combat.participants.map((p) => (p.id === participantId ? change(p) : p)),
  }
}

export function setInitiative(combat: Combat, participantId: string, initiative: number | null): Combat {
  return updateParticipant(combat, participantId, (p) => ({ ...p, initiative }))
}

const effectsOf = (p: Participant): Effect[] => p.pc?.effects ?? p.npc?.effects ?? []

function withEffects(p: Participant, effects: Effect[]): Participant {
  if (p.pc) return { ...p, pc: { ...p.pc, effects } }
  if (p.npc) return { ...p, npc: { ...p.npc, effects } }
  return p
}

/**
 * Aplica buffs o debuffs a varios combatientes a la vez. Entran todos: si en algún stat ya hay 4, los
 * 4 más fuertes (y más recientes) quedan activos y los demás listados sin lugar.
 */
export function addEffectsToMany(combat: Combat, byParticipant: Record<string, Effect[]>): Combat {
  return {
    ...combat,
    participants: combat.participants.map((p) =>
      byParticipant[p.id] ? withEffects(p, addEffects(effectsOf(p), byParticipant[p.id])) : p,
    ),
  }
}

/** "Terminó la habilidad" para varios combatientes: quita lo que termina con ella. */
export function endSkillForMany(combat: Combat, ids: string[]): Combat {
  return {
    ...combat,
    participants: combat.participants.map((p) =>
      ids.includes(p.id) ? withEffects(p, endSkill(effectsOf(p)).effects) : p,
    ),
  }
}

/** Quita un buff o debuff entero (todos sus stats) de un combatiente. */
export function removeEffectGroupFrom(combat: Combat, participantId: string, group: string): Combat {
  return updateParticipant(combat, participantId, (p) => withEffects(p, removeGroup(effectsOf(p), group)))
}

/** Pone el nivel de Espíritu (0 a 10) de varios combatientes. Cada uno recibe su valor según su rango. */
export function setSpiritForMany(
  combat: Combat,
  entries: { id: string; level: number; group: RankGroup }[],
): Combat {
  let next = combat
  for (const { id, level, group } of entries) {
    next = updateParticipant(next, id, (p) => withEffects(p, withSpirit(effectsOf(p), level, group, combat.id)))
  }
  return next
}

/** Marca a un NPC como aliado o enemigo. Los jugadores siempre son "jugador". */
export function setSide(combat: Combat, participantId: string, side: 'aliado' | 'enemigo'): Combat {
  return updateParticipant(combat, participantId, (p) => (p.kind === 'npc' ? { ...p, side } : p))
}

/** Quita a un participante. Si era su turno, pasa al siguiente en el orden. */
export function removeParticipant(combat: Combat, participantId: string): Combat {
  const order = orderedParticipants(combat.participants)
  let activeId = combat.activeId
  if (activeId === participantId) {
    const index = order.findIndex((p) => p.id === participantId)
    activeId = order[index + 1]?.id ?? order.filter((p) => p.id !== participantId)[0]?.id ?? null
  }
  return {
    ...combat,
    activeId,
    participants: combat.participants.filter((p) => p.id !== participantId),
    history: combat.history.filter((h) => h.participantId !== participantId),
  }
}

function pushAlerts(combat: Combat, texts: string[]): Combat {
  if (texts.length === 0) return combat
  const added = texts.map((text) => ({ id: crypto.randomUUID(), text }))
  return { ...combat, alerts: [...added.reverse(), ...combat.alerts].slice(0, MAX_ALERTS) }
}

/** Agrega un aviso al combate. */
export function addAlert(combat: Combat, text: string): Combat {
  return pushAlerts(combat, [text])
}

export function dismissAlert(combat: Combat, alertId: string): Combat {
  return { ...combat, alerts: combat.alerts.filter((a) => a.id !== alertId) }
}

/** Anota un cambio hecho a un participante para poder deshacerlo. */
export function recordAction(combat: Combat, text: string, before: Participant): Combat {
  const entry: ActionLog = { id: crypto.randomUUID(), text, participantId: before.id, before }
  return { ...combat, history: [entry, ...combat.history].slice(0, MAX_HISTORY) }
}

/** Deshace la última acción registrada: el participante vuelve a como estaba. */
/** Anota un cambio hecho a varios participantes a la vez, para deshacerlo de una sola vez. */
export function recordActionMany(combat: Combat, text: string, befores: Participant[]): Combat {
  if (befores.length === 0) return combat
  const [first, ...others] = befores
  const entry: ActionLog = { id: crypto.randomUUID(), text, participantId: first.id, before: first, also: others }
  return { ...combat, history: [entry, ...combat.history].slice(0, MAX_HISTORY) }
}

export function undoLastAction(combat: Combat): Combat {
  const [last, ...rest] = combat.history
  if (!last) return combat
  let next = combat
  for (const before of [last.before, ...(last.also ?? [])]) {
    if (next.participants.some((p) => p.id === before.id)) next = updateParticipant(next, before.id, () => before)
  }
  return { ...next, history: rest }
}

const effectLabel = (e: Effect): string => (e.kind === 'buff' ? 'buff' : 'debuff')

/** Baja las duraciones de un participante y avisa lo que terminó. */
function tickParticipant(combat: Combat, participant: Participant, unit: 'turnos' | 'rondas'): Combat {
  const texts: string[] = []
  const who = participant.name
  let next = combat

  if (participant.pc) {
    const effects = tickDurations<Effect>(participant.pc.effects, unit, combat.id)
    const barriers = tickDurations(participant.pc.barriers, unit, combat.id)
    effects.expired.forEach((e) => texts.push(`Se terminó el ${effectLabel(e)} "${e.name}" de ${who}.`))
    barriers.expired.forEach(() => texts.push(`Se terminó una barrera de ${who}.`))
    next = updateParticipant(next, participant.id, (p) =>
      p.pc ? { ...p, pc: { ...p.pc, effects: effects.items, barriers: barriers.items } } : p,
    )
  } else if (participant.npc) {
    const effects = tickDurations<Effect>(participant.npc.effects, unit, combat.id)
    const barriers = tickDurations(participant.npc.barriers, unit, combat.id)
    effects.expired.forEach((e) => texts.push(`Se terminó el ${effectLabel(e)} "${e.name}" de ${who}.`))
    barriers.expired.forEach(() => texts.push(`Se terminó una barrera de ${who}.`))
    next = updateParticipant(next, participant.id, (p) =>
      p.npc ? { ...p, npc: { ...p.npc, effects: effects.items, barriers: barriers.items } } : p,
    )
  }
  return pushAlerts(next, texts)
}

function startRound(combat: Combat, round: number, tick: boolean): Combat {
  let next: Combat = { ...combat, round }
  const order = orderedParticipants(next.participants)
  if (tick) for (const p of order) next = tickParticipant(next, p, 'rondas')
  return pushAlerts({ ...next, activeId: order[0]?.id ?? null }, [`Inicio de la ronda ${round}.`])
}

/** Empieza el combate: ronda 1 y turno del primero en el orden. */
export function startCombat(combat: Combat): Combat {
  const first = orderedParticipants(combat.participants)[0]
  if (!first) return combat
  return pushAlerts({ ...combat, round: 1, activeId: first.id }, [
    `Empieza el combate. Turno de ${first.name}.`,
  ])
}

export interface AdvanceOptions {
  /** Si es falso, el turno o la ronda avanza sin bajar las duraciones. */
  tickDurations: boolean
}

/**
 * Termina el turno actual y pasa al siguiente. Si era el último, empieza una ronda nueva.
 * Al terminar su turno, al afectado le bajan las duraciones "en turnos". Al empezar una ronda
 * le bajan a todos las duraciones "en rondas".
 */
export function advanceTurn(combat: Combat, options: AdvanceOptions): Combat {
  const order = orderedParticipants(combat.participants)
  if (order.length === 0) return combat

  const index = order.findIndex((p) => p.id === combat.activeId)
  if (combat.activeId === null || index === -1) return startCombat(combat)

  let next = combat
  if (options.tickDurations) next = tickParticipant(next, order[index], 'turnos')

  const following = order[index + 1]
  if (following) return { ...next, activeId: following.id }
  return startRound(next, next.round + 1, options.tickDurations)
}

/** Salta directo a la ronda siguiente (turno del primero), sin cerrar el turno actual. */
export function advanceRound(combat: Combat, options: AdvanceOptions): Combat {
  if (combat.participants.length === 0) return combat
  return startRound(combat, combat.round + 1, options.tickDurations)
}
