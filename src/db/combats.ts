import type { AppDB } from './db'
import { newCombat } from '../rules'
import type { Combat } from '../rules'

export function createCombatRepository(db: AppDB) {
  return {
    async create(name: string): Promise<Combat> {
      const combat = newCombat(name)
      await db.combats.add(combat)
      return combat
    },

    get(id: string): Promise<Combat | undefined> {
      return db.combats.get(id)
    },

    /** Más recientes primero. */
    async list(): Promise<Combat[]> {
      const all = await db.combats.toArray()
      return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    /**
     * Aplica un cambio a un combate y lo guarda. Lee y escribe en una sola operación,
     * así que dos cambios seguidos no se pisan.
     */
    async update(id: string, change: (combat: Combat) => Combat): Promise<Combat> {
      return db.transaction('rw', db.combats, async () => {
        const combat = await db.combats.get(id)
        if (!combat) throw new Error('Combate inexistente.')
        const next = { ...change(combat), updatedAt: new Date().toISOString() }
        await db.combats.put(next)
        return next
      })
    },

    async remove(id: string): Promise<void> {
      await db.combats.delete(id)
    },
  }
}

export type CombatRepository = ReturnType<typeof createCombatRepository>
