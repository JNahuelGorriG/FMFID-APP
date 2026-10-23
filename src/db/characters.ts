import type { AppDB, ChangeRecord } from './db'
import { getIn, setIn } from './paths'
import type { Character } from '../rules'

const newId = (): string => crypto.randomUUID()
const now = (): string => new Date().toISOString()

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
     * Cambia un dato del personaje y deja el registro en el historial.
     * Si el valor no cambia, no hace nada. La ruta debe existir (por ejemplo
     * "sources.fuerza.entrenamiento" o "energy.bonusMana").
     */
    async setValue(
      characterId: string,
      path: string,
      value: unknown,
      reason: string,
    ): Promise<ChangeRecord | null> {
      return db.transaction('rw', db.characters, db.changes, async () => {
        const current = await db.characters.get(characterId)
        if (!current) throw new Error('Personaje inexistente.')

        const oldValue = getIn(current, path)
        if (Object.is(oldValue, value)) return null

        const stamp = now()
        await db.characters.put({ ...setIn(current, path, value), updatedAt: stamp })

        const record: ChangeRecord = {
          id: newId(),
          characterId,
          at: stamp,
          path,
          oldValue,
          newValue: value,
          reason,
        }
        await db.changes.add(record)
        return record
      })
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
