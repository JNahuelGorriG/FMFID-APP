import type { NpcBarrier, PcBarrier } from './barriers'
import type { Effect } from './effects'
import type { EnemyProfile } from './enemy'
import type { Health } from './health'
import type { Saves } from './saves'
import { defaultSaves } from './saves'
import type { Character } from './character'
import { characterSheet } from './character'
import { armorBonus, armorUses } from './equipment'
import type { ArmorType } from './equipment'
import { RANKS } from './ranks'

export interface EnergyPools {
  natural: number
  renovable: number
}

export type ArmorTarget = 'fisica' | 'magica' | 'ambas'

/** Armadura puesta de un jugador en un combate, con sus usos. */
export interface ArmorState {
  type: ArmorType
  /** Rango de la armadura (E a SSS+). */
  rank: string
  /** Valor que suma a la defensa CA. Lo puede poner el GM a mano. */
  bonus: number
  /** A qué defensa suma el valor. Una armadura suma a un solo stat, salvo que se indique "ambas". */
  bonusTarget: ArmorTarget
  usesMax: number
  usesLeft: number
}

/** Arma una armadura con los valores de las tablas (bono y usos). Fuera del rango E-S los usos quedan en 0. */
export function armorFromTable(type: ArmorType, rank: string): ArmorState {
  const found = RANKS.find((r) => r.name === rank) ?? RANKS[0]
  const uses = armorUses(found.name, type)?.total ?? 0
  return { type, rank: found.name, bonus: armorBonus(found, type), bonusTarget: 'fisica', usesMax: uses, usesLeft: uses }
}

/**
 * Estado de un jugador dentro de UN combate. Cada combate tiene el suyo: lo que pasa en
 * un campo de batalla no afecta a otro.
 */
export interface PcState {
  health: Health
  barriers: PcBarrier[]
  mana: EnergyPools
  stamina: EnergyPools
  saves: Saves
  effects: Effect[]
  armor: ArmorState | null
  /** Barra de saturación por curación, en porcentaje (0 a 100). La lleva el GM a mano. */
  saturation: number
}

/** Estado inicial al entrar a un combate: vida y energías llenas, sin armadura puesta. */
export function initialPcState(character: Character): PcState {
  const sheet = characterSheet(character)
  return {
    health: { ...character.baseHealth },
    barriers: [],
    mana: { natural: sheet.mana / 2, renovable: sheet.mana / 2 },
    stamina: { natural: sheet.stamina / 2, renovable: sheet.stamina / 2 },
    saves: defaultSaves(),
    effects: [],
    armor: null,
    saturation: 0,
  }
}

/** Estado de un NPC dentro de un combate. Es una copia: no toca al NPC original. */
export interface NpcParticipantState {
  profile: EnemyProfile
  hpCurrent: number
  hpMax: number
  barriers: NpcBarrier[]
  effects: Effect[]
  /** Barra de saturación por curación, en porcentaje (0 a 100). La lleva el GM a mano. */
  saturation: number
}

export function initialNpcState(profile: EnemyProfile): NpcParticipantState {
  return {
    profile: structuredClone(profile),
    hpCurrent: profile.hp.current,
    hpMax: profile.hp.max,
    barriers: [],
    effects: [],
    saturation: 0,
  }
}
