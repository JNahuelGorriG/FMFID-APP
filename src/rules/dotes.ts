import type { Character } from './character'
import { BRANCHES } from './tree'
import type { BranchId, Dote } from './tree'
import { STAT_NAMES } from './types'
import type { StatName } from './types'

/** Los 6 tiers de las dotes, de menor a mayor. */
export const DOTE_TIERS = ['E', 'D', 'C', 'B', 'A', 'S'] as const
export type DoteTier = (typeof DOTE_TIERS)[number]

/** El tipo de una dote: uno de los 7 stats (la rama del árbol que la da) o "único". */
export type DoteType = StatName | 'unico'
export const DOTE_TYPES: readonly DoteType[] = [...STAT_NAMES, 'unico']

/** Una dote del catálogo de la mesa. */
export interface CatalogDote {
  id: string
  tier: DoteTier
  name: string
  type: DoteType
  /** Cómo se usa: "Pasiva", "Reacción, 2 por batalla", "2 por descanso largo"... */
  use: string
  description: string
  createdAt: string
  updatedAt: string
}

export type NewDote = Omit<CatalogDote, 'id' | 'createdAt' | 'updatedAt'>

/** Los usos más comunes, para ofrecerlos como sugerencia. El campo admite cualquier texto. */
export const USE_SUGGESTIONS: readonly string[] = [
  'Pasiva',
  'Reacción, 2 por batalla',
  'Reacción, 1 por batalla',
  'Acción adicional, 1 por batalla',
  'Acción adicional, 2 por batalla',
  '1 por batalla',
  '2 por batalla',
  '1 por descanso corto',
  'Descanso corto',
  '1 por descanso largo',
  '2 por descanso largo',
  'Descanso largo',
  'Pasiva y 2 por descanso largo',
]

/** Grandes formas de uso, para poder filtrar. Una dote puede tener varias. */
export type UseKind = 'pasiva' | 'reaccion' | 'accion' | 'batalla' | 'descanso'

export const USE_KIND_LABELS: Record<UseKind, string> = {
  pasiva: 'Pasiva',
  reaccion: 'Reacción',
  accion: 'Acción adicional',
  batalla: 'Por batalla',
  descanso: 'Por descanso',
}

/** Las formas de uso que aparecen en un texto de uso. */
export function kindsOfUse(use: string): UseKind[] {
  const kinds: UseKind[] = []
  if (/pasiva/i.test(use)) kinds.push('pasiva')
  if (/reacci[oó]n/i.test(use)) kinds.push('reaccion')
  if (/acci[oó]n adicional/i.test(use)) kinds.push('accion')
  if (/batalla/i.test(use)) kinds.push('batalla')
  if (/descanso/i.test(use)) kinds.push('descanso')
  return kinds
}

export const tierIndex = (tier: DoteTier): number => DOTE_TIERS.indexOf(tier)

/** Sin tildes, en minúsculas, sin el "(E)" del tier al final y con los espacios en uno. */
export function normalizeDoteName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\((?:e|d|c|b|a|s)\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Busca en el catálogo la dote con ese nombre (sin importar tildes, mayúsculas ni el "(E)" final). Si hay
 * varias con el mismo nombre prefiere la del tipo indicado.
 */
export function matchDote(name: string, catalog: CatalogDote[], type?: DoteType): CatalogDote | null {
  const target = normalizeDoteName(name)
  if (target === '') return null
  const found = catalog.filter((d) => normalizeDoteName(d.name) === target)
  return found.find((d) => d.type === type) ?? found[0] ?? null
}

/** Por tipo (los 7 stats y después las únicas), por tier y por nombre. */
export function sortDotes(list: CatalogDote[]): CatalogDote[] {
  return [...list].sort(
    (a, b) =>
      DOTE_TYPES.indexOf(a.type) - DOTE_TYPES.indexOf(b.type) ||
      tierIndex(a.tier) - tierIndex(b.tier) ||
      a.name.localeCompare(b.name, 'es'),
  )
}

export interface DoteFilter {
  query?: string
  type?: DoteType | 'todos'
  tier?: DoteTier | 'todos'
  kind?: UseKind | 'todos'
  /** Un personaje (por su id), "nadie" para las que no tiene ninguno, o "todos". */
  owner?: string
}

/** Filtra por texto (nombre, uso y descripción), tipo, tier, forma de uso y quién la tiene. */
export function filterDotes(
  list: CatalogDote[],
  filter: DoteFilter,
  owners: Map<string, DoteOwner[]> = new Map(),
): CatalogDote[] {
  const query = normalizeDoteName(filter.query ?? '')
  const text = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return list.filter((d) => {
    if (filter.type && filter.type !== 'todos' && d.type !== filter.type) return false
    if (filter.tier && filter.tier !== 'todos' && d.tier !== filter.tier) return false
    if (filter.kind && filter.kind !== 'todos' && !kindsOfUse(d.use).includes(filter.kind)) return false
    if (filter.owner && filter.owner !== 'todos') {
      const has = owners.get(d.id) ?? []
      if (filter.owner === 'nadie' ? has.length > 0 : !has.some((o) => o.characterId === filter.owner)) return false
    }
    if (query === '') return true
    const raw = text(filter.query ?? '').trim()
    return [d.name, d.use, d.description].some((field) => text(field).includes(raw))
  })
}

/** Errores de una dote antes de guardarla. Vacío si está bien. */
export function validateDote(dote: NewDote): string[] {
  const errors: string[] = []
  if (dote.name.trim() === '') errors.push('La dote necesita un nombre.')
  if (!DOTE_TIERS.includes(dote.tier)) errors.push('El tier debe ser E, D, C, B, A o S.')
  if (!DOTE_TYPES.includes(dote.type)) errors.push('El tipo debe ser uno de los 7 stats o "único".')
  return errors
}

export interface MergeResult {
  added: number
  updated: number
  unchanged: number
}

/**
 * Suma dotes a un catálogo. Una dote nueva se empareja con la que ya existe por tipo y nombre (sin tildes ni
 * mayúsculas): si cambió algo se actualiza y conserva su identidad, y si no, queda igual. Las que no existían
 * se agregan. Nunca se borra nada.
 */
export function mergeDotes(
  existing: CatalogDote[],
  incoming: NewDote[],
  now = new Date().toISOString(),
): { next: CatalogDote[]; result: MergeResult } {
  const key = (d: { type: DoteType; name: string }) => `${d.type}:${normalizeDoteName(d.name)}`
  const byKey = new Map(existing.map((d) => [key(d), d]))
  const result: MergeResult = { added: 0, updated: 0, unchanged: 0 }

  for (const dote of incoming) {
    const clean: NewDote = {
      tier: dote.tier,
      name: dote.name.trim(),
      type: dote.type,
      use: dote.use.trim(),
      description: dote.description.trim(),
    }
    const current = byKey.get(key(clean))
    if (!current) {
      byKey.set(key(clean), { ...clean, id: crypto.randomUUID(), createdAt: now, updatedAt: now })
      result.added++
    } else if (
      current.tier !== clean.tier ||
      current.use !== clean.use ||
      current.description !== clean.description ||
      current.name !== clean.name
    ) {
      byKey.set(key(clean), { ...current, ...clean, updatedAt: now })
      result.updated++
    } else {
      result.unchanged++
    }
  }
  return { next: [...byKey.values()], result }
}

/**
 * La escalera de tiers: cada dote que se consigue avanza un paso sin importar la rama, E → D → C → B → A → S y
 * vuelta a E. Dice qué tier le toca a quien ya tiene `count` dotes.
 */
export function ladderTier(count: number): DoteTier {
  return DOTE_TIERS[((count % DOTE_TIERS.length) + DOTE_TIERS.length) % DOTE_TIERS.length]
}

/** Se puede elegir una dote del tier que toca o de cualquiera más bajo (y elegir más bajo no frena la escalera). */
export function allowedTiers(count: number): DoteTier[] {
  return DOTE_TIERS.slice(0, tierIndex(ladderTier(count)) + 1)
}

/** El tipo de dote que da una rama del árbol: la de su stat, o las únicas en Categoría. Héroe no da dotes. */
export function doteTypeOfBranch(branch: BranchId | string): DoteType | null {
  if (branch === 'heroe') return null
  return branch === 'categoria' ? 'unico' : (branch as DoteType)
}

/** El tipo de dote a partir del id de un nodo del árbol ("fuerza:1:4"). */
export function doteTypeOfNode(nodeId: string): DoteType | null {
  return doteTypeOfBranch(nodeId.split(':')[0])
}

// ───────────────────────── Orden

/** Cómo se ordena una lista de dotes del catálogo. */
export type DoteSort = 'tipo' | 'tier-asc' | 'tier-desc' | 'nombre' | 'uso'

export const DOTE_SORT_LABELS: Record<DoteSort, string> = {
  tipo: 'Por stat y tier',
  'tier-asc': 'Por tier (de E a S)',
  'tier-desc': 'Por tier (de S a E)',
  nombre: 'Por nombre (de A a Z)',
  uso: 'Por forma de uso',
}

const KIND_ORDER: readonly UseKind[] = ['pasiva', 'reaccion', 'accion', 'batalla', 'descanso']

/** La forma de uso principal: la primera que aparece en el texto del uso, o al final si no tiene ninguna. */
const kindRank = (use: string): number => {
  const kinds = kindsOfUse(use)
  return kinds.length === 0 ? KIND_ORDER.length : Math.min(...kinds.map((k) => KIND_ORDER.indexOf(k)))
}

const byName = (a: CatalogDote, b: CatalogDote) => a.name.localeCompare(b.name, 'es')
const byType = (a: CatalogDote, b: CatalogDote) => DOTE_TYPES.indexOf(a.type) - DOTE_TYPES.indexOf(b.type)
const byTier = (a: CatalogDote, b: CatalogDote) => tierIndex(a.tier) - tierIndex(b.tier)

/** Ordena una lista de dotes. Cuando hay empate, desempata por tipo, tier y nombre. */
export function sortDotesBy(list: CatalogDote[], sort: DoteSort): CatalogDote[] {
  const compare: Record<DoteSort, (a: CatalogDote, b: CatalogDote) => number> = {
    tipo: (a, b) => byType(a, b) || byTier(a, b) || byName(a, b),
    'tier-asc': (a, b) => byTier(a, b) || byType(a, b) || byName(a, b),
    'tier-desc': (a, b) => byTier(b, a) || byType(a, b) || byName(a, b),
    nombre: (a, b) => byName(a, b) || byType(a, b) || byTier(a, b),
    uso: (a, b) => kindRank(a.use) - kindRank(b.use) || byTier(a, b) || byType(a, b) || byName(a, b),
  }
  return [...list].sort(compare[sort])
}

// ───────────────────────── Quién tiene cada dote

/** Un jugador que tiene una dote. */
export interface DoteOwner {
  characterId: string
  name: string
  playerName: string
}

/** Una dote que tiene un personaje, junto con la del catálogo a la que corresponde (si se la encuentra). */
export interface OwnedDote {
  owned: Dote
  catalog: CatalogDote | null
}

/**
 * A qué dote del catálogo corresponde una dote de un personaje: la que tiene vinculada o, si se escribió a mano,
 * la que se llama igual (sin importar tildes, mayúsculas ni el "(E)") y es del tipo de su rama.
 */
export function resolveOwned(owned: Dote, catalog: CatalogDote[]): CatalogDote | null {
  if (owned.catalogId) {
    const linked = catalog.find((d) => d.id === owned.catalogId)
    if (linked) return linked
  }
  return matchDote(owned.name, catalog, doteTypeOfNode(owned.nodeId) ?? undefined)
}

/** Las dotes de un personaje, cada una con su dote del catálogo. */
export function ownedDotes(character: Pick<Character, 'tree'>, catalog: CatalogDote[]): OwnedDote[] {
  return (character.tree?.dotes ?? []).map((owned) => ({ owned, catalog: resolveOwned(owned, catalog) }))
}

/** Para cada dote del catálogo, qué personajes la tienen. */
export function doteOwners(
  catalog: CatalogDote[],
  characters: Pick<Character, 'id' | 'name' | 'playerName' | 'tree'>[],
): Map<string, DoteOwner[]> {
  const owners = new Map<string, DoteOwner[]>()
  for (const c of characters) {
    for (const { catalog: found } of ownedDotes(c, catalog)) {
      if (!found) continue
      const list = owners.get(found.id) ?? []
      if (!list.some((o) => o.characterId === c.id)) list.push({ characterId: c.id, name: c.name, playerName: c.playerName })
      owners.set(found.id, list)
    }
  }
  return owners
}

/** Cómo se ordenan las dotes de un personaje. */
export type OwnedSort = 'tipo' | 'tier' | 'nombre' | 'compra'

export const OWNED_SORT_LABELS: Record<OwnedSort, string> = {
  tipo: 'Por stat y tier',
  tier: 'Por tier (de E a S)',
  nombre: 'Por nombre (de A a Z)',
  compra: 'En el orden en que las compró',
}

/** El tipo de una dote de un personaje: el del catálogo o, si no está, el de la rama donde la compró. */
export const ownedType = (o: OwnedDote): DoteType | null => o.catalog?.type ?? doteTypeOfNode(o.owned.nodeId)

/** Ordena las dotes de un personaje. Las que no están en el catálogo (sin tier) van al final de su grupo. */
export function sortOwned(list: OwnedDote[], sort: OwnedSort): OwnedDote[] {
  if (sort === 'compra') return [...list]
  const typeIdx = (o: OwnedDote) => {
    const t = ownedType(o)
    return t === null ? DOTE_TYPES.length : DOTE_TYPES.indexOf(t)
  }
  const tier = (o: OwnedDote) => (o.catalog ? tierIndex(o.catalog.tier) : DOTE_TIERS.length)
  const name = (o: OwnedDote) => o.catalog?.name ?? o.owned.name
  const compare: Record<Exclude<OwnedSort, 'compra'>, (a: OwnedDote, b: OwnedDote) => number> = {
    tipo: (a, b) => typeIdx(a) - typeIdx(b) || tier(a) - tier(b) || name(a).localeCompare(name(b), 'es'),
    tier: (a, b) => tier(a) - tier(b) || typeIdx(a) - typeIdx(b) || name(a).localeCompare(name(b), 'es'),
    nombre: (a, b) => name(a).localeCompare(name(b), 'es') || tier(a) - tier(b),
  }
  return [...list].sort(compare[sort])
}

// ───────────────────────── Espacios de dote del árbol

/** De dónde sale una dote del árbol: rama, etapa y nodo (de 1 a 10). */
export interface SlotPlace {
  branch: BranchId
  stage: number
  /** Posición dentro de la etapa, de 1 a 10. */
  node: number
}

/** La rama, etapa y nodo de un id de nodo ("fuerza:1:4" es Fuerza, etapa 1, nodo 5). */
export function slotPlace(nodeId: string): SlotPlace | null {
  const [branch, stage, index] = nodeId.split(':')
  if (!BRANCHES.includes(branch as BranchId)) return null
  const st = Number(stage)
  const idx = Number(index)
  return Number.isInteger(st) && Number.isInteger(idx) ? { branch: branch as BranchId, stage: st, node: idx + 1 } : null
}

/** Las dotes de un personaje en el orden del árbol: por rama, etapa y nodo (las que no se reconocen, al final). */
export function sortBySlot(dotes: Dote[]): Dote[] {
  const key = (d: Dote): number[] => {
    const place = slotPlace(d.nodeId)
    return place ? [BRANCHES.indexOf(place.branch), place.stage, place.node] : [BRANCHES.length, 0, 0]
  }
  return [...dotes].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
  })
}

/** Un espacio de dote todavía sin elegir: no tiene una del catálogo ni nada escrito. */
export const isFreeSlot = (d: Dote): boolean => !d.catalogId && d.name.trim() === ''
