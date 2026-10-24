import type { NpcBarrier, PcBarrier } from './barriers'
import type { Effect } from './effects'
import type { EnemyProfile } from './enemy'
import type { Health } from './health'
import type { Saves } from './saves'
import { defaultSaves } from './saves'
import type { Character } from './character'
import { characterSheet } from './character'
import { armorBonus, armorUsesFor, weaponBonus } from './equipment'
import type { ArmorType, WeaponSize } from './equipment'
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

/**
 * Arma una armadura con los valores de las tablas (bono y usos). Los rangos con + usan los usos de su
 * letra. Si no hay tabla (SS, SSS) los usos quedan en 0: la armadura cuenta siempre, sin gastarse.
 */
export function armorFromTable(type: ArmorType, rank: string): ArmorState {
  const found = RANKS.find((r) => r.name === rank) ?? RANKS[0]
  const uses = armorUsesFor(found.name, type)?.total ?? 0
  return { type, rank: found.name, bonus: armorBonus(found, type), bonusTarget: 'fisica', usesMax: uses, usesLeft: uses }
}

export type WeaponTarget = 'fisico' | 'magico' | 'ambos'

/** Arma equipada en un combate. Su valor se suma al daño base del combatiente. */
export interface WeaponState {
  size: WeaponSize
  /** Rango del arma (E a SSS+). */
  rank: string
  /** Valor que suma al daño. Sale de la tabla de armas y el GM lo puede editar. */
  bonus: number
  /** A qué daño suma: físico, mágico o ambos. */
  bonusTarget: WeaponTarget
}

/** Arma con el valor de la tabla de armas para ese tamaño y rango. Por defecto suma al daño físico. */
export function weaponFromTable(size: WeaponSize, rank: string): WeaponState {
  const found = RANKS.find((r) => r.name === rank) ?? RANKS[0]
  return { size, rank: found.name, bonus: weaponBonus(found, size), bonusTarget: 'fisico' }
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
  /** Arma equipada. Sin ella, el daño usa el arma de referencia del personaje. */
  weapon: WeaponState | null
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
    weapon: null,
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
  /** Arma equipada. Sin ella, el daño usa el arma de referencia de su perfil. */
  weapon: WeaponState | null
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
    weapon: null,
    saturation: 0,
  }
}
