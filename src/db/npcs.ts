import type { AppDB } from './db'
import type { NewNpc, Npc } from '../rules'

export function createNpcRepository(db: AppDB) {
  return {
    async create(data: NewNpc): Promise<Npc> {
      const stamp = new Date().toISOString()
      const npc: Npc = { ...data, id: crypto.randomUUID(), createdAt: stamp, updatedAt: stamp }
      await db.npcs.add(npc)
      return npc
    },

    get(id: string): Promise<Npc | undefined> {
      return db.npcs.get(id)
    },

    /** Lista ordenada por nombre. Con `query`, filtra por nombre, rol, reino, gremio, raza o ocupación. */
    async list(query = ''): Promise<Npc[]> {
      const all = (await db.npcs.toArray()).sort((a, b) => a.name.localeCompare(b.name))
      const q = query.trim().toLowerCase()
      if (q === '') return all
      return all.filter((n) =>
        [n.name, n.role, n.rank, n.realm, n.guild, n.race, n.occupation, n.affiliation].some((field) =>
          field.toLowerCase().includes(q),
        ),
      )
    },

    /** Guarda los cambios de un NPC (lo reemplaza entero) y actualiza su fecha. */
    async save(npc: Npc): Promise<void> {
      await db.npcs.put({ ...npc, updatedAt: new Date().toISOString() })
    },

    async remove(id: string): Promise<void> {
      await db.npcs.delete(id)
    },
  }
}

export type NpcRepository = ReturnType<typeof createNpcRepository>
