import { applyToNpc, applyToPc } from './attack'
import { addAlert, recordActionMany, updateParticipant } from './combat'
import type { Combat } from './combat'
import type { Wounds } from './wounds'

/** Lo que recibe uno de los objetivos de un ataque: heridas si es jugador, puntos de vida si es NPC. */
export interface AreaHit {
  participantId: string
  wounds?: Wounds
  armorSpent?: number
  npcPoints?: number
}

/**
 * Aplica de una vez un ataque a varios objetivos. Queda como una sola acción en el historial, así que un solo
 * "Deshacer" devuelve a todos como estaban.
 */
export function applyAreaHits(combat: Combat, text: string, hits: AreaHit[]): Combat {
  const targets = hits.flatMap((h) => {
    const p = combat.participants.find((x) => x.id === h.participantId)
    return p ? [{ hit: h, before: p }] : []
  })
  if (targets.length === 0) return combat
  let next = recordActionMany(combat, text, targets.map((t) => t.before))
  for (const { hit, before } of targets) {
    next = updateParticipant(next, before.id, (p) => {
      if (p.pc && hit.wounds) return { ...p, pc: applyToPc(p.pc, hit.wounds, hit.armorSpent ?? 0) }
      if (p.npc && hit.npcPoints !== undefined) return { ...p, npc: applyToNpc(p.npc, hit.npcPoints) }
      return p
    })
  }
  return addAlert(next, text)
}
