import { referenceArmorBonus, referenceWeaponBonus } from './equipment'
import type { ArmorType, EquipmentRef, WeaponSize } from './equipment'
import { techniqueLevel } from './ranks'
import type { Rank } from './ranks'
import type { StatName, Stats } from './types'

/** Ajustes propios de cada personaje para sus stats derivados. */
export interface DerivedConfig {
  /** Arma de referencia del daño físico con arma. null si el personaje no lo usa. */
  physDamageWeapon: EquipmentRef<WeaponSize> | null
  /** Arma de referencia del daño mágico con arma. null si el personaje no lo usa. */
  magicDamageWeapon: EquipmentRef<WeaponSize> | null
  /** Armadura de referencia de la defensa física natural (SA). */
  physDefenseArmor: EquipmentRef<ArmorType>
  /** Armadura de referencia de la defensa mágica natural (SA). */
  magicDefenseArmor: EquipmentRef<ArmorType>
  /** Pesos de la defensa mágica. Por defecto 0,3 Constitución y 0,7 Sabiduría. */
  magicDefenseWeights?: { constitucion: number; sabiduria: number }
  /** Stat ofensivo (Fuerza o Destreza). Lo usan Esencia, E. Reinforced y Reiatsu. */
  agilityStat?: 'destreza' | 'fuerza'
}

export interface Techniques {
  kyushu: number
  magyushuru: number
  aetheriumAscendance: number
  aetheriumMastery: number
  reiatsu: number
  ki: number
  haKi: number
  esencia: number
  eReinforced: number
  reiatsuOverride: number
}

export interface DerivedStats {
  physDamage: number
  physDamageWithWeapon: number | null
  magicDamage: number
  magicDamageWithWeapon: number | null
  /** CA = con armadura (el valor de la armadura se suma aparte). SA = natural, sin armadura. */
  physDefenseCA: number
  physDefenseSA: number
  magicDefenseCA: number
  magicDefenseSA: number
  speed: number
  physReach: number
  magicReach: number
  techniques: Techniques
}

/** Potenciaciones. `agilityStat` es el stat ofensivo del personaje: Fuerza o Destreza. */
export function techniqueValues(stats: Stats, rank: Rank | null, agilityStat: StatName): Techniques {
  const { fuerza, constitucion, inteligencia, sabiduria, carisma } = stats
  const agility = stats[agilityStat]
  const y = techniqueLevel(rank)
  const tech = (value: number): number => Math.round(0.82 * value) + 5 * y
  return {
    kyushu: tech(0.07 * inteligencia + 0.03 * sabiduria),
    magyushuru: tech(0.15 * inteligencia + 0.1 * sabiduria),
    aetheriumAscendance: tech(0.03 * carisma + 0.04 * inteligencia + 0.03 * sabiduria),
    aetheriumMastery: tech(0.1 * carisma + 0.15 * inteligencia + 0.1 * sabiduria),
    reiatsu: Math.round(0.82 * (0.3 * carisma + 0.7 * agility)),
    ki: tech(0.07 * fuerza + 0.03 * constitucion),
    haKi: tech(0.115 * fuerza + 0.085 * constitucion),
    esencia: tech(0.07 * carisma + 0.03 * agility),
    eReinforced: tech(0.15 * carisma + 0.1 * agility),
    reiatsuOverride: Math.round(0.3 * carisma + 0.7 * agility),
  }
}

export const reach = (average: number): number => 0.00085 * average ** 2 + 0.08 * average + 2

export function derivedStats(stats: Stats, rank: Rank | null, config: DerivedConfig): DerivedStats {
  const { fuerza, destreza, constitucion, percepcion, inteligencia, sabiduria, carisma } = stats

  const physDamage = 0.7 * fuerza + 0.3 * destreza
  const magicDamage = 0.7 * inteligencia + 0.3 * carisma

  const weights = config.magicDefenseWeights ?? { constitucion: 0.3, sabiduria: 0.7 }
  const physDefenseCA = constitucion
  const magicDefenseCA = weights.constitucion * constitucion + weights.sabiduria * sabiduria

  // Sin rango no hay equipo de referencia: los bonos valen 0.
  const weapon = (ref: EquipmentRef<WeaponSize> | null): number | null =>
    ref === null ? null : rank === null ? 0 : referenceWeaponBonus(rank, ref)
  const armor = (ref: EquipmentRef<ArmorType>): number =>
    rank === null ? 0 : referenceArmorBonus(rank, ref)

  const physWeapon = weapon(config.physDamageWeapon)
  const magicWeapon = weapon(config.magicDamageWeapon)

  return {
    physDamage,
    physDamageWithWeapon: physWeapon === null ? null : physDamage + physWeapon,
    magicDamage,
    magicDamageWithWeapon: magicWeapon === null ? null : magicDamage + magicWeapon,
    physDefenseCA,
    physDefenseSA: physDefenseCA + armor(config.physDefenseArmor),
    magicDefenseCA,
    magicDefenseSA: magicDefenseCA + armor(config.magicDefenseArmor),
    speed: 0.0007 * destreza ** 2 + 0.04 * destreza + 2,
    physReach: reach((fuerza + destreza + percepcion) / 3),
    magicReach: reach((inteligencia + sabiduria + carisma) / 3),
    techniques: techniqueValues(stats, rank, config.agilityStat === 'fuerza' ? 'fuerza' : 'destreza'),
  }
}
