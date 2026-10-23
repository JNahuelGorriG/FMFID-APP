import type { AppDB, ChangeRecord } from './db'
import { deepEqual } from './changes'
import { getIn, setIn } from './paths'
import type { Character } from '../rules'

const newId = (): string => crypto.randomUUID()
const now = (): string => new Date().toISOString()

/** Claves opcionales del personaje que pueden no existir todavía. */
export const OPTIONAL_PATHS: ReadonlySet<string> = new Set([
  'derived.magicDefenseWeights',
  'derived.agilityStat',
  'tree',
  'superStats',
])

export type NewCharacter = Omit<Character, 'id' | 'createdAt' | 'updatedAt'>

export function createRepository(db: AppDB) {
  return {
    async create(data: NewCharacter): Promise<Character> {
      const stamp = now()
      const character: Character = { ...data, id: newId(), createdAt: stamp, updatedAt: stamp }
      await db.characters.add(character)
      return character
    },

    get(id: string): Promise<Character | undefined> {
      return db.characters.get(id)
    },

    list(options: { includeRetired?: boolean } = {}): Promise<Character[]> {
      return db.characters
        .toArray()
        .then((all) => (options.includeRetired ? all : all.filter((c) => !c.retired)))
        .then((all) => all.sort((a, b) => a.name.localeCompare(b.name)))
    },

    /**
     * Aplica varios cambios a un personaje en una sola operación (todo o nada) y deja
     * un registro en el historial por cada dato que cambió. Si un valor no cambia, lo ignora.
     * Las rutas deben existir, salvo las opcionales de OPTIONAL_PATHS.
     */
    async applyChanges(
      characterId: string,
      changes: { path: string; value: unknown }[],
      reason: string,
    ): Promise<ChangeRecord[]> {
      return db.transaction('rw', db.characters, db.changes, async () => {
        const original = await db.characters.get(characterId)
        if (!original) throw new Error('Personaje inexistente.')

        const stamp = now()
        let updated = original
        const records: ChangeRecord[] = []

        for (const { path, value } of changes) {
          const optional = OPTIONAL_PATHS.has(path)
          const oldValue = getIn(updated, path, optional)
          if (deepEqual(oldValue, value)) continue
          updated = setIn(updated, path, value, optional)
          records.push({ id: newId(), characterId, at: stamp, path, oldValue, newValue: value, reason })
        }

        if (records.length > 0) {
          await db.characters.put({ ...updated, updatedAt: stamp })
          await db.changes.bulkAdd(records)
        }
        return records
      })
    },

    /** Cambia un solo dato. Equivale a applyChanges con un cambio. */
    async setValue(
      characterId: string,
      path: string,
      value: unknown,
      reason: string,
    ): Promise<ChangeRecord | null> {
      const [record] = await this.applyChanges(characterId, [{ path, value }], reason)
      return record ?? null
    },

    /** Historial de un personaje, del más nuevo al más viejo. */
    async history(characterId: string): Promise<ChangeRecord[]> {
      const rows = await db.changes.where('characterId').equals(characterId).toArray()
      return rows.sort((a, b) => b.at.localeCompare(a.at))
    },

    async remove(characterId: string): Promise<void> {
      await db.transaction('rw', db.characters, db.changes, async () => {
        await db.changes.where('characterId').equals(characterId).delete()
        await db.characters.delete(characterId)
      })
    },
  }
}

export type CharacterRepository = ReturnType<typeof createRepository>
