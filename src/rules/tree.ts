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
  /** Puntos de stat del nodo (el valor "crudo", antes de repartirlo entre los stats). */
  points: number
  /** Lo que suma a cada stat en la fuente de la rama (Árbol Héroe, Héroe o Categoría). */
  perStat: Partial<Record<StatName, number>>
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

/**
 * Cuánto del valor de Categoría recibe un stat: el principal 100 %, el secundario 75 % y el
 * terciario 50 %. Un súper primario recibe 125 % y un súper terciario 25 %.
 */
export function categoryShare(
  character: Pick<Character, 'tiers' | 'superStats'>,
  stat: StatName,
): number {
  const special = character.superStats?.[stat]
  if (special === 'primario') return 1.25
  if (special === 'terciario') return 0.25
  const tier = character.tiers[stat]
  return tier === 1 ? 1 : tier === 2 ? 0.75 : 0.5
}

/** Lo que suma elegir esa opción en ese nodo. */
export function appliedFor(
  character: Pick<Character, 'energy' | 'tiers' | 'superStats'>,
  node: NodeDef,
  choice: Choice,
): Applied {
  const none: Applied = { points: 0, perStat: {}, mana: 0, stamina: 0, mh: 0 }
  if (!node.options.includes(choice)) throw new Error('Esa opción no existe en este nodo.')
  if (choice === 'stat') {
    const perStat: Partial<Record<StatName, number>> = {}
    if (node.branch === 'heroe') for (const s of STAT_NAMES) perStat[s] = node.points
    else if (node.branch === 'categoria') for (const s of STAT_NAMES) perStat[s] = node.points * categoryShare(character, s)
    else perStat[node.branch] = node.points
    return { ...none, points: node.points, perStat }
  }
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
  /** Dote o habilidad sin comprar cuando ya se compraron nodos que están más abajo. */
  pending: boolean
}

/** Los nodos de "Dote o Hab" se pueden dejar para después: no frenan a los de abajo. */
export function isDeferrable(node: NodeDef): boolean {
  return node.options.includes('dote') && node.options.includes('hab')
}

/**
 * Estado de cada nodo de una rama. Los nodos se compran de arriba hacia abajo, sin saltear,
 * salvo los de "Dote o Hab", que el jugador puede dejar para después. Una etapa nueva pide la
 * compuerta abierta. El saldo de BP no bloquea el nodo: se avisa al comprarlo.
 */
export function branchState(tree: CharacterTree, branch: BranchId): NodeState[] {
  const bought = new Map(tree.purchases.map((p) => [p.nodeId, p]))
  const nodes = branchNodes(branch)
  const lastBought = nodes.reduce((last, n, i) => (bought.has(n.id) ? i : last), -1)

  let mainFound = false // ya apareció el primer nodo normal sin comprar
  return nodes.map((node, i) => {
    const purchase = bought.get(node.id) ?? null
    if (purchase) return { node, status: 'comprado', reason: '', purchase, pending: false }

    const gate =
      node.stage === 2 && !tree.gates.stage2
        ? `Compuerta cerrada: ${GATE_TEXT[2]}.`
        : node.stage === 3 && !tree.gates.stage3
          ? `Compuerta cerrada: ${GATE_TEXT[3]}.`
          : ''

    if (isDeferrable(node)) {
      // Se puede comprar cuando se llegó a él, y no frena a los de abajo.
      if (mainFound) return { node, status: 'bloqueado', reason: 'Antes hay que comprar los nodos de arriba.', purchase: null, pending: false }
      return {
        node,
        status: gate ? 'bloqueado' : 'disponible',
        reason: gate,
        purchase: null,
        pending: i < lastBought,
      }
    }

    if (mainFound) return { node, status: 'bloqueado', reason: 'Antes hay que comprar los nodos de arriba.', purchase: null, pending: false }
    mainFound = true
    return { node, status: gate ? 'bloqueado' : 'disponible', reason: gate, purchase: null, pending: false }
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

function applySources(
  character: Character,
  branch: BranchId,
  perStat: Partial<Record<StatName, number>>,
  sign: 1 | -1,
): Character {
  const field = branch === 'heroe' ? 'heroe' : branch === 'categoria' ? 'categoria' : 'arbolHeroe'
  const sources = { ...character.sources }
  for (const stat of STAT_NAMES) {
    const delta = perStat[stat]
    if (delta) sources[stat] = { ...sources[stat], [field]: sources[stat][field] + sign * delta }
  }
  return { ...character, sources }
}

function applyAll(character: Character, branch: BranchId, applied: Applied, sign: 1 | -1): Character {
  const withPoints = applySources(character, branch, applied.perStat, sign)
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
 * Compra un nodo con la opción elegida. Descuenta los BP, suma el stat, la energía o los MH a
 * donde corresponde, y anota la dote si la hay. La elección es permanente (el GM puede deshacer
 * la última compra de una rama para corregir un error).
 */
export function purchaseNode(
  character: Character,
  id: string,
  choice: Choice,
  options: PurchaseOptions = {},
): Character {
  const node = findNode(id)
  if (!node) throw new Error('Ese nodo no existe.')
  const tree = treeOf(character)
  const state = branchState(tree, node.branch).find((n) => n.node.id === id)
  if (!state) throw new Error('Ese nodo no existe.')
  if (state.status === 'comprado') throw new Error('Ese nodo ya está comprado.')
  if (state.status === 'bloqueado') throw new Error(state.reason)
  if (tree.bp < node.cost) throw new Error(`Faltan BP: el nodo cuesta ${node.cost} y hay ${tree.bp}.`)

  const applied = appliedFor(character, node, choice)
  const purchase: Purchase = {
    nodeId: node.id,
    branch: node.branch,
    stage: node.stage,
    index: node.index,
    cost: node.cost,
    choice,
    note: options.note?.trim() ?? '',
    applied,
    at: options.now ?? new Date().toISOString(),
  }
  const dotes: Dote[] =
    choice === 'dote'
      ? [
          ...tree.dotes,
          { id: node.id, name: purchase.note, description: options.description?.trim() ?? '', nodeId: node.id },
        ]
      : tree.dotes

  const updated = applyAll(character, node.branch, applied, 1)
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

/** Compra el primer nodo disponible de una rama. */
export function purchaseNext(
  character: Character,
  branch: BranchId,
  choice: Choice,
  options: PurchaseOptions = {},
): Character {
  const state = branchState(treeOf(character), branch)
  const next = state.find((n) => n.status !== 'comprado')
  if (!next) throw new Error('Esa rama ya está completa.')
  return purchaseNode(character, next.node.id, choice, options)
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
  heroe: Record<StatName, number>
  categoria: Record<StatName, number>
  mana: number
  stamina: number
  mh: number
  bp: number
} {
  const zero = () => Object.fromEntries(STAT_NAMES.map((s) => [s, 0])) as Record<StatName, number>
  const arbolHeroe = zero()
  const heroe = zero()
  const categoria = zero()
  let mana = 0
  let stamina = 0
  let mh = 0
  let bp = 0
  for (const p of tree.purchases) {
    const target = p.branch === 'heroe' ? heroe : p.branch === 'categoria' ? categoria : arbolHeroe
    for (const stat of STAT_NAMES) target[stat] += p.applied.perStat[stat] ?? 0
    mana += p.applied.mana
    stamina += p.applied.stamina
    mh += p.applied.mh
    bp += p.cost
  }
  return { arbolHeroe, heroe, categoria, mana, stamina, mh, bp }
}
