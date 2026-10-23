import type { AppDB } from './db'
import { DEFAULT_EFFECT_TYPES, SKILL_TYPE_ID } from '../rules'
import type { EffectType } from '../rules'

const EFFECT_TYPES_KEY = 'effectTypes'

export function createSettingsRepository(db: AppDB) {
  return {
    /** Tipos de buff. Si nunca se editaron, los de fábrica. */
    async getEffectTypes(): Promise<EffectType[]> {
      const row = await db.settings.get(EFFECT_TYPES_KEY)
      return Array.isArray(row?.value) ? (row.value as EffectType[]) : DEFAULT_EFFECT_TYPES
    },

    /** Guarda los tipos. El tipo "habilidad" no se puede quitar. */
    async saveEffectTypes(types: EffectType[]): Promise<void> {
      if (!types.some((t) => t.id === SKILL_TYPE_ID)) {
        throw new Error('El tipo "habilidad" no se puede quitar.')
      }
      if (types.some((t) => t.name.trim() === '')) throw new Error('Los tipos necesitan nombre.')
      await db.settings.put({ key: EFFECT_TYPES_KEY, value: types })
    },
  }
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>
