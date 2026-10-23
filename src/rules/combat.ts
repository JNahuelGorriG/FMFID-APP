import { tickDurations } from './durations'
import type { Effect } from './effects'
import type { EnemyProfile } from './enemy'
import { initialNpcState } from './state'
import type { CharacterState, NpcParticipantState } from './state'

export type CombatStatus = 'activo' | 'pausado' | 'terminado'

export interface Participant {
  id: string
  kind: 'pc' | 'npc'
  /** Personaje al que representa (solo jugadores). */
  characterId: string | null
  name: string
  /** Tirada de iniciativa. Sin tirada, va al final. */
  initiative: number | null
  /** Estado del NPC (solo NPCs). Los jugadores usan su estado vivo. */
  npc: NpcParticipantState | null
}

export interface Alert {
  id: string
  text: string
}

/** Un campo de batalla. Puede haber varios a la vez, cada uno con su iniciativa y su ronda. */
export interface Combat {
  id: string
  name: string
  status: CombatStatus
  round: number
  /** Participante al que le toca. null si el combate no empezó. */
  activeId: string | null
  participants: Participant[]
  alerts: Alert[]
  createdAt: string
  updatedAt: string
}

/** Un combate junto con los estados vivos de los jugadores que participan. */
export interface World {
  combat: Combat
  states: Record<string, CharacterState>
}

const MAX_ALERTS = 30

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

export function addPcParticipant(
  combat: Combat,
  character: { id: string; name: string },
  initiative: number | null,
): Combat {
  return {
    ...combat,
    participants: [
      ...combat.participants,
      { id: crypto.randomUUID(), kind: 'pc', characterId: character.id, name: character.name, initiative, npc: null },
    ],
  }
}

export function addNpcParticipant(
  combat: Combat,
  npc: { name: string; profile: EnemyProfile },
  initiative: number | null,
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
        initiative,
        npc: initialNpcState(npc.profile),
      },
    ],
  }
}

export function setInitiative(combat: Combat, participantId: string, initiative: number | null): Combat {
  return {
    ...combat,
    participants: combat.participants.map((p) => (p.id === participantId ? { ...p, initiative } : p)),
  }
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
  }
}

function pushAlerts(combat: Combat, texts: string[]): Combat {
  if (texts.length === 0) return combat
  const added = texts.map((text) => ({ id: crypto.randomUUID(), text }))
  return { ...combat, alerts: [...added.reverse(), ...combat.alerts].slice(0, MAX_ALERTS) }
}

export function dismissAlert(combat: Combat, alertId: string): Combat {
  return { ...combat, alerts: combat.alerts.filter((a) => a.id !== alertId) }
}

/** Baja las duraciones de un participante y avisa lo que terminó. */
function tickParticipant(world: World, participant: Participant, unit: 'turnos' | 'rondas'): World {
  const combatId = world.combat.id
  const texts: string[] = []
  let { combat, states } = world

  if (participant.kind === 'pc' && participant.characterId) {
    const state = states[participant.characterId]
    if (state) {
      const effects = tickDurations<Effect>(state.effects, unit, combatId)
      const barriers = tickDurations(state.barriers, unit, combatId)
      effects.expired.forEach((e) =>
        texts.push(`Se terminó el ${e.kind === 'buff' ? 'buff' : 'debuff'} "${e.name}" de ${participant.name}.`),
      )
      barriers.expired.forEach(() => texts.push(`Se terminó una barrera de ${participant.name}.`))
      states = {
        ...states,
        [participant.characterId]: { ...state, effects: effects.items, barriers: barriers.items },
      }
    }
  } else if (participant.npc) {
    const effects = tickDurations<Effect>(participant.npc.effects, unit, combatId)
    const barriers = tickDurations(participant.npc.barriers, unit, combatId)
    effects.expired.forEach((e) =>
      texts.push(`Se terminó el ${e.kind === 'buff' ? 'buff' : 'debuff'} "${e.name}" de ${participant.name}.`),
    )
    barriers.expired.forEach(() => texts.push(`Se terminó una barrera de ${participant.name}.`))
    combat = {
      ...combat,
      participants: combat.participants.map((p) =>
        p.id === participant.id && p.npc
          ? { ...p, npc: { ...p.npc, effects: effects.items, barriers: barriers.items } }
          : p,
      ),
    }
  }

  return { combat: pushAlerts(combat, texts), states }
}

function startRound(world: World, round: number, tick: boolean): World {
  let w: World = { ...world, combat: { ...world.combat, round } }
  const order = orderedParticipants(w.combat.participants)
  if (tick) for (const p of order) w = tickParticipant(w, p, 'rondas')
  const first = order[0]?.id ?? null
  return {
    ...w,
    combat: pushAlerts({ ...w.combat, activeId: first }, [`Inicio de la ronda ${round}.`]),
  }
}

/** Empieza el combate: ronda 1 y turno del primero en el orden. */
export function startCombat(world: World): World {
  const first = orderedParticipants(world.combat.participants)[0]
  if (!first) return world
  return {
    ...world,
    combat: pushAlerts(
      { ...world.combat, round: 1, activeId: first.id },
      [`Empieza el combate. Turno de ${first.name}.`],
    ),
  }
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
export function advanceTurn(world: World, options: AdvanceOptions): World {
  const order = orderedParticipants(world.combat.participants)
  if (order.length === 0) return world

  const index = order.findIndex((p) => p.id === world.combat.activeId)
  if (world.combat.activeId === null || index === -1) return startCombat(world)

  let w = world
  if (options.tickDurations) w = tickParticipant(w, order[index], 'turnos')

  const next = order[index + 1]
  if (next) return { ...w, combat: { ...w.combat, activeId: next.id } }
  return startRound(w, w.combat.round + 1, options.tickDurations)
}

/** Salta directo a la ronda siguiente (turno del primero), sin cerrar el turno actual. */
export function advanceRound(world: World, options: AdvanceOptions): World {
  if (world.combat.participants.length === 0) return world
  return startRound(world, world.combat.round + 1, options.tickDurations)
}
