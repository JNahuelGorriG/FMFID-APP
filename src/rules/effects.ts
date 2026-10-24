import { STAT_NAMES } from './types'
import type { StatName } from './types'

/** Lo que puede modificar un buff o debuff: los 7 stats y cuatro derivados. */
export type EffectTarget = StatName | 'ataque' | 'magia' | 'defensaFisica' | 'defensaMagica'

export const EFFECT_TARGETS: readonly EffectTarget[] = [
  ...STAT_NAMES,
  'ataque',
  'magia',
  'defensaFisica',
  'defensaMagica',
]

/** Máximo de buffs (y de debuffs) activos sobre un mismo stat. */
export const EFFECT_LIMIT = 4

/** Id del tipo "habilidad", que tiene reglas especiales. */
export const SKILL_TYPE_ID = 'habilidad'

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
  /** Un efecto desplazado por una habilidad vuelve cuando esta termina. */
  suspendedForSkill?: boolean
}

/** Valor natural de cada objetivo: sobre él se calculan los porcentajes. */
export type EffectBases = Record<EffectTarget, number>

export function effectAmount(effect: Effect, base: number): number {
  return effect.flat + (base * effect.percent) / 100
}

export type EffectState = 'activo' | 'pisado' | 'suspendido'

export interface ResolvedEffect {
  effect: Effect
  amount: number
  state: EffectState
}

/**
 * Decide qué efectos cuentan. Se evalúa por clase (buff o debuff) y por objetivo:
 * 1. De cada tipo gana el más fuerte (en empate, el más nuevo). Los demás quedan "pisados"
 *    y vuelven si el ganador termina.
 * 2. Los efectos desplazados por una habilidad quedan "suspendidos" mientras haya una
 *    habilidad activa sobre ese mismo objetivo.
 */
export function resolveEffects(effects: Effect[], bases: EffectBases): ResolvedEffect[] {
  const amounts = new Map(effects.map((e) => [e.id, effectAmount(e, bases[e.target])]))
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
        (amounts.get(e.id) ?? 0) > (amounts.get(best.id) ?? 0) ||
        ((amounts.get(e.id) ?? 0) === (amounts.get(best.id) ?? 0) && e.createdAt >= best.createdAt)
      if (wins) winners.set(e.typeId, e)
    }
    const winnerIds = new Set([...winners.values()].map((w) => w.id))
    const skillActive = [...winners.values()].some((w) => w.typeId === SKILL_TYPE_ID)

    for (const e of group) {
      if (!winnerIds.has(e.id)) state.set(e.id, 'pisado')
      else if (e.suspendedForSkill && skillActive) state.set(e.id, 'suspendido')
      else state.set(e.id, 'activo')
    }
  }

  return effects.map((effect) => ({
    effect,
    amount: amounts.get(effect.id) ?? 0,
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

export type AddResult =
  | { status: 'added'; effects: Effect[] }
  /** Ya hay 4 activos sobre ese objetivo: hay que elegir cuál sacar (o suspender). */
  | { status: 'limit'; occupants: Effect[] }

/** Efectos de una clase y objetivo que ocupan un lugar (activos). */
export function activeOccupants(
  effects: Effect[],
  kind: EffectKind,
  target: EffectTarget,
  bases: EffectBases,
): Effect[] {
  return resolveEffects(effects, bases)
    .filter((r) => r.effect.kind === kind && r.effect.target === target && r.state === 'activo')
    .map((r) => r.effect)
}

/** Agrega un efecto, o avisa que hay que elegir cuál reemplazar si superaría el límite. */
export function addEffect(effects: Effect[], effect: Effect, bases: EffectBases): AddResult {
  const next = [...effects, effect]
  const occupants = activeOccupants(next, effect.kind, effect.target, bases)
  if (occupants.length <= EFFECT_LIMIT) return { status: 'added', effects: next }
  return { status: 'limit', occupants: occupants.filter((e) => e.id !== effect.id) }
}

export interface BatchResult {
  /** Efectos después de agregar los que entraron. */
  effects: Effect[]
  /** El primero que no entró porque ya hay 4 activos sobre su stat, con los que quedaron por procesar. */
  blocked: { effect: Effect; occupants: Effect[]; rest: Effect[] } | null
}

/**
 * Agrega varios efectos de una vez (el mismo buff o debuff sobre varios stats). Cada uno cumple las
 * reglas de siempre. Se detiene en el primero que pasaría el límite de 4 y lo devuelve para que el GM
 * elija cuál sale, junto con los que faltan por agregar.
 */
export function addEffects(effects: Effect[], list: Effect[], bases: EffectBases): BatchResult {
  let current = effects
  for (let i = 0; i < list.length; i++) {
    const result = addEffect(current, list[i], bases)
    if (result.status === 'added') current = result.effects
    else return { effects: current, blocked: { effect: list[i], occupants: result.occupants, rest: list.slice(i + 1) } }
  }
  return { effects: current, blocked: null }
}

export type LimitChoice = { action: 'remove' | 'suspend'; id: string }

/**
 * Agrega un efecto cuando se superaría el límite, según lo que elija el GM.
 * "Suspender" solo vale para efectos de tipo habilidad: el desplazado vuelve al terminar.
 */
export function addEffectWithChoice(
  effects: Effect[],
  effect: Effect,
  choice: LimitChoice,
): Effect[] {
  if (choice.action === 'suspend') {
    if (effect.typeId !== SKILL_TYPE_ID) {
      throw new Error('Solo un efecto de tipo habilidad puede suspender a otro.')
    }
    return [
      ...effects.map((e) => (e.id === choice.id ? { ...e, suspendedForSkill: true } : e)),
      effect,
    ]
  }
  return [...effects.filter((e) => e.id !== choice.id), effect]
}

/** Quita todos los efectos de tipo habilidad ("terminó la habilidad"). */
export function endSkill(effects: Effect[]): { effects: Effect[]; removed: Effect[] } {
  return {
    effects: effects.filter((e) => e.typeId !== SKILL_TYPE_ID),
    removed: effects.filter((e) => e.typeId === SKILL_TYPE_ID),
  }
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
]
