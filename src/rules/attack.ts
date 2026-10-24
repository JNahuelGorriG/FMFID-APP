import { absorbPointBarriers, absorbWithBarriers } from './barriers'
import { applyWounds } from './health'
import { differenceLevel, resolveHit } from './hit'
import type { AutomaticOutcome, DifferenceLevel, RollOutcome } from './hit'
import { armorActive, defenseAgainst } from './profile'
import type { AttackType, Profile } from './profile'
import type { NpcParticipantState, PcState } from './state'
import type { StatName } from './types'
import { mitigateWithArmor, woundCategory, woundsFromTable } from './wounds'
import type { Wounds, WoundCategory } from './wounds'

export type { AttackType } from './profile'

export interface HitCheck {
  attackerValue: number
  defenderValue: number
  /** Atacante menos defensor. */
  difference: number
  /** Nivel según el rango del defensor. */
  level: DifferenceLevel
}

/** Compara el stat elegido del atacante con el stat elegido del defensor. */
export function hitCheck(
  attacker: Profile,
  defender: Profile,
  attackerStat: StatName,
  defenderStat: StatName,
): HitCheck {
  const attackerValue = attacker.stats[attackerStat]
  const defenderValue = defender.stats[defenderStat]
  const difference = attackerValue - defenderValue
  return { attackerValue, defenderValue, difference, level: differenceLevel(difference, defender.group) }
}

export function isHit(outcome: RollOutcome | AutomaticOutcome): boolean {
  return outcome === 'exito' || outcome === 'exito-mayor' || outcome === 'exito-critico' || outcome === 'exito-automatico'
}

export { resolveHit }

export interface DamageStage {
  damage: number
  defense: number
  armored: boolean
  /** Categoría antes de la armadura. */
  category: WoundCategory
  /** Categoría después de la armadura. */
  applied: WoundCategory
  armorSpent: number
}

/**
 * Etapa de daño: el daño del atacante contra la defensa del defensor decide la categoría de
 * herida (con la fila del rango del defensor), y la armadura la baja un nivel.
 * `type` es el tipo de daño del ataque. La defensa que participa es la del mismo tipo salvo que se
 * indique otra (`defenseType`): por ejemplo, daño físico contra la defensa mágica.
 * `extra` suma al daño (Escencia, Kyushu...). Se puede pasar un daño o defensa a mano para corregir los
 * calculados; un daño a mano reemplaza al calculado, extras incluidos.
 */
export function damageStage(
  attacker: Profile,
  defender: Profile,
  type: AttackType,
  override: { damage?: number; defense?: number; extra?: number } = {},
  defenseType: AttackType = type,
): DamageStage {
  const damage = override.damage ?? attacker.damage[type] + (override.extra ?? 0)
  const base = defenseAgainst(defender, defenseType)
  const defense = override.defense ?? base.value
  const category = woundCategory(damage, defense, defender.group)
  const armor = defender.armor
  let mitigation = { applied: category, usesSpent: 0 }
  if (base.armored && armorActive(armor)) {
    // Sin usos cargados la armadura mitiga sin gastarse.
    const tracked = armor.usesMax > 0
    const result = mitigateWithArmor(category, tracked ? armor.usesLeft : Number.MAX_SAFE_INTEGER)
    mitigation = { applied: result.applied, usesSpent: tracked ? result.usesSpent : 0 }
  }
  return { damage, defense, armored: base.armored, category, applied: mitigation.applied, armorSpent: mitigation.usesSpent }
}

/** Heridas que recibe un jugador según la categoría aplicada y su resultado de resistencia. */
export function woundsForPc(applied: WoundCategory, resistance: number): Wounds {
  return woundsFromTable(applied, resistance)
}

/**
 * Aplica un ataque a un jugador: la barrera absorbe primero, el resto baja la vida,
 * y la armadura gasta sus usos.
 */
export function applyToPc(pc: PcState, wounds: Wounds, armorSpent: number): PcState {
  const absorbed = absorbWithBarriers(pc.barriers, wounds)
  const result = applyWounds(pc.health, absorbed.remaining)
  return {
    ...pc,
    barriers: absorbed.barriers,
    health: result.health,
    armor: pc.armor
      ? { ...pc.armor, usesLeft: Math.max(0, pc.armor.usesLeft - armorSpent) }
      : pc.armor,
  }
}

/** Aplica daño en puntos a un NPC: la barrera absorbe primero y el resto baja su vida. */
export function applyToNpc(npc: NpcParticipantState, points: number): NpcParticipantState {
  const absorbed = absorbPointBarriers(npc.barriers, Math.max(0, points))
  return {
    ...npc,
    barriers: absorbed.barriers,
    hpCurrent: Math.max(0, npc.hpCurrent - absorbed.remaining),
  }
}

/** Puntos de vida sugeridos para un NPC según la categoría de la herida (lo decide el GM). */
export const SUGGESTED_NPC_POINTS: Record<WoundCategory, number> = {
  leve: 1,
  medio: 2,
  fuerte: 3,
  letal: 4,
}
