import { characterSheet } from './character'
import type { Character } from './character'
import type { Participant, Side } from './combat'
import type { ResolvedEffect } from './effects'
import type { Techniques } from './derived'
import { ceilTo } from './energy'
import { effectiveCharacter, effectiveEnemy } from './effective'
import { RANKS } from './ranks'
import type { RankGroup } from './ranks'
import type { ArmorState, WeaponState } from './state'
import type { Stats } from './types'

export type AttackType = 'fisico' | 'magico'

/** Lo que hace falta de un combatiente para enfrentarlo con otro, con buffs y debuffs aplicados. */
export interface Profile {
  participantId: string
  name: string
  side: Side
  kind: 'pc' | 'npc'
  rankName: string | null
  /** Fila de la tabla de umbrales. Sin rango se usa "bajo". */
  group: RankGroup
  stats: Stats
  /**
   * Daño del ataque sin extras: el base más el arma. Con un arma equipada, el valor de esa arma.
   * Sin ella, el del arma de referencia (o solo el base si no usa arma).
   */
  damage: Record<AttackType, number>
  /** El daño separado en base y arma, para mostrar de dónde sale. */
  damageParts: Record<AttackType, { base: number; weapon: number }>
  /** El arma que cuenta: equipada o de referencia. null si no usa arma. */
  weapon: { label: string; equipped: boolean } | null
  /** Potenciaciones naturales (Escencia, Kyushu...), que se pueden sumar al daño. */
  techniques: Techniques
  defense: Record<AttackType, { ca: number; sa: number }>
  armor: ArmorState | null
  health: string
  /** Buffs y debuffs con su estado (activo, pisado, sin lugar). */
  resolved: ResolvedEffect[]
}

const SIZE_LABELS = { pequena: 'Pequeña', mediana: 'Mediana', grande: 'Grande', pesada: 'Pesada' } as const

const weaponApplies = (weapon: WeaponState, type: AttackType): boolean =>
  weapon.bonusTarget === 'ambos' || weapon.bonusTarget === type

const weaponLabel = (weapon: WeaponState): string => `${SIZE_LABELS[weapon.size]} ${weapon.rank}`

/**
 * Arma el perfil de un participante. Para un jugador hace falta su personaje;
 * si no está (fue borrado), devuelve null.
 */
export function buildProfile(participant: Participant, character?: Character): Profile | null {
  if (participant.pc) {
    if (!character) return null
    const view = effectiveCharacter(character, participant.pc.effects, participant.pc.statCaps)
    const d = view.derived
    const h = participant.pc.health
    const weapon = participant.pc.weapon
    const reference = { fisico: d.physDamageWithWeapon, magico: d.magicDamageWithWeapon }
    const base = { fisico: d.physDamage, magico: d.magicDamage }
    const damage = {} as Record<AttackType, number>
    const parts = {} as Record<AttackType, { base: number; weapon: number }>
    for (const t of ['fisico', 'magico'] as const) {
      damage[t] = weapon && weaponApplies(weapon, t) ? base[t] + weapon.bonus : (reference[t] ?? base[t])
      parts[t] = { base: base[t], weapon: damage[t] - base[t] }
    }
    return {
      participantId: participant.id,
      name: participant.name,
      side: participant.side,
      kind: 'pc',
      rankName: view.natural.rank?.name ?? null,
      group: view.natural.rank?.group ?? 'bajo',
      stats: view.stats,
      damage,
      damageParts: parts,
      weapon: weapon
        ? { label: weaponLabel(weapon), equipped: true }
        : d.physDamageWithWeapon !== null || d.magicDamageWithWeapon !== null
          ? { label: 'arma de referencia', equipped: false }
          : null,
      techniques: view.natural.derived.techniques,
      defense: {
        fisico: { ca: d.physDefenseCA, sa: d.physDefenseSA },
        magico: { ca: d.magicDefenseCA, sa: d.magicDefenseSA },
      },
      armor: participant.pc.armor,
      health: `${h.leve} · ${h.medio} · ${h.letal}`,
      resolved: view.resolved,
    }
  }
  if (participant.npc) {
    const n = participant.npc
    const view = effectiveEnemy(n.profile, n.effects, n.statCaps)
    const s = view.sheet
    const rank = RANKS.find((r) => r.name === n.profile.rank)
    const weapon = n.weapon
    const reference = { fisico: s.physDamageWithWeapon, magico: s.magicDamageWithWeapon }
    const base = { fisico: s.physDamage, magico: s.magicDamage }
    const damage = {} as Record<AttackType, number>
    const parts = {} as Record<AttackType, { base: number; weapon: number }>
    for (const t of ['fisico', 'magico'] as const) {
      // Como en la calculadora de enemigos, el daño con arma se redondea hacia arriba a múltiplos de 5.
      damage[t] = weapon && weaponApplies(weapon, t) ? ceilTo(base[t] + weapon.bonus, 5) : reference[t]
      parts[t] = { base: base[t], weapon: damage[t] - base[t] }
    }
    return {
      participantId: participant.id,
      name: participant.name,
      side: participant.side,
      kind: 'npc',
      rankName: rank?.name ?? null,
      group: rank?.group ?? 'bajo',
      stats: view.stats,
      damage,
      damageParts: parts,
      weapon: weapon ? { label: weaponLabel(weapon), equipped: true } : { label: 'arma de referencia', equipped: false },
      techniques: view.natural.techniques,
      defense: {
        fisico: { ca: s.physDefenseCA, sa: s.physDefenseSA },
        magico: { ca: s.magicDefenseCA, sa: s.magicDefenseSA },
      },
      armor: null,
      health: `${n.hpCurrent} / ${n.hpMax}`,
      resolved: view.resolved,
    }
  }
  return null
}

/**
 * Una armadura cuenta mientras le queden usos. Si no tiene usos cargados (máximo 0), cuenta siempre
 * y no se gasta, para que una armadura sin tabla de usos no se tome por rota.
 */
export function armorActive(armor: ArmorState | null): armor is ArmorState {
  return armor !== null && (armor.usesMax === 0 || armor.usesLeft > 0)
}

/**
 * Defensa que cuenta contra un ataque: con armadura puesta y con usos, es la CA más el valor
 * de la armadura (si suma a esa defensa). Sin armadura (o con la armadura agotada), la defensa natural SA.
 */
export function defenseAgainst(
  profile: Profile,
  type: AttackType,
): { value: number; armored: boolean } {
  const d = profile.defense[type]
  const armor = profile.armor
  if (armorActive(armor)) {
    const target = armor.bonusTarget ?? 'fisica'
    const applies = target === 'ambas' || target === (type === 'fisico' ? 'fisica' : 'magica')
    return { value: d.ca + (applies ? armor.bonus : 0), armored: true }
  }
  return { value: d.sa, armored: false }
}

/** Perfil sin los datos del personaje: solo para mostrar listas. */
export function sheetRank(character: Character): string | null {
  return characterSheet(character).rank?.name ?? null
}
