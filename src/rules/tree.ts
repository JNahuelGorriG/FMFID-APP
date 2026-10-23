import type { Character } from './character'
import { STAT_NAMES } from './types'
import type { StatName } from './types'

/** Las 9 ramas del árbol: los 7 stats, Héroe y Categoría. */
export type BranchId = StatName | 'heroe' | 'categoria'
export const BRANCHES: readonly BranchId[] = [...STAT_NAMES, 'heroe', 'categoria']

export type Stage = 1 | 2 | 3
export const STAGES: readonly Stage[] = [1, 2, 3]
export const NODES_PER_STAGE = 10

/** Qué se puede elegir en un nodo. */
export type Choice = 'stat' | 'energia' | 'mh' | 'dote' | 'hab'

type Pattern = 'stat' | 'energia25' | 'energia30' | 'mh' | 'especial'

/**
 * Los 10 nodos de cada etapa, en orden, con su costo en BP.
 * Dos bloques de 5: 2 Stat, 25 E o 2 P, 30 E o 3 P, 2 MH o 4 P, y dote o habilidad.
 */
const PATTERN: readonly Pattern[] = [
  'stat', 'energia25', 'energia30', 'mh', 'especial',
  'stat', 'energia25', 'energia30', 'mh', 'especial',
]

const COSTS: Record<Stage, readonly number[]> = {
  1: [1, 1, 1, 1, 1, 1, 1, 2, 2, 3],
  2: [1, 2, 2, 3, 4, 1, 2, 2, 3, 4],
  3: [2, 3, 3, 4, 5, 2, 3, 3, 4, 5],
}

/** Habilidades fijas de la rama Héroe en los nodos "especiales" (etapa, posición). Vacío = no hay nodo. */
const HEROE_SKILLS: Record<Stage, Record<number, string | null>> = {
  1: { 4: 'Analizar Armamento', 9: 'Mapa' },
  2: { 4: 'Análisis Heroico', 9: 'Conexión Mental 1' },
  3: { 4: null, 9: null },
}

export interface NodeDef {
  id: string
  branch: BranchId
  stage: Stage
  /** Posición dentro de la etapa, de 0 a 9. */
  index: number
  cost: number
  /** Opciones que se pueden elegir. */
  options: Choice[]
  /** Puntos de stat, energía y MH de cada opción. */
  points: number
  energy: number
  mh: number
  /** Nombre fijo (habilidades de Héroe). */
  label: string | null
}

export const nodeId = (branch: BranchId, stage: Stage, index: number): string => `${branch}:${stage}:${index}`

function buildNode(branch: BranchId, stage: Stage, index: number): NodeDef | null {
  const pattern = PATTERN[index]
  const base = { id: nodeId(branch, stage, index), branch, stage, index, cost: COSTS[stage][index], label: null }

  switch (pattern) {
    case 'stat':
      return { ...base, options: ['stat'], points: 2, energy: 0, mh: 0 }
    case 'energia25':
      return { ...base, options: ['energia', 'stat'], points: 2, energy: 25, mh: 0 }
    case 'energia30':
      return { ...base, options: ['energia', 'stat'], points: 3, energy: 30, mh: 0 }
    case 'mh':
      return { ...base, options: ['mh', 'stat'], points: 4, energy: 0, mh: 2 }
    case 'especial': {
      if (branch === 'heroe') {
        const label = HEROE_SKILLS[stage][index]
        return label === null || label === undefined
          ? null
          : { ...base, options: ['hab'], points: 0, energy: 0, mh: 0, label }
      }
      if (branch === 'categoria') return { ...base, options: ['dote'], points: 0, energy: 0, mh: 0, label: 'Dote único' }
      return { ...base, options: ['dote', 'hab'], points: 0, energy: 0, mh: 0 }
    }
  }
}

/** Todos los nodos de una rama, en el orden en que se compran. Los huecos (sin nodo) no aparecen. */
export function branchNodes(branch: BranchId): NodeDef[] {
  const nodes: NodeDef[] = []
  for (const stage of STAGES) {
    for (let index = 0; index < NODES_PER_STAGE; index++) {
      const node = buildNode(branch, stage, index)
      if (node) nodes.push(node)
    }
  }
  return nodes
}

export function findNode(id: string): NodeDef | undefined {
  const [branch, stage, index] = id.split(':')
  if (!BRANCHES.includes(branch as BranchId)) return undefined
  return buildNode(branch as BranchId, Number(stage) as Stage, Number(index))  ?? undefined
}

/** Compuerta que hay que abrir para empezar una etapa. */
export const GATE_TEXT: Record<2 | 3, string> = {
  2: 'Completar 4 ramas y hablar personalmente con un dios',
  3: 'Completar 2 ramas de stat primario y Héroe, y hablar personalmente con un dios',
}

/** Energía que da un nodo, repartida entre maná y estamina según la rama. */
export type OrientationKind = 'fisica' | 'magica' | 'neutra'

/** La orientación sale de las bases: más estamina que maná es física, y al revés. */
export function orientation(character: Pick<Character, 'energy'>): OrientationKind {
  const { baseMana, baseStamina } = character.energy
  if (baseStamina > baseMana) return 'fisica'
  if (baseMana > baseStamina) return 'magica'
  return 'neutra'
}

export interface EnergySplit {
  mana: number
  stamina: number
}

const PHYSICAL: StatName[] = ['fuerza', 'destreza', 'constitucion']
const MAGICAL: StatName[] = ['carisma', 'sabiduria', 'inteligencia']

/**
 * Reparto de la energía de un nodo:
 * - Fuerza, Destreza y Constitución: estamina. Carisma, Sabiduría e Inteligencia: maná.
 * - Percepción: mitad y mitad.
 * - Héroe: el mismo valor a las dos.
 * - Categoría: 2/3 a la orientación del personaje y 1/3 a la otra.
 */
export function energySplit(branch: BranchId, amount: number, kind: OrientationKind): EnergySplit {
  if (PHYSICAL.includes(branch as StatName)) return { mana: 0, stamina: amount }
  if (MAGICAL.includes(branch as StatName)) return { mana: amount, stamina: 0 }
  if (branch === 'percepcion') return { mana: amount / 2, stamina: amount / 2 }
  if (branch === 'heroe') return { mana: amount, stamina: amount }
  const main = (amount * 2) / 3
  const other = amount / 3
  if (kind === 'fisica') return { mana: other, stamina: main }
  if (kind === 'magica') return { mana: main, stamina: other }
  return { mana: amount / 2, stamina: amount / 2 }
}

/** Lo que una compra suma, guardado para poder deshacerla. */
export interface Applied {
  /** Puntos de stat de la rama (a cada stat si la rama es Héroe o Categoría). */
  points: number
  mana: number
  stamina: number
  mh: number
}

export interface Purchase {
  nodeId: string
  branch: BranchId
  stage: Stage
  index: number
  cost: number
  choice: Choice
  /** Nombre o descripción corta de la dote o habilidad (puede quedar vacío). */
  note: string
  applied: Applied
  /** ISO 8601. */
  at: string
}

export interface Dote {
  id: string
  name: string
  description: string
  nodeId: string
}

export interface CharacterTree {
  /** BP disponibles. */
  bp: number
  /** Mejoras de habilidad disponibles. */
  mh: number
  /** Compuertas abiertas por el GM para empezar la 2.ª y la 3.ª etapa. */
  gates: { stage2: boolean; stage3: boolean }
  purchases: Purchase[]
  dotes: Dote[]
}

export function emptyTree(): CharacterTree {
  return { bp: 0, mh: 0, gates: { stage2: false, stage3: false }, purchases: [], dotes: [] }
}

export function treeOf(character: Pick<Character, 'tree'>): CharacterTree {
  return character.tree ?? emptyTree()
}

/** Lo que suma elegir esa opción en ese nodo. */
export function appliedFor(
  character: Pick<Character, 'energy'>,
  node: NodeDef,
  choice: Choice,
): Applied {
  const none: Applied = { points: 0, mana: 0, stamina: 0, mh: 0 }
  if (!node.options.includes(choice)) throw new Error('Esa opción no existe en este nodo.')
  if (choice === 'stat') return { ...none, points: node.points }
  if (choice === 'mh') return { ...none, mh: node.mh }
  if (choice === 'energia') {
    const split = energySplit(node.branch, node.energy, orientation(character))
    return { ...none, mana: split.mana, stamina: split.stamina }
  }
  return none
}

export type NodeStatus = 'comprado' | 'disponible' | 'bloqueado'

export interface NodeState {
  node: NodeDef
  status: NodeStatus
  /** Por qué está bloqueado. */
  reason: string
  purchase: Purchase | null
}

/**
 * Estado de cada nodo de una rama. Se compran de arriba hacia abajo, sin saltear. Una etapa
 * nueva pide la compuerta abierta. El saldo de BP no bloquea el nodo: se avisa al comprarlo.
 */
export function branchState(tree: CharacterTree, branch: BranchId): NodeState[] {
  const bought = new Map(tree.purchases.map((p) => [p.nodeId, p]))
  let nextFound = false

  return branchNodes(branch).map((node) => {
    const purchase = bought.get(node.id) ?? null
    if (purchase) return { node, status: 'comprado', reason: '', purchase }

    if (nextFound) return { node, status: 'bloqueado', reason: 'Antes hay que comprar los nodos de arriba.', purchase: null }
    nextFound = true

    if (node.stage === 2 && !tree.gates.stage2) {
      return { node, status: 'bloqueado', reason: `Compuerta cerrada: ${GATE_TEXT[2]}.`, purchase: null }
    }
    if (node.stage === 3 && !tree.gates.stage3) {
      return { node, status: 'bloqueado', reason: `Compuerta cerrada: ${GATE_TEXT[3]}.`, purchase: null }
    }
    return { node, status: 'disponible', reason: '', purchase: null }
  })
}

/** Ramas con las 3 etapas completas. */
export function completedBranches(tree: CharacterTree): BranchId[] {
  return BRANCHES.filter((b) => branchState(tree, b).every((n) => n.status === 'comprado'))
}

/** Ramas con las etapas 1 y 2 completas, o solo la 1. Sirve para ver cuánto falta para una compuerta. */
export function branchesWithStagesDone(tree: CharacterTree, upTo: Stage): BranchId[] {
  return BRANCHES.filter((b) =>
    branchState(tree, b)
      .filter((n) => n.node.stage <= upTo)
      .every((n) => n.status === 'comprado'),
  )
}

function applySources(character: Character, branch: BranchId, points: number, sign: 1 | -1): Character {
  if (points === 0) return character
  const sources = { ...character.sources }
  const field = branch === 'heroe' ? 'heroe' : branch === 'categoria' ? 'categoria' : 'arbolHeroe'
  const targets: StatName[] = branch === 'heroe' || branch === 'categoria' ? [...STAT_NAMES] : [branch]
  for (const stat of targets) {
    sources[stat] = { ...sources[stat], [field]: sources[stat][field] + sign * points }
  }
  return { ...character, sources }
}

function applyAll(character: Character, branch: BranchId, applied: Applied, sign: 1 | -1): Character {
  const withPoints = applySources(character, branch, applied.points, sign)
  return {
    ...withPoints,
    energy: {
      ...withPoints.energy,
      bonusMana: withPoints.energy.bonusMana + sign * applied.mana,
      bonusStamina: withPoints.energy.bonusStamina + sign * applied.stamina,
    },
  }
}

export interface PurchaseOptions {
  /** Nombre de la dote o habilidad elegida (opcional). */
  note?: string
  /** Descripción de la dote (opcional). */
  description?: string
  now?: string
}

/**
 * Compra el siguiente nodo de una rama con la opción elegida. Descuenta los BP, suma el stat,
 * la energía o los MH a donde corresponde, y anota la dote si la hay. La elección es permanente
 * (el GM puede deshacer la última compra para corregir un error).
 */
export function purchaseNext(
  character: Character,
  branch: BranchId,
  choice: Choice,
  options: PurchaseOptions = {},
): Character {
  const tree = treeOf(character)
  const next = branchState(tree, branch).find((n) => n.status !== 'comprado')
  if (!next) throw new Error('Esa rama ya está completa.')
  if (next.status === 'bloqueado') throw new Error(next.reason)

  const node = next.node
  if (tree.bp < node.cost) {
    throw new Error(`Faltan BP: el nodo cuesta ${node.cost} y hay ${tree.bp}.`)
  }
  const applied = appliedFor(character, node, choice)
  const at = options.now ?? new Date().toISOString()
  const purchase: Purchase = {
    nodeId: node.id,
    branch,
    stage: node.stage,
    index: node.index,
    cost: node.cost,
    choice,
    note: options.note?.trim() ?? '',
    applied,
    at,
  }
  const dotes: Dote[] =
    choice === 'dote'
      ? [
          ...tree.dotes,
          { id: `${node.id}`, name: options.note?.trim() ?? '', description: options.description?.trim() ?? '', nodeId: node.id },
        ]
      : tree.dotes

  const updated = applyAll(character, branch, applied, 1)
  return {
    ...updated,
    tree: {
      ...tree,
      bp: tree.bp - node.cost,
      mh: tree.mh + applied.mh,
      purchases: [...tree.purchases, purchase],
      dotes,
    },
  }
}

/** Deshace la última compra de una rama (corrección del GM): devuelve los BP y resta lo que sumó. */
export function undoLastPurchase(character: Character, branch: BranchId): Character {
  const tree = treeOf(character)
  const last = [...tree.purchases].reverse().find((p) => p.branch === branch)
  if (!last) throw new Error('No hay compras en esa rama.')
  const updated = applyAll(character, branch, last.applied, -1)
  return {
    ...updated,
    tree: {
      ...tree,
      bp: tree.bp + last.cost,
      mh: tree.mh - last.applied.mh,
      purchases: tree.purchases.filter((p) => p.nodeId !== last.nodeId),
      dotes: tree.dotes.filter((d) => d.nodeId !== last.nodeId),
    },
  }
}

/** Suma lo aplicado por las compras de cada fuente, para comparar con los valores del personaje. */
export function appliedTotals(tree: CharacterTree): {
  arbolHeroe: Record<StatName, number>
  heroe: number
  categoria: number
  mana: number
  stamina: number
  mh: number
  bp: number
} {
  const arbolHeroe = Object.fromEntries(STAT_NAMES.map((s) => [s, 0])) as Record<StatName, number>
  let heroe = 0
  let categoria = 0
  let mana = 0
  let stamina = 0
  let mh = 0
  let bp = 0
  for (const p of tree.purchases) {
    if (p.branch === 'heroe') heroe += p.applied.points
    else if (p.branch === 'categoria') categoria += p.applied.points
    else arbolHeroe[p.branch] += p.applied.points
    mana += p.applied.mana
    stamina += p.applied.stamina
    mh += p.applied.mh
    bp += p.cost
  }
  return { arbolHeroe, heroe, categoria, mana, stamina, mh, bp }
}
