import { THRESHOLDS } from './hit'
import type { RankGroup } from './ranks'
import type { Duration, Effect } from './effects'

/** Límite de buffs base de un grupo de rango (el tope de la banda Mayor+): 200, 300, 400, 700 o 1000. */
export const baseLimit = (group: RankGroup): number => THRESHOLDS[group].mayorPlus

export interface LimitRaiseFields {
  name: string
  /** Origen del aumento: el tipo (habilidad, estado, transformación, buff...). */
  typeId: string
  /** Puntos fijos que suma al límite. */
  flat: number
  /** Porcentaje del límite base del rango que suma. */
  percent: number
  duration: Duration
}

/**
 * Un aumento del límite de los buffs, como efecto: tiene origen (tipo), valor y duración como un buff,
 * así que sigue sus mismas reglas (el más fuerte de cada origen, máximo 4, "terminó la habilidad").
 */
export function limitRaiseEffect(fields: LimitRaiseFields, combatId: string | null, group?: string): Effect {
  return {
    id: crypto.randomUUID(),
    kind: 'buff',
    name: fields.name,
    typeId: fields.typeId,
    target: 'limite',
    flat: fields.flat,
    percent: fields.percent,
    duration: fields.duration,
    combatId,
    createdAt: new Date().toISOString(),
    group,
  }
}
