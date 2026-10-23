import { initialPcState } from '../rules'
import type { Character, Combat, Participant, PcState } from '../rules'

/** Estado vivo por personaje de las versiones anteriores (ya no existe). */
export interface LegacyState {
  characterId: string
  health: PcState['health']
  barriers: PcState['barriers']
  mana: PcState['mana']
  stamina: PcState['stamina']
  saves: PcState['saves']
  effects: PcState['effects']
}

type LegacyParticipant = Omit<Participant, 'side' | 'pc'> & Partial<Pick<Participant, 'side' | 'pc'>>
export type LegacyCombat = Omit<Combat, 'participants' | 'history'> & {
  participants: LegacyParticipant[]
  history?: Combat['history']
}

/**
 * Pasa un combate de versiones anteriores al formato actual: cada jugador recibe su propio
 * estado dentro del combate (copiado del estado vivo que tenía, o el inicial) y cada
 * participante recibe su bando.
 */
export function migrateCombat(
  combat: LegacyCombat,
  characters: Character[],
  states: LegacyState[],
): Combat {
  const participants: Participant[] = combat.participants.map((p) => {
    const side = p.side ?? (p.kind === 'pc' ? 'jugador' : 'enemigo')
    if (p.kind !== 'pc' || p.pc) return { ...p, side, pc: p.pc ?? null }

    const legacy = states.find((s) => s.characterId === p.characterId)
    if (legacy) {
      const { characterId: _id, ...rest } = legacy
      return { ...p, side, pc: { ...rest, armor: null, saturation: 0 } }
    }
    const character = characters.find((c) => c.id === p.characterId)
    return { ...p, side, pc: character ? initialPcState(character) : null }
  })
  return { ...combat, participants, history: combat.history ?? [] }
}

/**
 * Completa en un combate los datos que se agregaron después (saturación de los jugadores y
 * a qué defensa suma la armadura), para combates guardados con versiones anteriores.
 */
export function normalizeCombat(combat: Combat): Combat {
  return {
    ...combat,
    participants: combat.participants.map((p) =>
      p.pc
        ? {
            ...p,
            pc: {
              ...p.pc,
              saturation: p.pc.saturation ?? 0,
              armor: p.pc.armor ? { ...p.pc.armor, bonusTarget: p.pc.armor.bonusTarget ?? 'fisica' } : null,
            },
          }
        : p,
    ),
  }
}
