import type { BranchId } from './tree'
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
export function useKinds(use: string): UseKind[] {
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
}

/** Filtra por texto (nombre, uso y descripción), tipo, tier y forma de uso. */
export function filterDotes(list: CatalogDote[], filter: DoteFilter): CatalogDote[] {
  const query = normalizeDoteName(filter.query ?? '')
  const text = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return list.filter((d) => {
    if (filter.type && filter.type !== 'todos' && d.type !== filter.type) return false
    if (filter.tier && filter.tier !== 'todos' && d.tier !== filter.tier) return false
    if (filter.kind && filter.kind !== 'todos' && !useKinds(d.use).includes(filter.kind)) return false
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
