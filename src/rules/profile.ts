import { characterSheet } from './character'
import type { Character } from './character'
import type { Participant, Side } from './combat'
import { effectiveCharacter, effectiveEnemy } from './effective'
import { RANKS } from './ranks'
import type { RankGroup } from './ranks'
import type { ArmorState } from './state'
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
  /** Daño con arma si el combatiente usa una, y si no el daño base. */
  damage: Record<AttackType, number>
  defense: Record<AttackType, { ca: number; sa: number }>
  armor: ArmorState | null
  health: string
}

/**
 * Arma el perfil de un participante. Para un jugador hace falta su personaje;
 * si no está (fue borrado), devuelve null.
 */
export function buildProfile(participant: Participant, character?: Character): Profile | null {
  if (participant.pc) {
    if (!character) return null
    const view = effectiveCharacter(character, participant.pc.effects)
    const d = view.derived
    const h = participant.pc.health
    return {
      participantId: participant.id,
      name: participant.name,
      side: participant.side,
      kind: 'pc',
      rankName: view.natural.rank?.name ?? null,
      group: view.natural.rank?.group ?? 'bajo',
      stats: view.stats,
      damage: {
        fisico: d.physDamageWithWeapon ?? d.physDamage,
        magico: d.magicDamageWithWeapon ?? d.magicDamage,
      },
      defense: {
        fisico: { ca: d.physDefenseCA, sa: d.physDefenseSA },
        magico: { ca: d.magicDefenseCA, sa: d.magicDefenseSA },
      },
      armor: participant.pc.armor,
      health: `${h.leve} · ${h.medio} · ${h.letal}`,
    }
  }
  if (participant.npc) {
    const n = participant.npc
    const view = effectiveEnemy(n.profile, n.effects)
    const s = view.sheet
    const rank = RANKS.find((r) => r.name === n.profile.rank)
    return {
      participantId: participant.id,
      name: participant.name,
      side: participant.side,
      kind: 'npc',
      rankName: rank?.name ?? null,
      group: rank?.group ?? 'bajo',
      stats: view.stats,
      damage: { fisico: s.physDamageWithWeapon, magico: s.magicDamageWithWeapon },
      defense: {
        fisico: { ca: s.physDefenseCA, sa: s.physDefenseSA },
        magico: { ca: s.magicDefenseCA, sa: s.magicDefenseSA },
      },
      armor: null,
      health: `${n.hpCurrent} / ${n.hpMax}`,
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
