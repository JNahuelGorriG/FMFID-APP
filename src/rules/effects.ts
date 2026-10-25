import { STAT_NAMES } from './types'
import type { StatName } from './types'

/**
 * Lo que puede modificar un buff o debuff: los 7 stats, cuatro derivados y el límite de los buffs.
 * Un efecto sobre el límite lo sube (o lo baja) y se elige por separado de los stats.
 */
export type EffectTarget = StatName | 'ataque' | 'magia' | 'defensaFisica' | 'defensaMagica' | 'limite'

export const EFFECT_TARGETS: readonly EffectTarget[] = [
  ...STAT_NAMES,
  'ataque',
  'magia',
  'defensaFisica',
  'defensaMagica',
  'limite',
]

/** Los objetivos que se eligen como stats o derivados (el límite tiene su propio formulario). */
export const PICKABLE_TARGETS: readonly EffectTarget[] = EFFECT_TARGETS.filter((t) => t !== 'limite')

/** Máximo de buffs (y de debuffs) activos sobre un mismo stat. */
export const EFFECT_LIMIT = 4

/** Id del tipo "habilidad", que tiene reglas especiales. */
export const SKILL_TYPE_ID = 'habilidad'

/** Id del tipo "Espíritu": buff de 10 niveles a los 7 stats que no cuenta para el límite de buffs. */
export const SPIRIT_TYPE_ID = 'espiritu'

export type EffectKind = 'buff' | 'debuff'

/**
 * Cuándo termina: en N turnos del afectado, en N rondas, a mano (hasta curar)
 * o cuando termine la habilidad.
 */
export type DurationUnit = 'turnos' | 'rondas' | 'manual' | 'habilidad'

export interface Duration {
  unit: DurationUnit
  /** Solo cuenta para turnos y rondas. */
  remaining: number
}

export interface Effect {
  id: string
  kind: EffectKind
  name: string
  /** Tipo del buff (pasivo, poción, habilidad...). Los debuffs comparten los mismos tipos. */
  typeId: string
  target: EffectTarget
  /** Valor fijo (siempre positivo: el signo lo da `kind`). */
  flat: number
  /** Porcentaje del valor natural (siempre positivo). */
  percent: number
  duration: Duration
  /** Combate que hace correr su duración. null = solo se quita a mano. */
  combatId: string | null
  /** Para ordenar y desempatar. */
  createdAt: string
  /** Solo del tipo Espíritu: su nivel (1 a 10). */
  level?: number
  /** Obsoleto: antes un efecto desplazado por una habilidad quedaba suspendido. Hoy el límite de 4 se resuelve solo. */
  suspendedForSkill?: boolean
  /**
   * Los efectos que se crearon juntos (el mismo buff sobre varios stats) comparten grupo y se ven,
   * editan y quitan como uno solo. Sin grupo, el efecto es su propio grupo.
   */
  group?: string
}

/** Valor natural de cada objetivo: sobre él se calculan los porcentajes. */
export type EffectBases = Record<EffectTarget, number>

export function effectAmount(effect: Effect, base: number): number {
  return effect.flat + (base * effect.percent) / 100
}

/**
 * Activo: cuenta. Pisado: otro del mismo tipo es más fuerte. Sin lugar: ya hay 4 más fuertes o más
 * recientes sobre ese stat. Suspendido: solo en datos viejos.
 */
export type EffectState = 'activo' | 'pisado' | 'sin-lugar' | 'suspendido'

export interface ResolvedEffect {
  effect: Effect
  amount: number
  state: EffectState
}

/**
 * Decide qué efectos cuentan. Se evalúa por clase (buff o debuff) y por objetivo:
 * 1. De cada tipo gana el más fuerte (en empate, el más nuevo). Los demás quedan "pisados"
 *    y vuelven si el ganador termina.
 * 2. Sobre un mismo stat caben 4: se quedan los 4 más fuertes (en empate, los más recientes) y el
 *    resto queda listado como "sin lugar", sin efecto, hasta que se libere un lugar. Así una
 *    habilidad que entra de más desplaza al más débil solo mientras dure.
 */
export function resolveEffects(effects: Effect[], bases: EffectBases): ResolvedEffect[] {
  const amounts = new Map(effects.map((e) => [e.id, effectAmount(e, bases[e.target])]))
  const order = new Map(effects.map((e, i) => [e.id, i]))
  const amount = (e: Effect) => amounts.get(e.id) ?? 0
  const state = new Map<string, EffectState>()

  const groups = new Map<string, Effect[]>()
  for (const e of effects) {
    const key = `${e.kind}:${e.target}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }

  for (const group of groups.values()) {
    const winners = new Map<string, Effect>()
    for (const e of group) {
      const best = winners.get(e.typeId)
      const wins =
        best === undefined ||
        amount(e) > amount(best) ||
        (amount(e) === amount(best) && e.createdAt >= best.createdAt)
      if (wins) winners.set(e.typeId, e)
    }
    const winnerIds = new Set([...winners.values()].map((w) => w.id))
    const skillActive = [...winners.values()].some((w) => w.typeId === SKILL_TYPE_ID)

    const live: Effect[] = []
    for (const e of group) {
      if (!winnerIds.has(e.id)) state.set(e.id, 'pisado')
      else if (e.suspendedForSkill && skillActive) state.set(e.id, 'suspendido')
      else live.push(e)
    }

    // Caben EFFECT_LIMIT: los más fuertes y, en empate, los más recientes.
    const ranked = [...live].sort(
      (a, b) =>
        amount(b) - amount(a) ||
        b.createdAt.localeCompare(a.createdAt) ||
        (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0),
    )
    ranked.forEach((e, i) => state.set(e.id, i < EFFECT_LIMIT ? 'activo' : 'sin-lugar'))
  }

  return effects.map((effect) => ({
    effect,
    amount: amount(effect),
    state: state.get(effect.id) ?? 'activo',
  }))
}

/** Suma de los efectos activos por objetivo: buffs suman y debuffs restan. */
export function effectTotals(resolved: ResolvedEffect[]): Record<EffectTarget, number> {
  const totals = Object.fromEntries(EFFECT_TARGETS.map((t) => [t, 0])) as Record<EffectTarget, number>
  for (const r of resolved) {
    if (r.state !== 'activo') continue
    totals[r.effect.target] += r.effect.kind === 'buff' ? r.amount : -r.amount
  }
  return totals
}

/** Lo mismo que `effectTotals`, pero con los buffs y los debuffs por separado (ambos como valores positivos). */
export function effectTotalsSplit(resolved: ResolvedEffect[]): {
  buffs: Record<EffectTarget, number>
  debuffs: Record<EffectTarget, number>
} {
  const zero = () => Object.fromEntries(EFFECT_TARGETS.map((t) => [t, 0])) as Record<EffectTarget, number>
  const buffs = zero()
  const debuffs = zero()
  for (const r of resolved) {
    if (r.state !== 'activo') continue
    ;(r.effect.kind === 'buff' ? buffs : debuffs)[r.effect.target] += r.amount
  }
  return { buffs, debuffs }
}

/**
 * Agrega efectos (por ejemplo, el mismo buff sobre varios stats). Entran todos: si en algún stat ya
 * hay 4, `resolveEffects` deja activos a los 4 más fuertes y los demás quedan listados sin lugar.
 */
export function addEffects(effects: Effect[], list: Effect[]): Effect[] {
  return [...effects, ...list]
}

/**
 * Un efecto termina con la habilidad si es de tipo habilidad o si su duración es "hasta que termine
 * la habilidad", aunque sea de otro tipo.
 */
export function isSkillEffect(effect: Pick<Effect, 'typeId' | 'duration'>): boolean {
  return effect.typeId === SKILL_TYPE_ID || effect.duration.unit === 'habilidad'
}

/** Quita todos los efectos que terminan con la habilidad ("terminó la habilidad"). */
export function endSkill(effects: Effect[]): { effects: Effect[]; removed: Effect[] } {
  return {
    effects: effects.filter((e) => !isSkillEffect(e)),
    removed: effects.filter(isSkillEffect),
  }
}

/** Grupo de un efecto: el que comparte con los creados junto con él, o él mismo. */
export const effectGroup = (effect: Pick<Effect, 'id' | 'group'>): string => effect.group ?? effect.id

/** Agrupa los efectos por grupo, en el orden en que aparece el primero de cada uno. */
export function groupEffects<T extends { effect: Effect }>(items: T[]): { group: string; items: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = effectGroup(item.effect)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()].map(([group, list]) => ({ group, items: list }))
}

/** Quita todos los efectos de un grupo (el buff entero, en todos sus stats). */
export function removeGroup(effects: Effect[], group: string): Effect[] {
  return effects.filter((e) => effectGroup(e) !== group)
}

/** Reemplaza un grupo por una versión nueva (por ejemplo, cuando la habilidad sube de nivel). */
export function replaceGroup(effects: Effect[], group: string, list: Effect[]): Effect[] {
  return addEffects(
    removeGroup(effects, group),
    list.map((e) => ({ ...e, group })),
  )
}

export interface EffectType {
  id: string
  name: string
}

/** Tipos de buff iniciales. El GM puede renombrarlos, agregar y quitar (menos "habilidad"). */
export const DEFAULT_EFFECT_TYPES: EffectType[] = [
  { id: 'pasivo', name: 'Aumento pasivo' },
  { id: SKILL_TYPE_ID, name: 'Aumento por habilidad' },
  { id: 'potenciador', name: 'Aumento estilo potenciador (buff)' },
  { id: 'pocion', name: 'Aumento por poción' },
  { id: 'armamento', name: 'Aumento por armamento' },
  { id: 'transformacion', name: 'Aumento por transformación' },
  { id: 'estilo', name: 'Aumento por estilo' },
  { id: 'estado', name: 'Aumento por estado' },
  { id: SPIRIT_TYPE_ID, name: 'Espíritu' },
]
