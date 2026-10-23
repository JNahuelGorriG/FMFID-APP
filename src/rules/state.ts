import type { NpcBarrier, PcBarrier } from './barriers'
import type { Effect } from './effects'
import type { EnemyProfile } from './enemy'
import type { Health } from './health'
import type { Saves } from './saves'
import { defaultSaves } from './saves'
import type { Character } from './character'
import { characterSheet } from './character'

export interface EnergyPools {
  natural: number
  renovable: number
}

/**
 * Estado vivo de un personaje: lo que cambia durante la campaña. Se guarda aparte
 * del personaje y es el mismo sin importar en cuántos combates participe.
 */
export interface CharacterState {
  characterId: string
  health: Health
  barriers: PcBarrier[]
  mana: EnergyPools
  stamina: EnergyPools
  saves: Saves
  effects: Effect[]
}

/** Estado inicial: vida y energías llenas. */
export function initialState(character: Character): CharacterState {
  const sheet = characterSheet(character)
  return {
    characterId: character.id,
    health: { ...character.baseHealth },
    barriers: [],
    mana: { natural: sheet.mana / 2, renovable: sheet.mana / 2 },
    stamina: { natural: sheet.stamina / 2, renovable: sheet.stamina / 2 },
    saves: defaultSaves(),
    effects: [],
  }
}

/** Estado de un NPC dentro de un combate. Es una copia: no toca al NPC original. */
export interface NpcParticipantState {
  profile: EnemyProfile
  hpCurrent: number
  hpMax: number
  barriers: NpcBarrier[]
  effects: Effect[]
}

export function initialNpcState(profile: EnemyProfile): NpcParticipantState {
  return {
    profile: structuredClone(profile),
    hpCurrent: profile.hp.current,
    hpMax: profile.hp.max,
    barriers: [],
    effects: [],
  }
}
