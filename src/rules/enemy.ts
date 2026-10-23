import { ceilTo, ENERGY_MULTIPLIER, ENERGY_ROUNDING } from './energy'
import { armorBonus, weaponBonus } from './equipment'
import type { ArmorType, WeaponSize } from './equipment'
import { reach, techniqueValues } from './derived'
import type { Techniques } from './derived'
import { RANKS, rankIndex } from './ranks'
import type { Rank } from './ranks'
import { STAT_NAMES } from './types'
import type { StatName, Stats, Tier } from './types'

/**
 * Valores de stat por rango (E a SSS+) para cada curva de la calculadora de enemigos.
 * Curva 1 = la de Destreza y Percepción, 2 = la de Fuerza, Constitución y Carisma,
 * 3 = la de Inteligencia y Sabiduría. Cada stat de un enemigo elige una curva.
 */
export const ENEMY_CURVES: Record<Tier, readonly number[]> = {
  1: [60, 120, 180, 250, 300, 350, 400, 475, 530, 590, 680, 790, 1100, 1300, 1600, 1900],
  2: [20, 40, 100, 120, 160, 250, 300, 320, 430, 490, 580, 690, 830, 1000, 1200, 1500],
  3: [10, 20, 60, 80, 120, 200, 200, 250, 330, 390, 480, 590, 730, 900, 1000, 1100],
}

/** Bonos del "rango F" de la hoja de enemigos, cuando el equipo cae un rango bajo el E. */
export const ENEMY_RANK_F = {
  armor: { ligera: 5, mediana: 10, pesada: 12 } as Record<ArmorType, number>,
  weapon: { pequena: 5, mediana: 5, grande: 7, pesada: 12 } as Record<WeaponSize, number>,
}

/** El equipo de un enemigo es de un rango por debajo del suyo. */
const ENEMY_EQUIPMENT_STEPS = -1

export interface EnemyProfile {
  /** Rango del enemigo (E a SSS+). */
  rank: string
  /** Curva de valores que usa cada stat (1, 2 o 3). */
  tiers: Record<StatName, Tier>
  physWeapon: WeaponSize
  magicWeapon: WeaponSize
  physArmor: ArmorType
  magicArmor: ArmorType
  /** Valores puestos a mano que reemplazan al de la curva. */
  overrides: Partial<Record<StatName, number>>
  /** Vida en puntos. La maneja el GM durante la pelea. */
  hp: { current: number; max: number }
}

export interface EnemySheet {
  rank: Rank
  stats: Stats
  mana: number
  stamina: number
  physDamage: number
  physDamageWithWeapon: number
  magicDamage: number
  magicDamageWithWeapon: number
  physDefenseCA: number
  physDefenseSA: number
  magicDefenseCA: number
  magicDefenseSA: number
  speed: number
  physReach: number
  magicReach: number
  techniques: Techniques
}

export function isRankName(name: string): boolean {
  return RANKS.some((r) => r.name === name)
}

/** Perfil de enemigo típico para un rango. */
export function defaultEnemyProfile(rank = 'E'): EnemyProfile {
  return {
    rank: isRankName(rank) ? rank : 'E',
    tiers: {
      fuerza: 1, destreza: 1, constitucion: 2, percepcion: 2,
      inteligencia: 3, sabiduria: 2, carisma: 3,
    },
    physWeapon: 'grande',
    magicWeapon: 'pequena',
    physArmor: 'pesada',
    magicArmor: 'pesada',
    overrides: {},
    hp: { current: 10, max: 10 },
  }
}

function equipmentRank(rank: Rank): Rank | null {
  const index = rankIndex(rank.name) + ENEMY_EQUIPMENT_STEPS
  return index < 0 ? null : RANKS[index]
}

const ceil5 = (value: number): number => ceilTo(value, 5)

/** Calcula todo lo de un enemigo a partir de su perfil, igual que la hoja "Stat Enemigo". */
export function enemySheet(profile: EnemyProfile): EnemySheet {
  const rankIdx = RANKS.findIndex((r) => r.name === profile.rank)
  if (rankIdx === -1) throw new Error(`Rango desconocido: ${profile.rank}`)
  const rank = RANKS[rankIdx]

  const stats = {} as Stats
  for (const name of STAT_NAMES) {
    stats[name] = profile.overrides[name] ?? ENEMY_CURVES[profile.tiers[name]][rankIdx]
  }
  const { fuerza, destreza, constitucion, percepcion, inteligencia, sabiduria, carisma } = stats

  const eq = equipmentRank(rank)
  const weapon = (size: WeaponSize): number => (eq ? weaponBonus(eq, size) : ENEMY_RANK_F.weapon[size])
  const armor = (type: ArmorType): number => (eq ? armorBonus(eq, type) : ENEMY_RANK_F.armor[type])

  const physDamage = 0.7 * fuerza + 0.3 * destreza
  const magicDamage = 0.7 * inteligencia + 0.3 * carisma
  const physDefenseCA = constitucion
  const magicDefenseCA = 0.3 * constitucion + 0.7 * sabiduria

  return {
    rank,
    stats,
    mana: ceilTo((inteligencia + sabiduria + carisma) * ENERGY_MULTIPLIER, ENERGY_ROUNDING),
    stamina: ceilTo((fuerza + destreza + constitucion) * ENERGY_MULTIPLIER, ENERGY_ROUNDING),
    physDamage,
    physDamageWithWeapon: ceil5(physDamage + weapon(profile.physWeapon)),
    magicDamage,
    magicDamageWithWeapon: ceil5(magicDamage + weapon(profile.magicWeapon)),
    physDefenseCA,
    physDefenseSA: physDefenseCA + armor(profile.physArmor),
    magicDefenseCA,
    magicDefenseSA: magicDefenseCA + armor(profile.magicArmor),
    speed: 0.0007 * destreza ** 2 + 0.04 * destreza + 2,
    physReach: ceil5(reach((fuerza + destreza + percepcion) / 3)),
    magicReach: ceil5(reach((inteligencia + sabiduria + carisma) / 3)),
    techniques: techniqueValues(stats, rank, 'destreza'),
  }
}
