import type { AppDB } from './db'
import { DEFAULT_EFFECT_TYPES, DEFAULT_TECHNIQUE_TARGETS, SKILL_TYPE_ID, SPIRIT_TYPE_ID } from '../rules'
import type { EffectType, Techniques, TechniqueTarget } from '../rules'

const EFFECT_TYPES_KEY = 'effectTypes'
const REFERENCE_SHEETS_KEY = 'referenceSheets'
const TECHNIQUE_TARGETS_KEY = 'techniqueTargets'

/** Una hoja de referencia importada del Excel (por ejemplo los precios), solo para consultar. */
export interface ReferenceSheet {
  id: string
  title: string
  rows: string[][]
}

export function createSettingsRepository(db: AppDB) {
  return {
    /** Tipos de buff. Si nunca se editaron, los de fábrica. */
    async getEffectTypes(): Promise<EffectType[]> {
      const row = await db.settings.get(EFFECT_TYPES_KEY)
      if (!Array.isArray(row?.value)) return DEFAULT_EFFECT_TYPES
      const saved = row.value as EffectType[]
      // Los tipos guardados antes de que existiera Espíritu lo reciben al final, sin perder los editados.
      return saved.some((t) => t.id === SPIRIT_TYPE_ID)
        ? saved
        : [...saved, { id: SPIRIT_TYPE_ID, name: 'Espíritu' }]
    },

    /** A qué suma cada potenciación (Kyushu, Ki...). Lo no guardado usa el valor de fábrica. */
    async getTechniqueTargets(): Promise<Record<keyof Techniques, TechniqueTarget>> {
      const row = await db.settings.get(TECHNIQUE_TARGETS_KEY)
      const saved = (row?.value ?? {}) as Partial<Record<keyof Techniques, TechniqueTarget>>
      return { ...DEFAULT_TECHNIQUE_TARGETS, ...saved }
    },

    async saveTechniqueTargets(targets: Record<keyof Techniques, TechniqueTarget>): Promise<void> {
      await db.settings.put({ key: TECHNIQUE_TARGETS_KEY, value: targets })
    },

    /** Hojas de referencia importadas (precios, etc.). */
    async getReferenceSheets(): Promise<ReferenceSheet[]> {
      const row = await db.settings.get(REFERENCE_SHEETS_KEY)
      return Array.isArray(row?.value) ? (row.value as ReferenceSheet[]) : []
    },

    /** Guarda los tipos. El tipo "habilidad" no se puede quitar. */
    async saveEffectTypes(types: EffectType[]): Promise<void> {
      if (!types.some((t) => t.id === SKILL_TYPE_ID)) {
        throw new Error('El tipo "habilidad" no se puede quitar.')
      }
      if (!types.some((t) => t.id === SPIRIT_TYPE_ID)) {
        throw new Error('El tipo "Espíritu" no se puede quitar.')
      }
      if (types.some((t) => t.name.trim() === '')) throw new Error('Los tipos necesitan nombre.')
      await db.settings.put({ key: EFFECT_TYPES_KEY, value: types })
    },
  }
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>
