import { isRankName } from './enemy'
import type { EnemyProfile } from './enemy'

/** NPC único de la historia o bestia del bestiario (monstruos sin tanta relevancia). */
export type NpcKind = 'npc' | 'bestia'

/** NPC de la mesa: datos descriptivos y, opcionalmente, un perfil de combate. */
export interface Npc {
  id: string
  kind: NpcKind
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
  /**
   * Variantes del mismo enemigo (por ejemplo Anti Esper: Destreza, Guerrero, Tanque...), cada una con su
   * propio perfil. Si hay variantes, mandan ellas y `combat` queda en null.
   */
  variants?: NpcVariant[]
  createdAt: string
  updatedAt: string
}

/** Una alineación del enemigo: etiqueta y perfil de combate propio. */
export interface NpcVariant {
  id: string
  label: string
  combat: EnemyProfile
}

export type NewNpc = Omit<Npc, 'id' | 'createdAt' | 'updatedAt'>

export function newNpcTemplate(kind: NpcKind = 'npc'): NewNpc {
  return {
    kind,
    name: kind === 'bestia' ? 'Nueva bestia' : 'Nuevo NPC', role: '', rank: '', element: '', guild: '', realm: '', race: '',
    affiliation: '', occupation: '', personality: '', details: '', combat: null,
  }
}

/** Rango de combate sugerido a partir del rango anotado en la lista. */
export function suggestedCombatRank(npc: Pick<Npc, 'rank'>): string {
  return isRankName(npc.rank) ? npc.rank : 'E'
}

/** Perfiles con los que se puede pelear: las variantes, o el perfil único como opción sin etiqueta. */
export function combatOptions(npc: Pick<Npc, 'combat' | 'variants'>): NpcVariant[] {
  if (npc.variants && npc.variants.length > 0) return npc.variants
  return npc.combat ? [{ id: 'base', label: '', combat: npc.combat }] : []
}

export function hasCombat(npc: Pick<Npc, 'combat' | 'variants'>): boolean {
  return combatOptions(npc).length > 0
}

/** Nombre en combate de una variante: "Anti Esper (Tanque)". */
export function variantName(npcName: string, label: string): string {
  return label.trim() ? `${npcName} (${label.trim()})` : npcName
}

/** Pasa el perfil único a la lista de variantes (la primera se llama "Base"). */
export function toVariants(npc: Npc): Npc {
  if (npc.variants && npc.variants.length > 0) return npc
  if (!npc.combat) return npc
  return { ...npc, combat: null, variants: [{ id: crypto.randomUUID(), label: 'Base', combat: npc.combat }] }
}

/** Etiqueta de una bestia absorbida: lo que sobra de su nombre tras el nombre base ("Anti Esper Tanque" → "Tanque"). */
export function labelFromName(base: string, name: string): string {
  const b = base.trim()
  const n = name.trim()
  if (b && n.toLowerCase().startsWith(b.toLowerCase())) {
    const rest = n.slice(b.length).replace(/^[\s\-–—:·,/()]+|[\s\-–—:·,/()]+$/g, '')
    if (rest) return rest
  }
  return n
}

/**
 * Une otras bestias como variantes de `target`. Cada una aporta su perfil (o sus variantes). Devuelve la bestia
 * resultante; quien llama borra las absorbidas.
 */
export function absorbAsVariants(target: Npc, others: Npc[]): Npc {
  const base = toVariants(target)
  const variants = [...(base.variants ?? [])]
  for (const o of others) {
    if (o.variants && o.variants.length > 0) {
      for (const v of o.variants) variants.push({ ...v, id: crypto.randomUUID(), label: v.label || labelFromName(target.name, o.name) })
    } else if (o.combat) {
      variants.push({ id: crypto.randomUUID(), label: labelFromName(target.name, o.name), combat: o.combat })
    }
  }
  return { ...base, combat: null, variants }
}
