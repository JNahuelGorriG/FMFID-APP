import type { Character } from './character'
import { STAT_NAMES } from './types'
import type { StatName } from './types'

/**
 * El entrenamiento de cada stat se divide en **permanente** (no se pierde) y **temporal** (se puede perder).
 * Los dos son fuentes planas: suman al stat sin multiplicador.
 */
export interface Training {
  permanent: number
  temporary: number
}

export const trainingOf = (character: Pick<Character, 'sources'>, stat: StatName): Training => ({
  permanent: character.sources[stat].entrenamiento,
  temporary: character.sources[stat].entrenamientoTemp ?? 0,
})

/** El entrenamiento permanente y temporal sumado en los 7 stats. */
export function trainingTotals(character: Pick<Character, 'sources'>): Training {
  return STAT_NAMES.reduce<Training>(
    (sum, s) => {
      const t = trainingOf(character, s)
      return { permanent: sum.permanent + t.permanent, temporary: sum.temporary + t.temporary }
    },
    { permanent: 0, temporary: 0 },
  )
}

/**
 * Cómo se pierden los puntos temporales: la **mitad** (la primera mitad: si es impar se pierde la menor y queda la
 * mayor) o **todo** lo que quede.
 */
export type TrainingLoss = 'mitad' | 'todo'

/** Cuántos puntos temporales se pierden de los que hay. */
export function lostPoints(temporary: number, loss: TrainingLoss): number {
  const points = Math.max(0, temporary)
  return loss === 'todo' ? points : Math.floor(points / 2)
}

export interface TrainingLossPreview {
  stat: StatName
  before: number
  after: number
}

/** Qué stats cambiarían y cómo: solo los que tienen puntos temporales para perder. */
export function previewTrainingLoss(character: Pick<Character, 'sources'>, loss: TrainingLoss): TrainingLossPreview[] {
  return STAT_NAMES.flatMap((stat) => {
    const before = trainingOf(character, stat).temporary
    const after = before - lostPoints(before, loss)
    return after === before ? [] : [{ stat, before, after }]
  })
}

/** El personaje después de perder puntos de entrenamiento temporales en los 7 stats. El permanente no se toca. */
export function loseTemporaryTraining(character: Character, loss: TrainingLoss): Character {
  const sources = { ...character.sources }
  for (const { stat, after } of previewTrainingLoss(character, loss)) {
    sources[stat] = { ...sources[stat], entrenamientoTemp: after }
  }
  return { ...character, sources }
}

/** Cambia el entrenamiento permanente y/o temporal de algunos stats. Lo que no cambia queda exactamente igual. */
export function setTraining(character: Character, values: Partial<Record<StatName, Partial<Training>>>): Character {
  const sources = { ...character.sources }
  for (const stat of STAT_NAMES) {
    const wanted = values[stat]
    if (!wanted) continue
    const current = trainingOf(character, stat)
    const next = { ...sources[stat] }
    if (wanted.permanent !== undefined && wanted.permanent !== current.permanent) next.entrenamiento = wanted.permanent
    if (wanted.temporary !== undefined && wanted.temporary !== current.temporary) next.entrenamientoTemp = wanted.temporary
    sources[stat] = next
  }
  return { ...character, sources }
}
