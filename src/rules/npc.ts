import { isRankName } from './enemy'
import type { EnemyProfile } from './enemy'

/** NPC de la mesa: datos descriptivos y, opcionalmente, un perfil de combate. */
export interface Npc {
  id: string
  name: string
  role: string
  /** Rango tal como se anota en la lista (puede ser "-" o texto libre). */
  rank: string
  element: string
  guild: string
  realm: string
  race: string
  affiliation: string
  occupation: string
  personality: string
  details: string
  /** Stats y vida para pelear. null si el NPC no tiene perfil de combate. */
  combat: EnemyProfile | null
  createdAt: string
  updatedAt: string
}

export type NewNpc = Omit<Npc, 'id' | 'createdAt' | 'updatedAt'>

export function newNpcTemplate(): NewNpc {
  return {
    name: 'Nuevo NPC', role: '', rank: '', element: '', guild: '', realm: '', race: '',
    affiliation: '', occupation: '', personality: '', details: '', combat: null,
  }
}

/** Rango de combate sugerido a partir del rango anotado en la lista. */
export function suggestedCombatRank(npc: Pick<Npc, 'rank'>): string {
  return isRankName(npc.rank) ? npc.rank : 'E'
}
